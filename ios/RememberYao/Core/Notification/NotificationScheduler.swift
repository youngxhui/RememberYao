import Foundation
import UserNotifications

/// 本地通知调度。
///
/// 与 Expo 版 `src/lib/notifications.ts` 的调度规则逐条对齐：
/// - 每次重排先取消全部已调度通知，再逐条重排
/// - 总开关关闭时只清空不调度
/// - 触发时间 = max(计划时间 or 宽限期结束, 稍后提醒时刻)
/// - 免打扰只压声音，不压通知本身 —— 漏服是安全相关的事
/// - 连续漏服达到阈值的成员补发一条即时通知，且只在连击重新攒起来时再响
///
/// 串行执行：连续的数据变更会合并成几次重排，不会并发取消 / 调度。
@MainActor
public final class NotificationScheduler {
  public static let shared = NotificationScheduler()

  /// 通知分类标识，操作按钮（已服用 / 跳过）挂在这个分类上。
  private let categoryID = "medication-reminder"
  private let actionTaken = "action-taken"
  private let actionSkip = "action-skip"
  private let missedStreakPrefix = "missed-streak-"

  private var resyncChain: Task<Void, Never> = Task {}
  /// 上一轮同步时已提醒过的「连续漏服」成员，避免每次重排都重复弹一条。
  private var alertedStreaks = Set<String>()

  private init() {}

  // MARK: - 初始化

  /// 注册带文案的分类与操作按钮。
  ///
  /// 单独抽出来是因为语言切换后要重跑一次，否则通知栏仍显示旧语言的按钮。
  public func registerLocalizedTexts() {
    let t = L10n.translator
    let taken = UNNotificationAction(
      identifier: actionTaken,
      title: t("notification.actionTaken"),
      options: [.foreground])
    let skip = UNNotificationAction(
      identifier: actionSkip,
      title: t("notification.actionSkip"),
      options: [.foreground])
    let category = UNNotificationCategory(
      identifier: categoryID,
      actions: [taken, skip],
      intentIdentifiers: [],
      options: [])
    UNUserNotificationCenter.current().setNotificationCategories([category])
  }

  /// 当前是否已获得通知权限。
  public func isAuthorized() async -> Bool {
    await withCheckedContinuation { continuation in
      UNUserNotificationCenter.current().getNotificationSettings { settings in
        continuation.resume(returning: settings.authorizationStatus == .authorized)
      }
    }
  }

  /// 请求通知权限；已授权时直接返回 true。
  @discardableResult
  public func requestAuthorization() async -> Bool {
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    if settings.authorizationStatus == .authorized { return true }
    return await withCheckedContinuation { continuation in
      UNUserNotificationCenter.current().requestAuthorization(
        options: [.alert, .sound, .badge]
      ) { granted, _ in
        continuation.resume(returning: granted)
      }
    }
  }

  // MARK: - 重排

  /// 读取最新数据并重排通知；串行执行，连续变更会合并为几次重排。
  public func resync() async {
    let previous = resyncChain
    resyncChain = Task {
      _ = await previous.value
      await self.performResync()
    }
    await resyncChain.value
  }

  private func performResync() async {
    let input = await AppEnvironment.shared.store.scheduleInput()
    await rescheduleReminders(input)
    await notifyMissedStreaks(input)
  }

  /// 按当前数据重排全部未来的提醒通知。
  private func rescheduleReminders(_ input: ScheduleInput) async {
    let center = UNUserNotificationCenter.current()
    center.removeAllPendingNotificationRequests()
    // 总开关关掉就到此为止：清空已排的，未来的也不再排。
    // 这里必须 return，否则会顺手把静音/免打扰的判断也跳过了
    guard input.settings.notificationsEnabled else { return }

    let t = L10n.translator
    let now = Date()
    let medications = Dictionary(uniqueKeysWithValues: input.medications.map { ($0.id, $0) })
    let persons = Dictionary(uniqueKeysWithValues: input.persons.map { ($0.id, $0) })

    // 先算出每条提醒的真实触发时刻，按时间升序排，再只取最近的 N 条。
    //
    // 不能直接把 7 天的 pending 提醒全塞进去：iOS 对「待触发通知」有 64 条
    // 硬上限，超出的 `add()` 静默丢弃 —— 一个家庭 3 人 × 4 味药 × 每天 3 次
    // × 7 天就是 252 条，第 65 条之后的提醒会**无声无息地不响**。
    // 只排最近的一段，剩下的靠 `sceneDidBecomeActive` 和每次写操作后的
    // resync 把窗口往前滚（用户点开 App 或点通知就会补上后面的）。
    var upcoming: [(at: Date, reminder: Reminder)] = []
    for reminder in input.reminders where reminder.status == .pending {
      guard let due = reminder.dueDate, let miss = reminder.missDate else { continue }
      let snoozed = reminder.snoozedUntil.flatMap(ISO8601.parse) ?? Date.distantPast
      let base = due > now ? due : miss
      let at = snoozed > now ? max(base, snoozed) : base
      guard at > now else { continue }
      upcoming.append((at, reminder))
    }
    upcoming.sort { $0.at < $1.at }

    for entry in upcoming.prefix(Domain.maxPendingNotifications) {
      let reminder = entry.reminder
      let at = entry.at
      let overdue = reminder.dueDate.map { $0 <= now } ?? false
      let medication = medications[reminder.medicationId]
      let person = persons[reminder.personId]
      // 免打扰只压掉声音，不压掉通知本身
      let silent = !input.settings.soundEnabled || inQuietHours(input.settings, Clock.time(at))
      let amount = "\(reminder.doseAmount)\(medication.map { L10n.unitLabel($0.unit) } ?? "")"

      let content = UNMutableNotificationContent()
      content.title = t(overdue ? "notification.titleOverdue" : "notification.title")
      content.body = t(
        "notification.body",
        [
          "person": person?.name ?? t("notification.defaultPerson"),
          "medication": medication?.name ?? t("notification.defaultMedication"),
          "amount": amount,
        ])
      content.userInfo = ["reminderId": reminder.id]
      content.sound = silent ? nil : .default
      content.categoryIdentifier = categoryID

      let components = Calendar.current.dateComponents(
        [.year, .month, .day, .hour, .minute, .second], from: at)
      let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
      let request = UNNotificationRequest(
        identifier: reminder.id, content: content, trigger: trigger)
      try? await center.add(request)
    }
  }

  /// 补一条「某人连续漏服」的即时通知。
  ///
  /// 与常规提醒分开：它不挂在某个具体剂量上，而是在重排时发现成员的漏服连击
  /// 达到阈值就立刻发一次。用 `alertedStreaks` 记住已提醒的人，只有当连击
  /// 「重新攒起来」时才会再响，避免每次重排都刷屏。
  private func notifyMissedStreaks(_ input: ScheduleInput) async {
    let settings = input.settings
    // 阈值关掉时清空记忆，用户重新打开后不会收到一串补发的提醒
    guard settings.missedAlertStreak > 0 else {
      alertedStreaks = []
      return
    }
    guard settings.notificationsEnabled else { return }

    let streaks = missedStreaks(input.reminders, threshold: settings.missedAlertStreak)
    // 本轮不再命中的成员（用户已经处理完了）从记忆里移除，
    // 这样下次重新攒够会正常再提醒
    alertedStreaks = alertedStreaks.intersection(streaks)

    let fresh = streaks.subtracting(alertedStreaks)
    guard !fresh.isEmpty else { return }
    alertedStreaks = streaks

    let names = fresh.compactMap { id in
      input.persons.first { $0.id == id }?.name
    }
    guard !names.isEmpty else { return }

    let t = L10n.translator
    let content = UNMutableNotificationContent()
    content.title = t("notification.missedStreakTitle")
    content.body = t(
      "notification.missedStreakBody",
      [
        "person": names.joined(separator: L10n.current.listSeparator),
        "count": "\(settings.missedAlertStreak)",
      ])
    content.sound = settings.soundEnabled ? .default : nil

    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
    let request = UNNotificationRequest(
      identifier: missedStreakPrefix + fresh.sorted().joined(separator: ","),
      content: content,
      trigger: trigger
    )
    try? await UNUserNotificationCenter.current().add(request)
  }

  // MARK: - 通知交互

  /// 点击「已服用 / 跳过」按钮后直接落库并重排通知。
  ///
  /// 收两个字符串而不是 `UNNotificationResponse`：后者不是 `Sendable`，
  /// 从通知回调线程传进来会触发隔离报错。
  /// 点击通知本体（打开 App）无需处理，由 App 内界面操作。
  public func handleResponse(reminderId: String?, actionIdentifier: String) {
    guard let reminderId,
      actionIdentifier == actionTaken || actionIdentifier == actionSkip
    else { return }

    Task {
      switch actionIdentifier {
      case actionTaken:
        await AppEnvironment.shared.store.take(reminderId)
      case actionSkip:
        await AppEnvironment.shared.store.skip(reminderId)
      default:
        break
      }
      await resync()
    }
  }
}
