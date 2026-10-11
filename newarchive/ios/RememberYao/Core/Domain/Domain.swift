import Foundation

/// 领域常量。改这里必须同步 `docs/domain-spec.md` 第 2 节。
public enum Domain {
  /// 宽限期（分钟）：到点后这么久仍未处理才标记为漏服。
  public static let graceMinutes = 60
  /// 提醒保留天数：更早的已处理提醒会被清理，服用记录永久保留。
  public static let reminderKeepDays = 90
  /// 低库存阈值：按当前计划估算剩余可服用天数 ≤ 该值时视为库存不足。
  public static let lowStockDays = 3
  /// 提前生成的天数（含今天）。
  public static let generateAheadDays = 7
  /// 每板单边格数上限：防手滑填出 100×100 的「药板」把网格和账一起撑坏。
  public static let maxPackSide = 12
  /// 补货板数上限。
  public static let maxPackCount = 20
  /// iOS「待触发通知」硬上限是 64 条，超出部分 `add()` 静默丢弃。
  /// 留 4 条余量给漏服连击等即时通知，提醒只排最近的这么多条。
  public static let maxPendingNotifications = 60

  /// 头像色板。姓名 → 稳定取色，重名同色。
  public static let personAvatarColors = [
    "#0F766E", "#D97706", "#DC2626", "#2563EB", "#7C3AED", "#DB2777",
  ]

  /// 药饼 / 胶囊配色：按药品 id 稳定取色（重录同药同色，改名不改色）。
  /// `body` 是片身或胶囊体，`cap` 是胶囊帽，`score` 是药饼的压痕线。
  public struct PillTint: Sendable, Equatable {
    public let body: String
    public let cap: String
    public let score: String

    public init(body: String, cap: String, score: String) {
      self.body = body
      self.cap = cap
      self.score = score
    }
  }

  public static let pillTints: [PillTint] = [
    PillTint(body: "#FDFDFA", cap: "#F2DFB4", score: "#E5DEC9"),
    PillTint(body: "#FFF6DE", cap: "#F2C94C", score: "#E8D49A"),
    PillTint(body: "#FDEBEB", cap: "#E86A6A", score: "#EFC3C3"),
    PillTint(body: "#FFF1D6", cap: "#F2994A", score: "#EBD2A6"),
    PillTint(body: "#EAF2FD", cap: "#4A7FD4", score: "#C9D9F0"),
    PillTint(body: "#EDF7EF", cap: "#5FA777", score: "#CDE6D5"),
  ]

  /// 设置可选的稍后提醒间隔（分钟）。首项是默认值 10。
  public static let snoozeOptions = [10, 15, 30, 60]

  /// 新建配置的默认服用时间。
  public static let defaultTimes = ["08:00", "12:00", "18:00", "21:00", "10:00", "15:00"]

  /// 药品已被删除时的历史占位名。
  public static let deletedMedicationName = "已删除的药品"
  /// 用药人已被删除时的历史占位名。
  public static let deletedPersonName = "已删除的用药人"
}

// MARK: - 稳定 hash 取色

/// 姓名 → 取色索引：对字符串做稳定的 31 倍滚动 hash，再对色板长度取模。
///
/// 纯函数，同名恒得同色。用 UTF-16 code unit 累加，跨运行 / 跨语言稳定。
///
/// ⚠️ 返回值**只取低 31 位**（掩掉符号位），不是 `abs(h)`：
/// `Int32.min` 取绝对值在 Swift 里直接 trap，而 Kotlin 的 `abs(Int.MIN_VALUE)`
/// 会原样返回负数、取模出负下标越界。掩符号位两端逐位一致且必然非负。
public func stableHash(_ s: String) -> Int {
  var h: Int32 = 0
  for unit in s.utf16 {
    h = h &* 31 &+ Int32(unit)
  }
  return Int(h & Int32(bitPattern: 0x7FFF_FFFF))
}

/// 按姓名 hash 从头像色板取色（重名同色）。替代早先按创建顺序轮询 ——
/// 姓名不变色就稳定，不会因为前面增删成员而变色。
public func pickAvatarColor(name: String) -> String {
  let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !Domain.personAvatarColors.isEmpty else { return "#0F766E" }
  let index = stableHash(trimmed) % Domain.personAvatarColors.count
  return Domain.personAvatarColors[index]
}

/// 按药品 id hash 从药饼干配色取色。
public func pickPillTint(id: String) -> Domain.PillTint {
  guard !Domain.pillTints.isEmpty else {
    return Domain.PillTint(body: "#FDFDFA", cap: "#F2DFB4", score: "#E5DEC9")
  }
  return Domain.pillTints[stableHash(id) % Domain.pillTints.count]
}

// MARK: - 日期 / 时间

/// 全项目禁止引入日期库，日期运算只允许这几个函数。
public enum DateKey {
  /// 本地时区的「今天」。
  public static func today() -> String { key(Date()) }

  /// Date → 本地 YYYY-MM-DD。
  public static func key(_ date: Date) -> String {
    let cal = Calendar.current
    let y = cal.component(.year, from: date)
    let m = cal.component(.month, from: date)
    let d = cal.component(.day, from: date)
    return String(format: "%04d-%02d-%02d", y, m, d)
  }

  /// YYYY-MM-DD ± n 天。
  public static func addDays(_ key: String, _ days: Int) -> String {
    guard let base = date(key) else { return key }
    let cal = Calendar.current
    guard let shifted = cal.date(byAdding: .day, value: days, to: base) else { return key }
    return self.key(shifted)
  }

  /// "YYYY-MM-DD" → 本地 Date（当天 00:00）。
  public static func date(_ key: String) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    var comps = DateComponents()
    comps.year = parts[0]
    comps.month = parts[1]
    comps.day = parts[2]
    comps.hour = 0
    comps.minute = 0
    comps.second = 0
    return Calendar.current.date(from: comps)
  }

  /// 解析 "YYYY-MM-DD" + "HH:MM" 为本地 Date。
  public static func dateTime(_ key: String, _ time: String) -> Date? {
    guard let day = date(key) else { return nil }
    let parts = time.split(separator: ":").compactMap { Int($0) }
    guard !parts.isEmpty else { return day }
    let cal = Calendar.current
    return cal.date(
      bySettingHour: parts[0],
      minute: parts.count > 1 ? parts[1] : 0,
      second: 0,
      of: day)
  }

  /// 本周起始日（周一）的日期 key。ISO 周以周一为首日。
  public static func weekStart(_ today: String = DateKey.today()) -> String {
    guard let d = date(today) else { return today }
    // 周日 = 1，转成「周一 = 0」再回退
    let weekday = Calendar.current.component(.weekday, from: d)
    let offset = (weekday + 5) % 7
    return addDays(today, -offset)
  }

  /// 比较两个 "HH:MM"。字典序等价于时间序，且不依赖 locale。
  public static func compareTime(_ a: String, _ b: String) -> ComparisonResult {
    a.compare(b, options: [.literal])
  }
}

/// 时间工具（"HH:MM" ↔ Date）。
public enum Clock {
  /// Date → "HH:MM"。
  public static func time(_ date: Date) -> String {
    let cal = Calendar.current
    return String(
      format: "%02d:%02d",
      cal.component(.hour, from: date),
      cal.component(.minute, from: date))
  }

  /// "HH:MM" → 今天的这个时刻。
  public static func date(_ time: String) -> Date {
    let parts = time.split(separator: ":").compactMap { Int($0) }
    let cal = Calendar.current
    return cal.date(
      bySettingHour: parts.count > 0 ? parts[0] : 0,
      minute: parts.count > 1 ? parts[1] : 0,
      second: 0,
      of: Date()) ?? Date()
  }

  /// 取前 n 个默认时间。
  public static func defaultTimes(_ count: Int) -> [String] {
    Array(Domain.defaultTimes.prefix(max(0, count)))
  }
}

// MARK: - 配置生效与状态

extension MedicationPlan {
  /// 配置在指定日期是否生效。
  public func isActive(on key: String) -> Bool {
    guard enabled else { return false }
    if key < startDate { return false }
    if let endDate, key > endDate { return false }
    return true
  }

  /// 配置的展示状态：停用 / 已结束 / 服用中。
  public var statusKey: String {
    if !enabled { return "plan.statusDisabled" }
    if let endDate, endDate < DateKey.today() { return "plan.statusEnded" }
    return "plan.statusActive"
  }
}

// MARK: - 提醒派生时间

extension Reminder {
  /// 提醒的计划服用时间。
  public var dueDate: Date? { DateKey.dateTime(date, time) }

  /// 提醒的漏服判定时间（计划时间 + 宽限期）。
  public var missDate: Date? {
    guard let due = dueDate else { return nil }
    return Calendar.current.date(
      byAdding: .minute, value: Domain.graceMinutes, to: due)
  }

  /// 该提醒是否处于「稍后提醒」中（推迟时刻还没到）。
  public func isSnoozed(now: Date = Date()) -> Bool {
    guard let snoozedUntil else { return false }
    return ISO8601.parse(snoozedUntil)?.compare(now) == .orderedDescending
  }
}

// MARK: - 库存

extension Medication {
  /// 库存充裕度：只看「还剩多少」，不看还能吃几天。
  ///
  /// `totalQuantity` 为 0（没记库存）时按 `critical` 处理：把 0 库存说成充足
  /// 比说成缺货更糟。
  public var stockLevel: StockLevel {
    let ratio = totalQuantity > 0 ? Double(remainingQuantity) / Double(totalQuantity) : 0
    if ratio <= 0.15 { return .critical }
    if ratio <= 0.30 { return .low }
    return .ok
  }
}

/// 按当前生效配置估算某药品的消耗与剩余天数。
public struct StockSummary: Sendable, Equatable {
  public let dailyDose: Int
  /// 还能吃几天；没有生效配置时为 `nil`。
  public let daysLeft: Int?
  public let low: Bool

  public init(dailyDose: Int, daysLeft: Int?, low: Bool) {
    self.dailyDose = dailyDose
    self.daysLeft = daysLeft
    self.low = low
  }
}

/// 按当前生效配置估算某药品的消耗与剩余天数。
///
/// 与 `Medication.stockLevel` 是两个维度，别混用 —— 后者只依赖库存自身，
/// 前者依赖「有人在吃这个药」。
public func stockSummary(_ medication: Medication, _ plans: [MedicationPlan]) -> StockSummary
{
  let today = DateKey.today()
  let dailyDose = plans
    .filter { $0.medicationId == medication.id && $0.isActive(on: today) }
    .reduce(0) { $0 + $1.doseAmount * $1.times.count }
  let daysLeft = dailyDose > 0 ? medication.remainingQuantity / dailyDose : nil
  return StockSummary(
    dailyDose: dailyDose,
    daysLeft: daysLeft,
    low: daysLeft.map { $0 <= Domain.lowStockDays } ?? false
  )
}

// MARK: - 板装孪生

/// 夹紧每板行列：板是物理实体，1~12 之间。
public func clampSide(_ n: Int) -> Int {
  min(max(n, 1), Domain.maxPackSide)
}

extension Array where Element == BlisterSlot {
  /// 板的展示状态：由槽位推导，不落库。
  public func packStatus() -> PackStatus {
    if isEmpty { return .sealed }
    if !contains(where: { $0.status == .full }) { return .consumed }
    return contains(where: { $0.status != .full }) ? .open : .sealed
  }
}

/// 某药品的孪生概览。
public struct BlisterSummary: Sendable, Equatable {
  /// 是否已建孪生。
  public let enabled: Bool
  public let packCount: Int
  /// 每板格数（取第一板；同药各板规格一致，只有老板可能不同）。
  public let slotsPerPack: Int
  public let totalSlots: Int
  public let fullSlots: Int
  /// 下一块要开的板（还有药的板里序号最小）；`nil` = 全部吃完。
  public let openPack: BlisterPack?

  public init(
    enabled: Bool,
    packCount: Int,
    slotsPerPack: Int,
    totalSlots: Int,
    fullSlots: Int,
    openPack: BlisterPack?
  ) {
    self.enabled = enabled
    self.packCount = packCount
    self.slotsPerPack = slotsPerPack
    self.totalSlots = totalSlots
    self.fullSlots = fullSlots
    self.openPack = openPack
  }
}

public func blisterSummary(
  _ medication: Medication,
  _ packs: [BlisterPack],
  _ slots: [BlisterSlot]
) -> BlisterSummary {
  let own = packs.filter { $0.medicationId == medication.id }.sorted { $0.seq < $1.seq }
  let packIds = Set(own.map(\.id))
  let ownSlots = slots.filter { packIds.contains($0.packId) }
  return BlisterSummary(
    enabled: !own.isEmpty,
    packCount: own.count,
    slotsPerPack: own.first.map { $0.rows * $0.cols } ?? 0,
    totalSlots: ownSlots.count,
    fullSlots: ownSlots.filter { $0.status == .full }.count,
    openPack: own.first { pack in
      ownSlots.contains { $0.packId == pack.id && $0.status == .full }
    }
  )
}

/// 按「板序 → 格序」取前 count 个 full 槽位 —— 泡罩从左到右、从上到下消耗，
/// 与真人嗑药片的顺序一致。
public func nextFullSlots(
  _ packs: [BlisterPack],
  _ slots: [BlisterSlot],
  count: Int
) -> [BlisterSlot] {
  guard count > 0 else { return [] }
  let ordered = packs.sorted { $0.seq < $1.seq }
  var result: [BlisterSlot] = []
  for pack in ordered {
    let packSlots = slots
      .filter { $0.packId == pack.id && $0.status == .full }
      .sorted { $0.index < $1.index }
    for slot in packSlots {
      if result.count >= count { return result }
      result.append(slot)
    }
  }
  return result
}

// MARK: - 统计

/// 一周服药统计：服药率 + 按时数 + 漏服数。
public struct WeekStats: Sendable, Equatable {
  /// 服药率 0–100，整数。
  public let adherence: Int
  /// 按时服用次数。
  public let taken: Int
  /// 漏服次数。
  public let missed: Int
  /// 跳过次数。
  public let skipped: Int
  /// 本周应服总次数（pending 也算）。
  public let planned: Int

  public init(adherence: Int, taken: Int, missed: Int, skipped: Int, planned: Int) {
    self.adherence = adherence
    self.taken = taken
    self.missed = missed
    self.skipped = skipped
    self.planned = planned
  }
}

/// 统计从 `from`（含）到 `to`（含）的服药情况。
///
/// 「应服」= 该区间内所有提醒（pending 也算），「按时」= 已服用，
/// 「漏服」= 已判漏服，跳过既不计按时也不计漏服。
public func weekStats(_ reminders: [Reminder], from: String, to: String) -> WeekStats {
  let inRange = reminders.filter { $0.date >= from && $0.date <= to }
  let taken = inRange.filter { $0.status == .taken }.count
  let missed = inRange.filter { $0.status == .missed }.count
  let skipped = inRange.filter { $0.status == .skipped }.count
  let planned = inRange.count
  return WeekStats(
    adherence: planned > 0 ? Int((Double(taken) / Double(planned) * 100).rounded()) : 0,
    taken: taken,
    missed: missed,
    skipped: skipped,
    planned: planned
  )
}

/// 找出「连续漏服达到阈值」的成员。
///
/// 按成员分组后，从最近的提醒往回数连续 missed 的条数，一旦遇到
/// taken / skipped 就中断 —— pending 也中断，因为「还没到点的剂量」不代表中间断过。
public func missedStreaks(_ reminders: [Reminder], threshold: Int) -> Set<String> {
  var result: Set<String> = []
  guard threshold > 0 else { return result }

  let byPerson = Dictionary(grouping: reminders, by: \.personId)
  for (personId, list) in byPerson {
    // 最新的排在前面，倒序扫 = 从现在往回数
    let sorted = list.sorted {
      ($0.date + "|" + $0.time) > ($1.date + "|" + $1.time)
    }
    var streak = 0
    for reminder in sorted {
      if reminder.status == .missed {
        streak += 1
        if streak >= threshold {
          result.insert(personId)
          break
        }
      } else if reminder.status != .pending {
        // 已服用或已跳过 → 连续记录被打断
        streak = 0
      } else {
        // 未来待服用不计入，也不打断
        break
      }
    }
  }
  return result
}

// MARK: - 免打扰

/// 免打扰时段是否覆盖给定的 "HH:MM"。
///
/// 跨零点的区间（如 22:00–07:00）要拆成两段比较，否则整段永远判为不在区间内。
public func inQuietHours(_ settings: Settings, _ hhmm: String) -> Bool {
  guard let start = settings.quietStart, let end = settings.quietEnd else { return false }
  if start == end { return false }
  if start < end {
    return hhmm >= start && hhmm < end
  }
  return hhmm >= start || hhmm < end
}
