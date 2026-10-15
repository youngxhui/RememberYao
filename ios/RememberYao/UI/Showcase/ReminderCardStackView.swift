import UIKit

// MARK: - 卡片数据派生

/// 一张提醒卡的展示数据。从 store 快照派生，与 Expo 版 `toCardItem` 同口径。
struct CardItem {
  let reminder: Reminder
  /// 顶部时间行：今天只显示 HH:MM，明天加「明天」，更早的显示月日时间。
  let timeLabel: String
  /// 状态徽章（已服用 / 未服用 / 已漏服 / 待服用 / 稍后提醒）。
  let stateLabel: String
  let stateTone: StatusTone
  let title: String
  /// 剂量行：单次剂量 + 备注。
  let doseLine: String
  let personName: String
  /// 卡色 = 用药人头像色（设计稿 --promo-accent 的个性化位），按人区分。
  let accent: UIColor
  let freqLine: String
  let stockLine: String
  let stockLow: Bool
}

/// 状态徽章的五种色调。与语义色一一对应，中性档给「已跳过」。
enum StatusTone {
  case success
  case warning
  case danger
  case primary
  case neutral

  var color: UIColor {
    switch self {
    case .success: return Theme.Color.success
    case .warning: return Theme.Color.warning
    case .danger: return Theme.Color.danger
    case .primary: return Theme.Color.primary
    case .neutral: return Theme.Color.labelSecondary
    }
  }

  var soft: UIColor {
    switch self {
    case .success: return Theme.Color.successSoft
    case .warning: return Theme.Color.warningSoft
    case .danger: return Theme.Color.dangerSoft
    case .primary: return Theme.Color.primarySoft
    case .neutral: return Theme.Color.backgroundSelected
    }
  }
}

/// 淘汰队列：只保留按（日期+时间）升序的前 max 条 pending/missed。
/// 手写插入而非 `sorted` —— Swift 的标准排序不保证稳定，同位次的相对顺序要可复现。
private func takeEarliest(_ list: [Reminder], limit: Int) -> [Reminder] {
  var out: [Reminder] = []
  for reminder in list {
    guard reminder.status == .pending || reminder.status == .missed else { continue }
    let key = reminder.date + reminder.time
    var index = 0
    while index < out.count {
      // 稳定升序：插在第一个比它大的前面（字典序比较，同 DateKey.compareTime）
      if (out[index].date + out[index].time).compare(key, options: [.literal])
        == .orderedDescending
      {
        break
      }
      index += 1
    }
    out.insert(reminder, at: index)
    if out.count > limit { out.removeLast() }
  }
  return out
}

/// "YYYY-MM-DD" → (月, 日)。
private func monthDay(_ key: String) -> (Int, Int) {
  (Int(key.dropFirst(5).prefix(2)) ?? 0, Int(key.suffix(2)) ?? 0)
}

// MARK: - 几何与节奏

/// 几何与节奏：与 `design/today.html` 的「提醒卡」区块同源。
private enum Geo {
  /// 设计稿固定三张堆叠，更多待办交给列表。
  static let maxCards = 3
  /// 触发换卡的滑动距离（pt）。
  static let threshold: CGFloat = 90
  /// 与设计稿一致：小于该位移视为点按，不劫持「已服用」。
  static let deadZone: CGFloat = 6
  /// 点按顶卡时的浮起距离（pt）。
  static let lift: CGFloat = 6
  /// 跟手阶段顶卡缩到的最小比例（设计稿 1 → 0.84）。
  static let frontScaleMin: CGFloat = 0.84
  /// 三个槽位的静止位（设计稿 is-front / is-mid / is-back）。
  static let slotY: [CGFloat] = [0, 16, 32]
  static let slotS: [CGFloat] = [1, 0.955, 0.91]
  /// 沉底后牌的横向溢出补偿（设计稿 .promo-stack padding-bottom: 30px）。
  static let stackPadBottom: CGFloat = 30
  /// 屏幕左右边距（与首页其它区块一致）。
  static let inset: CGFloat = Theme.Space.page
  /// 顶部留一点呼吸，投影不被导航栏切掉。
  static let topPad: CGFloat = 4

  // 指示器
  /// 指示器右缘距卡片右缘（对齐卡片内容右缘：边框 1 + padding 26）。
  static let indicatorRight: CGFloat = 27
  /// 未激活 9×9 圆点，激活 6×70 长条。
  static let segDot: CGFloat = 9
  static let segActiveW: CGFloat = 6
  static let segActiveH: CGFloat = 70
  static let segGap: CGFloat = 8
}

/// 动画时长（设计稿 CSS transition 的换算）。
@MainActor
private enum Beat {
  /// 换卡沉底：设计稿 swapping 620ms；reduced motion 下直接落位。
  static let swap: TimeInterval = 0.62
  /// 未过阈值弹回：设计稿 340ms。
  static let rebound: TimeInterval = 0.34
  /// 点按浮起 / 松开回落：220ms。
  static let float: TimeInterval = 0.22
  /// 指示器底色 linear 300ms。
  static let segColor: TimeInterval = 0.3

  static let swapEase = Motion.cubic(0.65, 0, 0.35, 1)
  static let reboundEase = Motion.cubic(0.22, 1, 0.36, 1)
}

// MARK: - 提醒卡堆叠

/// 提醒卡堆叠：接下来的待处理提醒上下堆叠，纵向滑动换卡。
///
/// 交互与视觉基准 = `design/today.html` 的「提醒卡」区块：
/// - 顶卡跟手并逐步缩小，越过 90pt 阈值后沉入牌堆后方，其余卡各前进一步；
/// - 右侧指示器固定原地不随卡片移动，仅高亮段与沉底同步 morph；
/// - 磨砂卡底 = `UIVisualEffectView` 实时背景模糊 + 半透明主题色叠染，
///   每卡按用药人头像色区分家庭成员。
///
/// 放在 `UI/Showcase/`：首页 `tableHeaderView` 的展示组件，不是列表/表单原语。
/// 接入约定：放进滚动区用（首页是 `tableHeaderView`，随页面一起滚走）。
/// 纵向拖动与 `UIScrollView` 的滚动手势同向，嵌进滚动屏时必须让滚动视图的
/// pan `require(toFail:)` 本视图的 `panGesture`：超过死区的纵向拖动由牌堆
/// 接管换卡，其余拖动照常滚页面 —— 与 Expo 版 RNGH Pan 在 ScrollView 里
/// 的抢占行为一致。
final class ReminderCardStackView: UIView {
  /// 任意写操作（标记服用）后的回调，供调用方 reload。
  var onTake: ((String) -> Void)?

  private var order: [String] = []
  private var visible: [Reminder] = []
  private var cards: [String: ReminderCardView] = [:]
  private var cardConstraints: [NSLayoutConstraint] = []

  /// 换卡状态机：0 静止 | 1 跟手 | 2 已过阈值、正在沉底。
  private var phase = 0
  private var dragY: CGFloat = 0
  /// 跟手原点 = 首个越过死区的 changed 的位移。跟手量在此基础上算，
  /// 死区余量不补发给卡片：engage 那一帧卡片不会先瞬移一下、再被按压
  /// 浮起拽回。0 = 本次触摸还没越过死区
  private var engageY: CGFloat = 0
  private var prog: CGFloat = 0
  private var press: CGFloat = 0
  /// 沉底中的卡片 id（压到最低、不可交互）；与 Expo 版 `sinking` 同义。
  private var sinkingID: String?

  private let indicator = StackIndicatorView()
  private var emptyConstraint: NSLayoutConstraint!
  /// 纵向换卡手势。嵌进滚动区时由外层拿去和滚动视图的 pan 协调
  /// （`require(toFail:)`），同向拖动才不会互相抢
  var panGesture: UIPanGestureRecognizer!
  private var impactGenerator: UIImpactFeedbackGenerator?

  // 点按浮起量自己按帧推进（与 RN worklet 逐帧读 shared value 同构）
  private var pressLink: CADisplayLink?
  private var pressFrom: CGFloat = 0
  private var pressTo: CGFloat = 0
  private var pressStart: CFTimeInterval = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    emptyConstraint = heightAnchor.constraint(equalToConstant: 0)
    emptyConstraint.isActive = true

    indicator.isHidden = true
    addSubview(indicator)

    panGesture = UIPanGestureRecognizer(target: self, action: #selector(handlePan))
    panGesture.delegate = self
    // 不取消按钮的 touch：手势一识别就 cancel 的话，死区内的小抖动也点不中
    // 「已服用」（Expo 版 RNGH Pan 未激活时 Pressable 照样能点）。拖动后的
    // 误触改由 dragConsumedTake 吞，见 configure 里的 onTake
    panGesture.cancelsTouchesInView = false
    addGestureRecognizer(panGesture)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    // CADisplayLink 强引用 target，离屏必须手动断，否则整图泄漏
    if window == nil {
      pressLink?.invalidate()
      pressLink = nil
    }
  }

  // MARK: - 配置

  /// 灌入提醒全集，组件自行筛出 pending/missed 并按时间取前三张。
  func configure(
    reminders: [Reminder], medications: [Medication], persons: [Person],
    plans: [MedicationPlan]
  ) {
    let nextVisible = takeEarliest(reminders, limit: Geo.maxCards)
    if nextVisible.map(\.id) == visible.map(\.id) {
      // 集合没变但内容可能变（pending → missed、库存变化）：刷新派生数据
      updateContents(visible: nextVisible, medications: medications, persons: persons, plans: plans)
      return
    }
    visible = nextVisible

    // 视觉顺序与数据联动：剪掉已消失的、补上新到的（渲染期完成，不进 effect）
    let ids = nextVisible.map(\.id)
    let kept = order.filter { ids.contains($0) }
    order = kept + ids.filter { !kept.contains($0) }
    for id in cards.keys where !order.contains(id) {
      cards.removeValue(forKey: id)?.removeFromSuperview()
    }

    emptyConstraint.isActive = order.isEmpty
    isHidden = order.isEmpty

    for (slot, id) in order.enumerated() {
      guard let reminder = nextVisible.first(where: { $0.id == id }) else { continue }
      let card = cards[id] ?? ReminderCardView()
      card.configure(
        item: cardItem(reminder, medications: medications, persons: persons, plans: plans),
        slot: slot)
      card.onTake = { [weak self, weak card] id in
        // 拖动后吞掉松手落在按钮上的误触（与 Expo 版 moved 同义）；
        // 死区内的小抖动不算拖动，照常点得中
        guard let self, let card, !card.dragConsumedTake else { return }
        self.onTake?(id)
      }
      if card.superview == nil {
        addSubview(card)
        cards[id] = card
      }
    }

    installCardConstraints()
    // 数据变化会让槽位平移（如标记服用后列表收缩），空闲态直接对齐新静止位。
    // 换卡轮转发生在 phase 2，此时动画目标已 = 新槽位静止位，不能覆盖
    if phase == 0 {
      for (slot, id) in order.enumerated() {
        cards[id]?.transform = slotTransform(slot)
      }
    }
    applyZAndInteraction()
    indicator.configure(ids: nextVisible.map(\.id))
    updateIndicator()
  }

  private func updateContents(
    visible: [Reminder], medications: [Medication], persons: [Person],
    plans: [MedicationPlan]
  ) {
    for (slot, id) in order.enumerated() {
      guard let reminder = visible.first(where: { $0.id == id }),
        let card = cards[id]
      else { continue }
      card.configure(
        item: cardItem(reminder, medications: medications, persons: persons, plans: plans),
        slot: slot)
    }
  }

  /// 卡片内容派生（Expo 版 `toCardItem` 的逐条对应）。
  private func cardItem(
    _ reminder: Reminder, medications: [Medication], persons: [Person],
    plans: [MedicationPlan]
  ) -> CardItem {
    let medication = medications.first { $0.id == reminder.medicationId }
    let person = persons.first { $0.id == reminder.personId }
    let plan = plans.first { $0.id == reminder.planId }
    let summary = medication.map { stockSummary($0, plans) }
    let unit =
      medication.map { L10n.unitLabel($0.unit) }
      ?? L10n.shared.t("medication.unitTablet")
    let notes = medication?.notes.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    let today = DateKey.today()
    let tomorrow = DateKey.addDays(today, 1)
    var timeLabel = reminder.time
    if reminder.date == tomorrow {
      timeLabel = "\(L10n.shared.t("records.tomorrow")) \(reminder.time)"
    } else if reminder.date != today {
      let (month, day) = monthDay(reminder.date)
      timeLabel = L10n.shared.t(
        "records.monthDayTime",
        ["month": "\(month)", "day": "\(day)", "time": reminder.time])
    }

    var stockLine = L10n.shared.t("plan.endDateUnlimited")
    if let daysLeft = summary?.daysLeft {
      stockLine = L10n.shared.t("records.stockDaysLeft", ["days": "\(daysLeft)"])
    } else if let endDate = plan?.endDate {
      let (month, day) = monthDay(endDate)
      stockLine = L10n.shared.t(
        "records.untilDate", ["month": "\(month)", "day": "\(day)"])
    }

    // 状态与列表 / 通知层同一套判定（pending 未到点 / 已过点、snoozed）
    let state: (label: String, tone: StatusTone)
    switch reminder.status {
    case .taken:
      state = (L10n.shared.t("reminder.taken"), .success)
    case .skipped:
      state = (L10n.shared.t("reminder.skipped"), .neutral)
    case .missed:
      state = (L10n.shared.t("reminder.missed"), .danger)
    case .pending:
      if reminder.isSnoozed() {
        state = (L10n.shared.t("reminder.snooze"), .primary)
      } else if let due = reminder.dueDate, due > Date() {
        state = (L10n.shared.t("reminder.pending"), .primary)
      } else {
        state = (L10n.shared.t("reminder.notTaken"), .warning)
      }
    }

    return CardItem(
      reminder: reminder,
      timeLabel: timeLabel,
      stateLabel: state.label,
      stateTone: state.tone,
      title: medication?.name ?? L10n.shared.t("home.unknownMedication"),
      // store 没有「规格」字段，剂量行 = 单次剂量 + 备注
      doseLine: notes.isEmpty
        ? "\(reminder.doseAmount)\(unit)"
        : "\(reminder.doseAmount)\(unit) · \(notes)",
      personName: person?.name ?? L10n.shared.t("home.unknownPerson"),
      accent: person.map { Theme.Color.hex($0.avatarColor) } ?? Theme.Color.primary,
      freqLine: L10n.shared.t("plan.perDay", ["count": "\(plan?.times.count ?? 1)"]),
      stockLine: stockLine,
      stockLow: summary?.low ?? false
    )
  }

  // MARK: - 布局

  /// 位置约束：顶卡在流内撑高度，其余卡绝对定位（top/left/right + 等高）。
  /// 换卡轮转会换「谁在流内」，约束整体重建一次；帧不变，不引起跳变。
  private func installCardConstraints() {
    NSLayoutConstraint.deactivate(cardConstraints)
    cardConstraints = []
    guard let frontID = order.first, let front = cards[frontID] else { return }
    for (slot, id) in order.enumerated() {
      guard let card = cards[id] else { continue }
      cardConstraints += [
        card.topAnchor.constraint(equalTo: topAnchor, constant: Geo.topPad),
        card.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Geo.inset),
        card.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Geo.inset),
      ]
      if slot == 0 {
        cardConstraints += [
          bottomAnchor.constraint(
            equalTo: card.bottomAnchor, constant: Geo.stackPadBottom)
        ]
      } else {
        cardConstraints += [card.heightAnchor.constraint(equalTo: front.heightAnchor)]
      }
    }
    NSLayoutConstraint.activate(cardConstraints)
  }

  /// z 序与可交互性：沉底中的顶卡压到所有卡之下（设计稿 sinking 时 zIndex: 0），
  /// 且只有顶卡可点。
  private func applyZAndInteraction() {
    for (slot, id) in order.enumerated() {
      let sinking = id == sinkingID
      cards[id]?.layer.zPosition = sinking ? 0 : CGFloat(Geo.maxCards - slot)
      cards[id]?.isUserInteractionEnabled = slot == 0 && !sinking
    }
    indicator.layer.zPosition = 5
  }

  private func slotTransform(_ slot: Int) -> CGAffineTransform {
    CGAffineTransform(translationX: 0, y: Geo.slotY[slot])
      .scaledBy(x: Geo.slotS[slot], y: Geo.slotS[slot])
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // 指示器纵向位置 = 卡片中段（标题区）顶边。三张卡结构等高，量到同一值
    refreshIndicatorTop()
    indicator.frame = CGRect(
      x: bounds.width - Geo.indicatorRight - Geo.segDot,
      y: indicatorTop ?? 0,
      width: Geo.segDot,
      height: indicatorTotalHeight
    )
    indicator.isHidden = order.count < 2 || indicatorTop == nil
  }

  /// 卡片中段（标题区）顶边的实测 y；首帧未测得时不渲染，避免闪到左上角。
  private var indicatorTop: CGFloat?

  private func refreshIndicatorTop() {
    guard let frontID = order.first, let front = cards[frontID] else { return }
    // 中段在卡内由 UIStackView 摆位，发生在本次布局通行的后段（父先子后）：
    // 不先让顶卡把内部布局走完就量，读到的是中段还没上位的陈旧帧（≈ 卡片
    // 顶边），整条指示器就钉死在时间行那一档，对不上 Expo 版的位置。
    // 强制一次内部布局再实测，时机与 Expo 版 onLayout 的上报等价
    front.layoutIfNeeded()
    // 卡片在牌堆里的 AL 顶边恒为 topPad（槽位偏移全走 transform），中段偏移
    // 取卡内坐标 —— 两者都不含 transform，指示器因此钉死在牌堆上，不随
    // 卡片拖动 / 沉底移动（设计稿硬要求；convert 会把 transform 算进去）
    let top = Geo.topPad + front.midView.frame.minY
    guard indicatorTop != top else { return }
    indicatorTop = top
  }

  private func updateIndicator() {
    refreshIndicatorTop()
    setNeedsLayout()
    guard let frontID = order.first,
      let index = visible.firstIndex(where: { $0.id == frontID })
    else { return }
    // 指示器高亮段 = 当前顶卡在可见列表中的下标，由 order 推导而非自由
    // 计数器：列表收缩 / 补充（标记服用、新提醒到达）时自动跟随，不会错位
    indicator.setActive(index, reduced: Motion.reduced)
  }

  private var indicatorTotalHeight: CGFloat {
    guard !order.isEmpty else { return 0 }
    var h: CGFloat = 0
    for i in 0..<order.count {
      h += (i == indicator.active ? Geo.segActiveH : Geo.segDot) + Geo.segGap
    }
    return h - Geo.segGap
  }

  // MARK: - 手势

  @objc private func handlePan(_ gesture: UIPanGestureRecognizer) {
    switch gesture.state {
    case .began:
      phase = 1
      dragY = 0
      prog = 0
      // 死区穿越点由首个越过死区的 changed 背下；0 = 还没越过
      engageY = 0
      // 沉底动画可能没跑完就再次触摸：先冻结在当前位再跟手
      cards.values.forEach { $0.stopTransformAnimations() }
      animatePress(to: 1)
      impactGenerator = UIImpactFeedbackGenerator(style: .light)
      impactGenerator?.prepare()
      applyFollow()

    case .changed:
      // phase 离开 1 后不再跟手（Expo 的 onUpdate 同款早退），否则会踩掉
      // 正在跑的沉底动画
      guard phase == 1 else { return }
      let translation = gesture.translation(in: self).y
      // 死区内不挪卡片，但手势保持识别：此时让 recognizer 失败（回 shouldBegin
      // 判死区）在滚动区里等于把这次触摸交给表格滚动，且失败不可逆。与 Expo
      // 版 activeOffsetY 的「等待」语义一致。engage 之后不再复查死区 ——
      // 手指划回起点以下也跟着回，交给松手时的弹回
      if engageY == 0 {
        guard abs(translation) > Geo.deadZone else { return }
        engageY = translation
        // 越过死区 = 真拖动：标记顶卡，吞掉之后松手落在按钮上的误触
        if let frontID = order.first {
          cards[frontID]?.dragConsumedTake = true
        }
      }
      // 阈值判定仍用「距触摸起点」的总位移（与 Expo 的 translationY 同口径），
      // 保证 90pt 换卡的触发距离不变
      prog = min(1, abs(translation) / Geo.threshold)
      // 跟手量 = 总位移 − 死区余量，且随 prog 收敛：小位移时平滑起步
      // （卡片不瞬移），逼近阈值时与手指 1:1，沉底动画的起始帧也跟手对齐
      dragY = translation - engageY * (1 - prog)
      if abs(translation) >= Geo.threshold {
        phase = 2
        // 阈值穿越 = 沉底开始：commit 触感与动画同帧
        impactGenerator?.impactOccurred()
        impactGenerator = nil
        sinkingID = order.first
        commitSink()
      } else {
        applyFollow()
      }

    case .ended, .cancelled, .failed:
      animatePress(to: 0)
      impactGenerator = nil
      if phase == 2 {
        // phase 停在 2 直到下次触摸：轮转 + 清 sinking 与 Expo 的 rotate() 同帧，
        // 子卡的沉底动画继续跑完
        rotate()
      } else if phase == 1 {
        phase = 0
        rebound()
      }

    default:
      break
    }
  }

  /// 跟手公式：与设计稿 pointermove 的三段 lerp 同构，顶卡叠加点按浮起。
  private func applyFollow() {
    for (slot, id) in order.enumerated() {
      guard let card = cards[id] else { continue }
      let y: CGFloat
      let s: CGFloat
      if slot == 0 {
        y = dragY - Geo.lift * press
        s = lerp(1, Geo.frontScaleMin, prog)
      } else {
        y = lerp(Geo.slotY[slot], Geo.slotY[slot - 1], prog)
        s = lerp(Geo.slotS[slot], Geo.slotS[slot - 1], prog)
      }
      card.transform = CGAffineTransform(translationX: 0, y: y).scaledBy(x: s, y: s)
    }
  }

  /// 过阈值沉底：目标必须在轮转前按旧 slot 算好，(slot + n - 1) % n 恰好是轮转映射。
  private func commitSink() {
    let n = order.count
    guard n > 0 else { return }
    for (slot, id) in order.enumerated() {
      let target = (slot + n - 1) % n
      cards[id]?.animateToSlot(target, duration: Beat.swap, curve: Beat.swapEase)
    }
    applyZAndInteraction()
  }

  /// 松手轮转牌堆：前→后、其余各前进一步。
  private func rotate() {
    guard order.count > 1 else { return }
    order.append(order.removeFirst())
    sinkingID = nil
    installCardConstraints()
    applyZAndInteraction()
    updateIndicator()
  }

  /// 未过阈值弹回本槽位。
  private func rebound() {
    for (slot, id) in order.enumerated() {
      cards[id]?.animateToSlot(slot, duration: Beat.rebound, curve: Beat.reboundEase)
    }
  }

  // MARK: - 点按浮起（按帧推进）

  private func animatePress(to target: CGFloat) {
    pressLink?.invalidate()
    pressLink = nil
    if Motion.reduced {
      press = target
      applyFollow()
      return
    }
    guard abs(target - press) > 0.001 else { return }
    pressFrom = press
    pressTo = target
    pressStart = CACurrentMediaTime()
    let link = CADisplayLink(target: self, selector: #selector(stepPress))
    link.add(to: .main, forMode: .common)
    pressLink = link
  }

  @objc private func stepPress() {
    let t = (CACurrentMediaTime() - pressStart) / Beat.float
    if t >= 1 {
      press = pressTo
      pressLink?.invalidate()
      pressLink = nil
    } else {
      press = pressFrom + (pressTo - pressFrom)
        * CubicEase.value(at: t, CGPoint(x: 0.22, y: 1), CGPoint(x: 0.36, y: 1))
    }
    // 只有跟手阶段读 press；phase 离开 1 之后 transform 归槽位动画管，
    // 再 applyFollow 会踩掉正在跑的沉底 / 弹回动画
    if phase == 1 { applyFollow() }
  }

  /// 死区判定：与 Expo 版 `.activeOffsetY([-6, 6])` 等价。
  ///
  /// 注意这是 **override** 而不是协议方法 —— `UIView` 自己就有同名方法
  /// （它就是 `UIGestureRecognizerDelegate` 这个槽位），写在扩展里会报
  /// 「requires override」。
  override func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
    guard let pan = gesture as? UIPanGestureRecognizer else { return true }
    let v = pan.translation(in: self)
    // 少于两张卡没有换卡语义：直接失败，把纵向拖动还给滚动视图。
    // 不用 isEnabled 开关 —— 外层让滚动视图的 pan require(toFail:) 本手势，
    // 被禁用的 recognizer 是否算「已失败」没有保证，scroll 会被一起卡住
    guard order.count >= 2 else { return false }
    // 只留方向门（2:1 以内算纵向；系统边缘滑动留给导航返回手势）。
    // 死区**不**在这里判：shouldBegin 返回 false 会让 recognizer 对整次触摸
    // 不可逆地失败，而嵌在滚动区里那等于把刚起头的拖动交给表格滚动 ——
    // 手指继续划也再也换不了卡（ Expo 版 activeOffsetY 是「等」不是「拒」）。
    // 死区挪到 changed 里判，见 handlePan
    return abs(v.y) * 2 > abs(v.x)
  }
}

// MARK: - UIGestureRecognizerDelegate

/// 只为声明 conformace；方法体是类内的 override（见上）。
extension ReminderCardStackView: UIGestureRecognizerDelegate {}

// MARK: - 牌堆指示器

/// 牌堆指示器：固定在卡片右侧，不随卡片移动（用户可见行为的硬要求）。
///
/// 高亮段加长、其余段变点，是尺寸 morph 而非位移 —— 按属性动画规则，
/// width/height 只允许落在「绝对定位且无子节点」的叶子节点上，所以每个
/// 分段都绝对定位：top 偏移与居中全部走 transform（零布局），width/height
/// 过渡不再推挤兄弟段。分段 top 与原「column + gap」排版逐像素一致。
private final class StackIndicatorView: UIView {
  fileprivate var active = 0
  private var segments: [UIView] = []
  private var animators: [UIViewPropertyAnimator] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    isUserInteractionEnabled = false
    backgroundColor = .clear
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    // 分段描边是动态色，同样会被烤进 layer：明暗翻面时重设
    guard traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection)
    else { return }
    let edge = Theme.Promo.Color.edge.resolvedColor(with: traitCollection).cgColor
    for seg in segments {
      seg.layer.borderColor = edge
    }
  }

  func configure(ids: [String]) {
    guard segments.count != ids.count else { return }
    animators.forEach {
      $0.stopAnimation(false)
      $0.finishAnimation(at: .current)
    }
    animators.removeAll()
    segments.forEach { $0.removeFromSuperview() }
    segments = ids.map { _ in
      let seg = UIView()
      seg.layer.borderWidth = 1
      seg.layer.borderColor = Theme.Promo.Color.edge.cgColor
      // 锚点置顶中：高度变化向下生长，与「top 偏移 + 列排版」一致
      seg.layer.anchorPoint = CGPoint(x: 0.5, y: 0)
      addSubview(seg)
      return seg
    }
    active = 0
    layoutSegments(animated: false)
  }

  func setActive(_ index: Int, reduced: Bool) {
    // 首帧分段还没摆过位（bounds 为 0），或高亮段真的变了，才重排
    let needsLayout = index != active || segments.contains { $0.bounds.height == 0 }
    active = index
    guard needsLayout else { return }
    layoutSegments(animated: !reduced)
  }

  private func layoutSegments(animated: Bool) {
    for (index, seg) in segments.enumerated() {
      let on = index == active
      let w = on ? Geo.segActiveW : Geo.segDot
      let h = on ? Geo.segActiveH : Geo.segDot
      let top = segTop(index, active)
      let color =
        on
        ? Theme.Promo.Color.ink.withAlphaComponent(0.82)
        : Theme.Promo.Color.dot.withAlphaComponent(0.62)
      if animated {
        let morph = UIViewPropertyAnimator(
          duration: Beat.swap, timingParameters: Beat.swapEase)
        morph.addAnimations {
          seg.bounds.size = CGSize(width: w, height: h)
          seg.transform = CGAffineTransform(translationX: 0, y: top)
          seg.layer.cornerRadius = min(w, h) / 2
        }
        morph.startAnimation()
        animators.append(morph)
        UIView.animate(withDuration: Beat.segColor, delay: 0, options: .curveLinear) {
          seg.backgroundColor = color
        }
      } else {
        seg.bounds.size = CGSize(width: w, height: h)
        seg.transform = CGAffineTransform(translationX: 0, y: top)
        seg.layer.cornerRadius = min(w, h) / 2
        seg.backgroundColor = color
      }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // 分段绝对定位后居中需要容器有宽；锚点已在 (0.5, 0)，position 即段顶中点
    for seg in segments {
      seg.layer.position = CGPoint(x: bounds.midX, y: 0)
    }
  }
}

/// 第 index 个分段的静止 top：与「纵向 column + 间距 SEG_GAP」的排版
/// 逐像素一致。绝对定位下直接算出，动画期间不牵连兄弟节点重排。
private func segTop(_ index: Int, _ active: Int) -> CGFloat {
  var top: CGFloat = 0
  for i in 0..<index {
    top += (i == active ? Geo.segActiveH : Geo.segDot) + Geo.segGap
  }
  return top
}

// MARK: - 单张提醒卡

/// 单张提醒卡：磨砂底（实时模糊 + 半透明主题色 + accent 染色 + 斜向光泽）
/// + 四段内容（时间 / 状态徽章 / 药名剂量 / 用药人与主操作）。
final class ReminderCardView: UIView {
  /// 卡片中段（标题区）容器。牌堆实测它的 y 摆指示器。
  let midView = UIView()

  /// 本次松手是否算「拖动后误触」。由牌堆在拖动越过死区时置位；
  /// `takeTapped` 读到后清零 —— 与 Expo 版 `moved` 同义
  var dragConsumedTake = false

  var onTake: ((String) -> Void)?

  private let blurView = UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterial))
  private let bgGradient = GradientView()
  private let accentGradient = GradientView()
  private let sheenGradient = GradientView()
  private let hiLine = UIView()
  private let timeLabel = UILabel()
  private let stateChip = UILabel()
  private let stateChipBackground = UIView()
  private let titleLabel = UILabel()
  private let doseLabel = UILabel()
  private let divider = UIView()
  private let avatarView = UILabel()
  private let nameLabel = UILabel()
  private let freqLabel = UILabel()
  private let stockLabel = UILabel()
  private let takeButton = PressScaleButton()
  private var transformAnimators: [UIViewPropertyAnimator] = []
  private var item: CardItem?

  override init(frame: CGRect) {
    super.init(frame: .zero)
    // 牌堆完全用 Auto Layout 摆卡（顶卡在流内撑高、其余卡与顶卡等高），
    // 不关掉 autoresizing 翻译的话，addSubview 时会按 .zero 帧生成
    // 「钉在 (0,0) 且 0×0」的隐式约束，和显式的 top+4 / leading+20 /
    // 内容高度互相冲突 —— 求解器只能破坏其中一侧，卡片被压成零尺寸，
    // 整块牌堆只剩 topPad + stackPadBottom 的空条，看起来就是没显示
    translatesAutoresizingMaskIntoConstraints = false
    backgroundColor = .clear
    layer.cornerRadius = Theme.Radius.promo
    layer.cornerCurve = .continuous
    layer.borderWidth = 1

    // 渐变 / 模糊要裁圆角，投影又要露在卡片外：内容裁切放内层容器，
    // 圆角 + 投影 + 描边留在卡片自己的 layer 上
    let clip = UIView()
    clip.layer.cornerRadius = Theme.Radius.promo
    clip.layer.cornerCurve = .continuous
    clip.clipsToBounds = true
    addSubview(clip)
    clip.translatesAutoresizingMaskIntoConstraints = false
    // 高度必须自下而上由内容撑（clip 的底边约束挂在下面 body 之后）。
    // 若把 clip 四边全钉在卡片上，卡片高度就成了自由量：牌堆与固定头部
    // 都没有从下方定义高度的约束，Auto Layout 随手取值，UIStackView 的
    // .fill 分布再把富余量摊给 hugging 最低的 midView —— 整张卡被拉成
    // 满屏高（Expo / Android 两端都是内容撑高，没有这条反向链）。
    // 注意「卡片底 = clip 底」这条不能少：少了它 clip 虽能按内容算出高度，
    // 卡片自身高度仍是自由量，牌堆 bounds 会塌成几十 pt —— 卡片视觉正常
    // 但命中区只剩顶部一小条，滑到卡片中下部就落到外面的表格上，表现就是
    // 「换卡手势和页面滚动冲突」
    NSLayoutConstraint.activate([
      clip.topAnchor.constraint(equalTo: topAnchor),
      clip.leadingAnchor.constraint(equalTo: leadingAnchor),
      clip.trailingAnchor.constraint(equalTo: trailingAnchor),
      bottomAnchor.constraint(equalTo: clip.bottomAnchor),
    ])

    blurView.translatesAutoresizingMaskIntoConstraints = false
    clip.addSubview(blurView)
    NSLayoutConstraint.activate(blurView.edges(to: clip))

    // 磨砂卡底的三层叠加 = 设计稿的 backdrop-filter + color-mix
    bgGradient.configure(
      colors: [
        Theme.Promo.Color.bg.withAlphaComponent(0.76),
        Theme.Promo.Color.bg.withAlphaComponent(0.64),
      ],
      start: CGPoint(x: 0.33, y: 0.03), end: CGPoint(x: 0.67, y: 0.97))
    accentGradient.configure(
      colors: [
        Theme.Color.primary.withAlphaComponent(0.09),
        Theme.Color.primary.withAlphaComponent(0.13),
      ],
      start: CGPoint(x: 0.33, y: 0.03), end: CGPoint(x: 0.67, y: 0.97))
    sheenGradient.configure(
      colors: [Theme.Promo.Color.sheen, UIColor(white: 1, alpha: 0)],
      start: CGPoint(x: 0.15, y: 0.15), end: CGPoint(x: 0.85, y: 0.85),
      locations: [0, 0.46])
    for gradient in [bgGradient, accentGradient, sheenGradient] {
      gradient.translatesAutoresizingMaskIntoConstraints = false
      clip.addSubview(gradient)
      NSLayoutConstraint.activate(gradient.edges(to: clip))
    }
    // 内高光：玻璃顶棱（设计稿 inset 0 1px 0）
    hiLine.backgroundColor = Theme.Promo.Color.hi
    hiLine.translatesAutoresizingMaskIntoConstraints = false
    clip.addSubview(hiLine)
    NSLayoutConstraint.activate([
      hiLine.topAnchor.constraint(equalTo: clip.topAnchor),
      hiLine.leadingAnchor.constraint(equalTo: clip.leadingAnchor),
      hiLine.trailingAnchor.constraint(equalTo: clip.trailingAnchor),
      hiLine.heightAnchor.constraint(equalToConstant: 1),
    ])

    timeLabel.setStyledText(
      "", font: UIFont.monospacedSystemFont(ofSize: 15, weight: .medium),
      color: Theme.Promo.Color.sub)
    // 徽章底的胶囊圆角在 layoutSubviews 里按实测高度设（见那里的注释）
    stateChipBackground.addSubview(stateChip)
    stateChip.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      stateChip.topAnchor.constraint(equalTo: stateChipBackground.topAnchor, constant: 4),
      stateChip.bottomAnchor.constraint(equalTo: stateChipBackground.bottomAnchor, constant: -4),
      stateChip.leadingAnchor.constraint(equalTo: stateChipBackground.leadingAnchor, constant: 10),
      stateChip.trailingAnchor.constraint(equalTo: stateChipBackground.trailingAnchor, constant: -10),
    ])

    titleLabel.setStyledText(
      "", font: UIFont.systemFont(ofSize: 34, weight: .heavy),
      color: Theme.Promo.Color.ink, kern: -1)
    doseLabel.setStyledText(
      "", font: UIFont.systemFont(ofSize: 14, weight: .regular),
      color: Theme.Promo.Color.sub)
    for label in [titleLabel, doseLabel] {
      // 单行截断：与 Expo / Android 一致，长药名不换行才能保证三张卡等高
      label.numberOfLines = 1
      label.lineBreakMode = .byTruncatingTail
      label.translatesAutoresizingMaskIntoConstraints = false
    }
    midView.translatesAutoresizingMaskIntoConstraints = false
    midView.addSubview(titleLabel)
    midView.addSubview(doseLabel)

    divider.backgroundColor = Theme.Promo.Color.line

    avatarView.font = UIFont.systemFont(ofSize: 16, weight: .bold)
    avatarView.textColor = .white
    avatarView.textAlignment = .center
    avatarView.layer.cornerRadius = 20
    avatarView.clipsToBounds = true

    nameLabel.setStyledText(
      "", font: UIFont.systemFont(ofSize: 16, weight: .bold),
      color: Theme.Promo.Color.ink)
    freqLabel.setStyledText(
      "", font: UIFont.systemFont(ofSize: 13, weight: .regular),
      color: Theme.Promo.Color.sub)
    stockLabel.setStyledText(
      "", font: UIFont.systemFont(ofSize: 13, weight: .regular),
      color: Theme.Promo.Color.sub)
    for label in [nameLabel, freqLabel, stockLabel] {
      label.numberOfLines = 1
      label.lineBreakMode = .byTruncatingTail
    }

    takeButton.setTitle("", for: .normal)
    takeButton.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .semibold)
    // 胶囊圆角在 layoutSubviews 里按实测高度设（写死 999 会让背景画不出来）
    // 左右各 26pt 内边距对齐 Expo 版按钮的 paddingHorizontal：UIButton 默认
    // contentEdgeInsets 为 0，不写这条胶囊会贴着文字收缩成窄椭圆
    takeButton.contentEdgeInsets = UIEdgeInsets(top: 0, left: 26, bottom: 0, right: 26)
    takeButton.addTarget(self, action: #selector(takeDown), for: .touchDown)
    takeButton.addTarget(self, action: #selector(takeTapped), for: .touchUpInside)

    // 上段：提醒时间 + 状态徽章
    let topRow = UIStackView(arrangedSubviews: [timeLabel, stateChipBackground])
    topRow.axis = .horizontal
    topRow.alignment = .center
    topRow.distribution = .equalSpacing
    topRow.spacing = 12

    // 下段：用药人 + 每日频次 / 库存 + 反色主按钮
    let who = UIStackView(arrangedSubviews: [nameLabel, freqLabel, stockLabel])
    who.axis = .vertical
    who.spacing = 0
    let foot = UIStackView(arrangedSubviews: [avatarView, who, takeButton])
    foot.axis = .horizontal
    foot.alignment = .center
    foot.spacing = 12

    // 纵向四段。段间距各不相同，用 stack 的 customSpacing 表达 —— 不要再手工加
    // 「arranged subview 之间」的约束，那会和 stack 自己的布局约束打架
    let body = UIStackView(arrangedSubviews: [topRow, midView, divider, foot])
    body.axis = .vertical
    body.alignment = .fill
    body.spacing = 0
    // 纵向内容拥抱必须拉到 required：UIStackView 的「高度 = 内容高」只是个
    // 固有尺寸诉求，默认优先级 250。固定头部没有外部高度约束，歧义求解时
    // 引擎会随意把 body 拉高（顶卡在流内撑高 → 卡片 / 牌堆一起被撑飞，
    // 表格反被压成 0 高挤到屏幕外）。拉到 required 后 body 高度钉在内容高，
    // 卡片 = 内容高 + 38、牌堆 = 卡片 + 34 全链确定
    body.setContentHuggingPriority(.required, for: .vertical)
    body.setCustomSpacing(22, after: topRow)
    body.setCustomSpacing(24, after: midView)
    body.setCustomSpacing(14, after: divider)
    clip.addSubview(body)
    body.translatesAutoresizingMaskIntoConstraints = false

    timeLabel.setContentHuggingPriority(.required, for: .horizontal)
    stateChipBackground.setContentHuggingPriority(.required, for: .horizontal)
    who.setContentHuggingPriority(.defaultLow, for: .horizontal)
    takeButton.setContentHuggingPriority(.required, for: .horizontal)

    NSLayoutConstraint.activate([
      // 卡片内边距（设计稿 padding: 20px 26px 18px）
      body.topAnchor.constraint(equalTo: clip.topAnchor, constant: 20),
      body.leadingAnchor.constraint(equalTo: clip.leadingAnchor, constant: 26),
      body.trailingAnchor.constraint(equalTo: clip.trailingAnchor, constant: -26),
      // 底边反向钉：clip 底 = body 底 + 18。卡片高度由此自下而上等于
      // 内容高 + 38，牌堆高度 = 卡片高 + topPad(4) + stackPadBottom(30)，
      // 整条链确定；body 作为 stack 按自身固有尺寸取值，不再被拉伸
      clip.bottomAnchor.constraint(equalTo: body.bottomAnchor, constant: 18),

      // 中段：药名 + 剂量。固定行高给右侧指示器留轨道，右内边距避让指示器
      // （右缘 9pt 指示条 + 27pt 间距，比普通段落多让 14pt）
      midView.heightAnchor.constraint(greaterThanOrEqualToConstant: 104),
      titleLabel.topAnchor.constraint(equalTo: midView.topAnchor),
      titleLabel.leadingAnchor.constraint(equalTo: midView.leadingAnchor),
      titleLabel.trailingAnchor.constraint(equalTo: midView.trailingAnchor, constant: -14),
      doseLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
      doseLabel.leadingAnchor.constraint(equalTo: midView.leadingAnchor),
      doseLabel.trailingAnchor.constraint(equalTo: midView.trailingAnchor, constant: -14),

      divider.heightAnchor.constraint(equalToConstant: 1),
      avatarView.widthAnchor.constraint(equalToConstant: 40),
      avatarView.heightAnchor.constraint(equalToConstant: 40),
      takeButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
    ])

    // 内容要「需求」中段高度（软优先级），不能只给上界：midView 是普通
    // UIView，没有固有尺寸，只约束 ≥104 的话它的高度是自由量，外层
    // UIStackView 只能拿它的当前帧算固有高度 → 任意高度都自洽，卡片
    // 会被歧义求解随手拉高。等号 + 250 让内容把高度顶起来（大字号时长高），
    // ≥104 兜底设计稿的固定轨道
    let midContentHeight = doseLabel.bottomAnchor.constraint(equalTo: midView.bottomAnchor)
    midContentHeight.priority = .defaultLow
    midContentHeight.isActive = true
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  // MARK: - 配置

  func configure(item: CardItem, slot: Int) {
    self.item = item
    timeLabel.setStyledText(
      item.timeLabel,
      font: UIFont.monospacedSystemFont(ofSize: 15, weight: .medium),
      color: Theme.Promo.Color.sub)
    stateChip.setStyledText(
      item.stateLabel, font: UIFont.systemFont(ofSize: 12, weight: .semibold),
      color: item.stateTone.color)
    stateChipBackground.backgroundColor = item.stateTone.soft
    titleLabel.setStyledText(
      item.title, font: UIFont.systemFont(ofSize: 34, weight: .heavy),
      color: Theme.Promo.Color.ink, kern: -1)
    doseLabel.setStyledText(
      item.doseLine, font: UIFont.systemFont(ofSize: 14, weight: .regular),
      color: Theme.Promo.Color.sub)
    avatarView.backgroundColor = item.accent
    avatarView.text = String(item.personName.prefix(1))
    nameLabel.setStyledText(
      item.personName, font: UIFont.systemFont(ofSize: 16, weight: .bold),
      color: Theme.Promo.Color.ink)
    freqLabel.setStyledText(
      item.freqLine, font: UIFont.systemFont(ofSize: 13, weight: .regular),
      color: Theme.Promo.Color.sub)
    // 库存告急按项目语义色用 warning（设计稿此处为 danger）
    stockLabel.setStyledText(
      item.stockLine, font: UIFont.systemFont(ofSize: 13, weight: .regular),
      color: item.stockLow ? Theme.Color.warning : Theme.Promo.Color.sub)

    takeButton.setTitle(
      item.reminder.status == .missed
        ? L10n.shared.t("reminder.lateTake") : L10n.shared.t("reminder.taken"),
      for: .normal)
    takeButton.setTitleColor(Theme.Promo.Color.btnFg, for: .normal)
    takeButton.backgroundColor = Theme.Promo.Color.btnBg
    // 已服用：100ms 弹回曲线
    takeButton.pressDuration = 0.1
    takeButton.pressCurve = Beat.reboundEase
    takeButton.accessibilityIdentifier = "stack-card-take-\(item.reminder.id)"
    takeButton.accessibilityLabel = takeButton.title(for: .normal)

    accentGradient.configure(
      colors: [
        item.accent.withAlphaComponent(0.09),
        item.accent.withAlphaComponent(0.13),
      ],
      start: CGPoint(x: 0.33, y: 0.03), end: CGPoint(x: 0.67, y: 0.97))
    layer.borderColor = item.accent.withAlphaComponent(0.4).cgColor
    layer.shadowColor = item.accent.withAlphaComponent(0.42).cgColor
    layer.shadowOffset = CGSize(width: 0, height: 18)
    layer.shadowRadius = 34
    layer.shadowOpacity = 0.42
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // 两个胶囊（状态徽章底 / 已服用按钮）的圆角按实测高度算，不写死 999：
    // cornerRadius 大到超过自身尺寸时背景画不出来（普通 UIView 与 UIButton
    // 都中招，实测只剩文字没有底），height/2 既是标准胶囊也随大字号自适应。
    // 先强制 body（含 topRow / foot 两个子 stack）完成摆位再量：本方法运行时
    // arranged subviews 还没上位（父先子后），直接量到的是陈旧帧
    takeButton.superview?.superview?.layoutIfNeeded()
    takeButton.layer.cornerRadius = takeButton.bounds.height / 2
    stateChipBackground.layer.cornerRadius = stateChipBackground.bounds.height / 2
    // 阴影按 -18px 扩散收一圈（box-shadow 的负 spread 在 iOS 没有对应物，
    // 用内缩的 shadowPath 近似）
    let inset: CGFloat = 18
    layer.shadowPath = UIBezierPath(
      roundedRect: bounds.insetBy(dx: inset, dy: inset),
      cornerRadius: Theme.Radius.promo - inset
    ).cgPath
  }

  @objc private func takeDown() {
    // 新一次点按开始：清掉上一次拖动留下的误触标记（标志只在本次触摸内有效）
    dragConsumedTake = false
  }

  @objc private func takeTapped() {
    guard let item else { return }
    // 先取后清：本次触摸是否拖动过在松手时定论，取完即复位，不影响下一次点按
    let consumed = dragConsumedTake
    dragConsumedTake = false
    guard !consumed else { return }
    onTake?(item.reminder.id)
  }

  // MARK: - 槽位动画

  /// 从当前位过渡到目标槽位（沉底 620ms / 弹回 340ms）。
  func animateToSlot(_ slot: Int, duration: TimeInterval, curve: UICubicTimingParameters) {
    stopTransformAnimations()
    let target = CGAffineTransform(translationX: 0, y: Geo.slotY[slot])
      .scaledBy(x: Geo.slotS[slot], y: Geo.slotS[slot])
    if Motion.reduced {
      transform = target
      return
    }
    let animator = UIViewPropertyAnimator(duration: duration, timingParameters: curve)
    animator.addAnimations { self.transform = target }
    animator.startAnimation()
    transformAnimators.append(animator)
  }

  /// 冻结正在跑的槽位动画并摘掉：再次触摸跟手时要接管 transform。
  func stopTransformAnimations() {
    for animator in transformAnimators {
      animator.stopAnimation(false)
      animator.finishAnimation(at: .current)
    }
    transformAnimators.removeAll()
  }
}

// MARK: - 布局小工具

extension UIView {
  /// 四边贴父视图（渐变层 / 模糊层 / 内容容器铺满用）。
  func pinEdges(to parent: UIView) {
    translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate(edges(to: parent))
  }

  /// 四边贴父视图的约束组。
  func edges(to parent: UIView) -> [NSLayoutConstraint] {
    [
      topAnchor.constraint(equalTo: parent.topAnchor),
      leadingAnchor.constraint(equalTo: parent.leadingAnchor),
      trailingAnchor.constraint(equalTo: parent.trailingAnchor),
      bottomAnchor.constraint(equalTo: parent.bottomAnchor),
    ]
  }
}
