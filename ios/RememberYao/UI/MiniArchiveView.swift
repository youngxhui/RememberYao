import UIKit

// MARK: - 说明书条目

/// 说明书正文的一行。
struct ArchiveRow {
  let label: String
  let value: String
}

/// 一张说明书卡片的数据：水平列表卡位与文件夹内的飞行卡共用。
struct ArchiveEntry {
  let id: String
  let name: String
  /// 正文条目（总数量 / 剩余 / 包装 / 备注）。
  let rows: [ArchiveRow]
  /// 标题下小字；缺省时展示「请仔细阅读」。
  let subtitle: String?
  /// 底部小字（建档日期）。
  let footer: String?

  /// store 药品 → 说明书条目：只展示 store 里真实存在的字段，
  /// 与 Expo 版 `archiveEntryFromMedication` 对齐。
  @MainActor
  static func from(_ medication: Medication) -> ArchiveEntry {
    let unit = L10n.unitLabel(medication.unit)
    let notes = medication.notes.trimmingCharacters(in: .whitespacesAndNewlines)
    return ArchiveEntry(
      id: medication.id,
      name: medication.name,
      rows: [
        ArchiveRow(
          label: L10n.shared.t("medication.totalQuantity"),
          value: "\(medication.totalQuantity) \(unit)"),
        ArchiveRow(
          label: L10n.shared.t("medication.remaining"),
          value: "\(medication.remainingQuantity) \(unit)"),
        ArchiveRow(
          label: L10n.shared.t("medication.packaging"),
          value: L10n.typeLabel(medication.type)),
        ArchiveRow(
          label: L10n.shared.t("medication.notes"),
          value: notes.isEmpty ? L10n.shared.t("common.none") : notes),
      ],
      subtitle: nil,
      footer: L10n.shared.t(
        "medication.archiveCreatedAt",
        ["date": String(medication.createdAt.prefix(10))])
    )
  }
}

// MARK: - 几何与节奏

/// 卡片几何：与 `design/profile.html` 的 `--card-w` / `--card-gap` 同源。
/// 飞行位移按「节距 × 索引」计算，落点必须与列表卡位像素级一致。
private enum Geo {
  static let cardW: CGFloat = 230
  static let cardGap: CGFloat = 16
  static let pitch: CGFloat = cardW + cardGap
  static let folderW: CGFloat = 210
  static let folderH: CGFloat = 300
  static let folderRadius: CGFloat = 26
  static let leafW: CGFloat = 210
  static let leafH: CGFloat = 268
  /// 闭合时说明书缩到该比例，形成「厚沓」层叠。
  static let stackScale: CGFloat = 0.6476
  static let scrollPadTop: CGFloat = 30
  static let scrollPadBottom: CGFloat = 34
  static let sectionPadTop: CGFloat = 10
  static let sectionPadBottom: CGFloat = 4
  static let scrollerH = scrollPadTop + folderH + scrollPadBottom
  /// 外壳总高：section 内边距 + 滚动区。
  static let shellH = sectionPadTop + scrollerH + sectionPadBottom

  /// 滚过 40pt 即判定为展开（与设计稿 sync() 的阈值一致）。
  static let openThreshold: CGFloat = 40
  /// 封面 / 底板变暗的滚动行程：0→260pt 映射到透明度 1→0.65。
  static let dimRange: CGFloat = 260
  /// 封皮磨砂强度：设计稿 backdrop-filter blur(14px)，按观感校准的材质档。
  static let coverBlur = UIBlurEffect.Style.systemThinMaterial
}

/// 时长预算：整套开合约 1s 收尾、封皮 650ms、单张飞行 ≤770ms。
/// delight 档允许超过常规 UI 的 300ms 上限，但更早 1.2s+ 的飞行在旧机上
/// 读作卡顿而非隆重，因此 Expo 侧已从 1200ms 砍到 420ms 起步。
@MainActor
private enum Beat {
  /// 封皮翻开曲线（设计稿 cubic-bezier(0.23, 1, 0.32, 1)）。
  /// CSS 默认 ease 的控制点在 `cssP1` / `cssP2`，按压反馈仍走 `Motion.cubic`。
  /// 逐帧驱动的曲线控制点（`CubicEase` 版）：飞行卡的飞行与淡入淡出。
  /// RN 侧逐帧读 shared value，两端同构。
  static let flyP1 = CGPoint(x: 0.3, y: 0.4)
  static let flyP2 = CGPoint(x: 0.2, y: 1)
  static let cssP1 = CGPoint(x: 0.25, y: 0.1)
  static let cssP2 = CGPoint(x: 0.25, y: 1)

  /// 按压反馈时长：反馈带 100–150ms。
  static let pressScale: TimeInterval = 0.13
  /// 封皮翻开时长：超过 ~700ms 整组动作会脱拍。
  static let coverDuration: TimeInterval = 0.65
  /// 封皮曲线控制点（设计稿 cubic-bezier(0.23, 1, 0.32, 1)）。
  static let coverP1 = CGPoint(x: 0.23, y: 1)
  static let coverP2 = CGPoint(x: 0.32, y: 1)
  /// 说明书淡出 / 列表卡淡入时长。
  static let leafOpacity: TimeInterval = 0.3
  static let slotFade: TimeInterval = 0.42

  static let flyBase: TimeInterval = 0.42
  static let flyStep: TimeInterval = 0.07
  static let takeoffStep: TimeInterval = 0.08
  static let returnStep: TimeInterval = 0.08
  /// 淡出起点 = 落点前 80ms，与列表卡的淡入交叉。
  static let crossFade: TimeInterval = 0.08

  /// 单张飞行时长：距离越远飞得久，线性步进避免末片冲刺。
  static func flyDuration(_ i: Int) -> TimeInterval { flyBase + Double(i) * flyStep }
  /// 展开：按堆叠层序反转（最上层先飞），min() 封顶让头 3 张错峰。
  static func takeoffDelay(_ i: Int, _ n: Int) -> TimeInterval {
    takeoffStep + Double(min(n - 1 - i, 2)) * takeoffStep
  }
  /// 收起：按堆叠顺序依次归位。
  static func returnDelay(_ i: Int) -> TimeInterval {
    returnStep + Double(min(i, 2)) * returnStep
  }
  /// 闭合扇形的递增步长：张数越多扇得越紧。
  static func stackStep(_ n: Int) -> CGFloat { min(1, 3 / CGFloat(max(n, 1))) }
}

/// 一条可中断的标量过渡。延迟期间保持旧值（CSS `transition-delay`）。
///
/// 起跑时刻按「调度时的 now + delay」记下，第一次真正画出来时再平移到
/// 那一帧：点按走 `setContentOffset(animated:)`，`scrollViewDidScroll`
/// 是在滚动动画事务里回调的，display link 往往要等滚动跑起来才响。
/// 若用墙钟计时，首帧到达时飞行时长已经耗尽，卡片会直接落到位，
/// 看起来像没有飞出 / 飞回。
private struct ScalarTransition {
  private(set) var value: CGFloat
  private var from: CGFloat
  private var to: CGFloat
  private var start: CFTimeInterval = 0
  private var anchor: CFTimeInterval = 0
  private var anchored = true
  private(set) var active = false

  init(_ value: CGFloat) {
    self.value = value
    from = value
    to = value
  }

  mutating func snap(_ next: CGFloat) {
    value = next
    from = next
    to = next
    active = false
  }

  mutating func begin(to next: CGFloat, delay: CFTimeInterval, now: CFTimeInterval) {
    from = value
    to = next
    start = now + max(0, delay)
    anchor = now
    anchored = false
    active = true
  }

  /// 推进一步。返回值表示过渡是否还没结束（含延迟）。
  mutating func tick(
    now: CFTimeInterval, duration: CFTimeInterval, _ p1: CGPoint, _ p2: CGPoint
  ) -> Bool {
    guard active else { return false }
    if !anchored {
      start += max(0, now - anchor)
      anchored = true
    }
    if now < start { return true }
    let t = min(1, (now - start) / duration)
    value = lerp(from, to, CubicEase.value(at: t, p1, p2))
    if t >= 1 {
      value = to
      active = false
    }
    return active
  }
}

/// 160deg / 135deg 的渐变起止点（CSS 角度 → 归一化坐标）。
private enum Grad {
  static let p160Start = CGPoint(x: 0.33, y: 0.03)
  static let p160End = CGPoint(x: 0.67, y: 0.97)
  static let p135Start = CGPoint(x: 0.15, y: 0.15)
  static let p135End = CGPoint(x: 0.85, y: 0.85)
}

// MARK: - Mini Archive 收藏夹

/// Mini Archive 收藏夹：闭合时居中一个文件夹，点按或右滑展开成说明书横排。
/// 设计基准 `design/profile.html` 的「Mini Archive」区块。
///
/// 开合状态完全由滚动进度驱动 —— 点按只是发起一次平滑滚动，点按与手滑
/// 因此走同一条链路，观感一致（与 Expo 版同一设计）。
///
/// 布局是纯 frame 的：所有尺寸都是设计常量，唯一变量是自身宽度
/// （分屏 / 旋转时重算水平 padding 与 contentSize）。
final class MiniArchiveView: UIView, UIScrollViewDelegate {
  private let scrollView = UIScrollView()
  private let contentView = UIView()
  private var folderSlot: FolderSlot!
  private var folder: ArchiveFolderView!
  private var leafSlots: [LeafletSlot] = []
  private var entries: [ArchiveEntry] = []
  private var onSelect: ((ArchiveEntry) -> Void)?
  private var languageAtConfigure: Language?

  /// 当前是否展开。由滚动阈值驱动，点按只是发起滚动。
  private(set) var open = false

  /// 整组开合共用一条 display link。挂在收藏夹上而不是每张飞行卡上：
  /// tableHeaderView 重挂时子视图会短暂离屏，各自的 link 会被拆掉且不会自己续上，
  /// 飞到一半的卡片就停在原位。
  private var link: CADisplayLink?

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    scrollView.delegate = self
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.alwaysBounceHorizontal = true
    scrollView.decelerationRate = .fast
    // 飞行卡的落点在文件夹外几百 pt。沿途只要有一层 masksToBounds，
    // 卡片就飞不出封皮，点按 / 拖动都只剩滚动，没有出现和回去。
    // 阴影也靠同一条不裁剪的链溢出滚动区。
    clipsToBounds = false
    scrollView.clipsToBounds = false
    scrollView.layer.masksToBounds = false
    contentView.clipsToBounds = false
    addSubview(scrollView)
    scrollView.addSubview(contentView)
  }

  deinit {
    // CADisplayLink 强引用 target。离屏时 didMoveToWindow 会断，
    // 这里再兜一次「还在窗口里就被拆掉」的角况。
    MainActor.assumeIsolated {
      link?.invalidate()
      link = nil
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  /// 外壳总高。`tableHeaderView` 按 frame 定高，调用方需要这个常量。
  static let shellHeight: CGFloat = Geo.shellH

  // MARK: - 配置

  /// 灌入说明书条目。条目集合没变就跳过重建（每次 `viewWillAppear` 都会调）；
  /// 语言切换后要重建 —— 卡片文案是 configure 时固化的。
  func configure(entries: [ArchiveEntry], onSelect: @escaping (ArchiveEntry) -> Void)
  {
    self.onSelect = onSelect
    let sameIDs = entries.map(\.id) == self.entries.map(\.id)
    let sameLanguage = languageAtConfigure == L10n.shared.language
    guard !sameIDs || !sameLanguage else { return }
    self.entries = entries
    self.languageAtConfigure = L10n.shared.language
    rebuild()
  }

  private func rebuild() {
    stopLink()
    folderSlot?.removeFromSuperview()
    leafSlots.forEach { $0.removeFromSuperview() }
    leafSlots = []

    folder = ArchiveFolderView()
    folderSlot = FolderSlot(folder: folder)
    folderSlot.scaleTarget = folder
    folderSlot.accessibilityIdentifier = "mini-archive-folder"
    folderSlot.accessibilityLabel = L10n.shared.t("medication.archiveTitle")
    folderSlot.addTarget(self, action: #selector(folderTapped), for: .touchUpInside)
    contentView.addSubview(folderSlot)

    for entry in entries {
      let slot = LeafletSlot(entry: entry, index: leafSlots.count, count: entries.count)
      slot.accessibilityIdentifier = "mini-archive-entry-\(entry.id)"
      slot.accessibilityLabel = entry.name
      slot.accessibilityHint = L10n.shared.t("medication.archiveEntryHint")
      slot.addTarget(self, action: #selector(slotTapped(_:)), for: .touchUpInside)
      contentView.addSubview(slot)
      leafSlots.append(slot)
      folder.addFlyingLeaf(entry: entry, index: leafSlots.count - 1, count: entries.count)
    }

    open = false
    scrollView.setContentOffset(.zero, animated: false)
    // 先把 frame 摆上再落闭合姿态，否则 transform 打在零尺寸的视图上，
    // 下一轮 layout 写 bounds 时卡片还是 identity，厚沓对不齐。
    setNeedsLayout()
    layoutIfNeeded()
    applyState(animated: false)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      link?.invalidate()
      link = nil
    } else if needsTick {
      startLink()
    }
  }

  // MARK: - 布局

  override func layoutSubviews() {
    super.layoutSubviews()
    // rebuild() 之前就可能被布局（tableHeaderView 一赋值就触发），此时
    // folderSlot 还没建，直接 return，等 configure 后重新布局
    guard let folderSlot else { return }
    let width = bounds.width
    let count = entries.count
    // 首尾卡片居中：contentView 整体右移半个剩余宽度
    let pad = max(0, (width - Geo.cardW) / 2)
    scrollView.frame = CGRect(
      x: 0, y: Geo.sectionPadTop, width: width, height: Geo.scrollerH)
    let contentW = CGFloat(count + 1) * Geo.cardW + CGFloat(count) * Geo.cardGap
    scrollView.contentSize = CGSize(
      width: pad * 2 + contentW, height: Geo.scrollerH)
    contentView.frame = CGRect(
      x: pad, y: 0, width: contentW, height: Geo.scrollerH)

    folderSlot.frame = CGRect(
      x: 0, y: Geo.scrollPadTop, width: Geo.cardW, height: Geo.folderH)
    // 说明书卡位比文件夹矮，与文件夹在同一中线上（设计稿 align-items: center）
    let leafY = Geo.scrollPadTop + (Geo.folderH - Geo.leafH) / 2
    for (index, slot) in leafSlots.enumerated() {
      slot.frame = CGRect(
        x: CGFloat(index + 1) * Geo.pitch, y: leafY,
        width: Geo.cardW, height: Geo.leafH)
    }
    folder.setNeedsLayout()
    // 飞行要画出文件夹。header / 滚动视图重排时有机会把裁剪打开，
    // 这里每轮都关回去，否则卡片只在封皮里动，外面看不到飞出和飞回。
    scrollView.clipsToBounds = false
    scrollView.layer.masksToBounds = false
    contentView.clipsToBounds = false
    folderSlot.clipsToBounds = false
    // 不要在这里 applyState。tableHeaderView 会随表格滚动反复重排，
    // 无条件落到终态会把正在飞的开合瞬间拍死 —— 点按展开 / 合上正是
    // 滚动驱动的，scrollViewDidScroll 刚启动就被清零。Expo 侧由 React
    // state 驱动，没有这条重置路径。分屏改宽只影响左右留白，飞行距离
    // 是节距常量，进行中的进度不用重算。
  }

  // MARK: - 开合

  /// 按当前 `open` 刷新封皮、飞行卡与列表卡。三条过渡共用本视图的 display link。
  private func applyState(animated: Bool) {
    let animate = animated && !Motion.reduced
    let now = CACurrentMediaTime()
    folder.applyOpen(open, animated: animate, now: now)
    for case let leaf as MiniLeaf in folder.leafStack.subviews {
      leaf.applyOpen(open, animated: animate, now: now)
    }
    for slot in leafSlots {
      slot.applyOpen(open, animated: animate, now: now)
    }
    if animate && needsTick {
      startLink()
    } else if !needsTick {
      stopLink()
    }
  }

  private var needsTick: Bool {
    if folder?.isAnimating == true { return true }
    if folder?.leafStack.subviews.contains(where: { ($0 as? MiniLeaf)?.isAnimating == true }) == true {
      return true
    }
    return leafSlots.contains(where: \.isAnimating)
  }

  private func startLink() {
    guard link == nil else { return }
    // .common 而非 .default：拖动（tracking）期间卡片仍在飞
    let link = CADisplayLink(target: self, selector: #selector(tick))
    link.add(to: .main, forMode: .common)
    self.link = link
  }

  private func stopLink() {
    link?.invalidate()
    link = nil
  }

  @objc private func tick(_ link: CADisplayLink) {
    let now = link.timestamp
    var running = folder?.tick(now) ?? false
    for case let leaf as MiniLeaf in folder?.leafStack.subviews ?? [] {
      if leaf.tick(now) { running = true }
    }
    for slot in leafSlots where slot.tick(now) {
      running = true
    }
    if !running { stopLink() }
  }

  @objc private func folderTapped() {
    guard !entries.isEmpty else { return }
    scrollView.setContentOffset(
      CGPoint(x: open ? 0 : Geo.pitch, y: 0), animated: !Motion.reduced)
  }

  @objc private func slotTapped(_ sender: LeafletSlot) {
    onSelect?(sender.entry)
  }

  // MARK: - UIScrollViewDelegate

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    let x = max(0, scrollView.contentOffset.x)
    // 封面与底板随滚动进度变暗，只影响文件夹本体，不影响飞行中的说明书
    folder.dim = 1 - 0.35 * min(x / Geo.dimRange, 1)
    // 阈值穿越只在跨过时触发一次：开合 + 轻触反馈
    let shouldOpen = x > Geo.openThreshold
    guard shouldOpen != open else { return }
    open = shouldOpen
    applyState(animated: true)
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
  }

  /// 吸附到卡片节距（设计稿 scroll-snap-type: x proximity 的等价物）。
  func scrollViewWillEndDragging(
    _ scrollView: UIScrollView, withVelocity velocity: CGPoint,
    targetContentOffset: UnsafeMutablePointer<CGPoint>
  ) {
    let page = (targetContentOffset.pointee.x / Geo.pitch).rounded()
    targetContentOffset.pointee.x = page * Geo.pitch
  }
}

// MARK: - 文件夹卡位（列表第 1 项）

/// 文件夹卡位：230×300 的点击区，内部 210×300 的文件夹按压缩放。
private final class FolderSlot: PressScaleButton {
  override init(frame: CGRect) {
    super.init(frame: .zero)
    backgroundColor = .clear
    clipsToBounds = false
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  convenience init(folder: ArchiveFolderView) {
    self.init(frame: .zero)
    folder.translatesAutoresizingMaskIntoConstraints = false
    addSubview(folder)
    NSLayoutConstraint.activate([
      folder.centerXAnchor.constraint(equalTo: centerXAnchor),
      folder.centerYAnchor.constraint(equalTo: centerYAnchor),
      folder.widthAnchor.constraint(equalToConstant: Geo.folderW),
      folder.heightAnchor.constraint(equalToConstant: Geo.folderH),
    ])
  }
}

// MARK: - 文件夹本体

/// 文件夹本体：青绿底板 + 内部说明书堆叠 + 磨砂封皮。
///
/// 说明书堆叠在封皮之下（z 序：底板 < 说明书 < 封皮），展开时从半透明
/// 封皮下飞出，与列表卡交叉淡入。
private final class ArchiveFolderView: UIView {
  fileprivate let leafStack = UIView()
  private let back = GradientView()
  private let front = UIView()
  private let blurView = UIVisualEffectView(effect: UIBlurEffect(style: Geo.coverBlur))
  private let frontGradient = GradientView()
  private let sheenGradient = GradientView()
  private let hiLine = UIView()
  private let titleLabel = UILabel()
  private let subtitleLabel = UILabel()
  private let lineViews: [UIView] = (0..<3).map { _ in UIView() }
  /// 封皮当前转角（弧度）。0 = 合上，负值 = 绕左缘翻开。
  private var cover = ScalarTransition(0)

  /// 封面 / 底板随滚动进度变暗（0→260pt → 1→0.65）。
  var dim: CGFloat = 1 {
    didSet {
      back.alpha = dim
      front.alpha = dim
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    clipsToBounds = false
    // 封皮、底板、说明书都是装饰。留着 hit testing 会把点击吃掉，
    // 按钮收不到 touchUpInside，点按就无法发起那次滚动。
    isUserInteractionEnabled = false

    back.configure(
      colors: [Theme.Archive.Color.tab, Theme.Archive.Color.back],
      start: Grad.p160Start, end: Grad.p160End)
    back.layer.cornerRadius = Geo.folderRadius
    back.layer.cornerCurve = .continuous
    back.layer.shadowColor = Theme.Archive.Color.shadow.cgColor
    back.layer.shadowOffset = CGSize(width: 0, height: 16)
    back.layer.shadowRadius = 30
    back.layer.shadowOpacity = 0.3
    back.isUserInteractionEnabled = false
    addSubview(back)
    leafStack.clipsToBounds = false
    leafStack.isUserInteractionEnabled = false
    addSubview(leafStack)

    front.layer.cornerRadius = Geo.folderRadius
    front.layer.cornerCurve = .continuous
    front.layer.borderWidth = 1
    front.layer.borderColor = UIColor(white: 1, alpha: 0.22).cgColor
    front.clipsToBounds = true
    front.isUserInteractionEnabled = false
    front.addSubview(blurView)
    frontGradient.configure(
      colors: [
        Theme.Archive.Color.coverTop.withAlphaComponent(0.55),
        Theme.Archive.Color.coverBottom.withAlphaComponent(0.62),
      ],
      start: Grad.p160Start, end: Grad.p160End)
    front.addSubview(frontGradient)
    sheenGradient.configure(
      colors: [UIColor(white: 1, alpha: 0.22), UIColor(white: 1, alpha: 0)],
      start: Grad.p135Start, end: Grad.p135End, locations: [0, 0.46])
    front.addSubview(sheenGradient)
    // 顶部内高光：设计稿 box-shadow 的 inset 0 1px 0 rgba(255,255,255,0.4)
    hiLine.backgroundColor = UIColor(white: 1, alpha: 0.4)
    front.addSubview(hiLine)
    front.addSubview(titleLabel)
    front.addSubview(subtitleLabel)
    lineViews.forEach { front.addSubview($0) }
    addSubview(front)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  func addFlyingLeaf(entry: ArchiveEntry, index: Int, count: Int) {
    leafStack.addSubview(MiniLeaf(entry: entry, index: index, count: count))
  }

  var isAnimating: Bool { cover.active }

  /// 开合封皮。磨砂在 3D 旋转期间每帧重采样会出残影，与 Expo 版一致
  /// 在打开时直接摘掉（设计稿 backdrop-filter: none）。
  /// 转角逐帧 lerp，不走 animator：`scrollViewDidScroll` 处在滚动动画事务里，
  /// 那里创建的 property animator 会被卷进 `setContentOffset` 的动画，
  /// 封皮瞬间到位，飞行卡的错峰就对不上。
  func applyOpen(_ open: Bool, animated: Bool, now: CFTimeInterval) {
    blurView.isHidden = open
    let target: CGFloat = open ? -58 * .pi / 180 : 0
    if animated {
      cover.begin(to: target, delay: 0, now: now)
    } else {
      cover.snap(target)
    }
    applyAngle()
  }

  func tick(_ now: CFTimeInterval) -> Bool {
    let running = cover.tick(now: now, duration: Beat.coverDuration, Beat.coverP1, Beat.coverP2)
    applyAngle()
    return running
  }

  private func applyAngle() {
    let angle = cover.value
    if abs(angle) < 0.0001 {
      front.layer.transform = CATransform3DIdentity
      return
    }
    var transform = CATransform3DIdentity
    transform.m34 = -1 / 1500
    front.layer.transform = CATransform3DRotate(transform, angle, 0, 1, 0)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let b = bounds
    back.frame = b
    leafStack.frame = b
    front.frame = b
    // 封皮绕左缘翻开：锚点置左中，position 同步修正（改锚点会移动 layer）
    let anchor = CGPoint(x: 0, y: 0.5)
    if front.layer.anchorPoint != anchor {
      front.layer.anchorPoint = anchor
    }
    front.layer.position = CGPoint(x: 0, y: b.midY)
    // 改锚点会动 layer。转角是我们自己逐帧写的，layout 后再盖一次，
    // 避免表格重排把翻开中的封皮弹回。
    applyAngle()
    blurView.frame = b
    frontGradient.frame = b
    sheenGradient.frame = b
    hiLine.frame = CGRect(x: 0, y: 0, width: b.width, height: 1)

    // 底部对齐的三段内容：装饰线 → 副标题 → 大标题（设计稿 padding 24/22）
    let padV: CGFloat = 24
    let padH: CGFloat = 22
    let lineH: CGFloat = 3
    let lineGap: CGFloat = 10
    let linesH = lineH * 3 + lineGap * 2
    let linesY = b.height - padV - linesH
    let lineWidths: [CGFloat] = [1, 0.84, 0.92]
    for (index, line) in lineViews.enumerated() {
      let w = (b.width - padH * 2) * lineWidths[index]
      line.frame = CGRect(
        x: padH, y: linesY + CGFloat(index) * (lineH + lineGap),
        width: w, height: lineH)
      line.layer.cornerRadius = 2
      line.backgroundColor = Theme.Archive.Color.line
    }
    let titleH: CGFloat = 32
    let subtitleH: CGFloat = 13
    let subtitleY = linesY - 6 - subtitleH
    let titleY = subtitleY - 6 - titleH
    titleLabel.frame = CGRect(
      x: padH, y: titleY, width: b.width - padH * 2, height: titleH)
    titleLabel.setStyledText(
      L10n.shared.t("medication.archiveTitle"),
      font: UIFont.systemFont(ofSize: 27, weight: .heavy),
      color: Theme.Archive.Color.ink, kern: -0.5)
    subtitleLabel.frame = CGRect(
      x: padH, y: subtitleY, width: b.width - padH * 2, height: subtitleH)
    subtitleLabel.setStyledText(
      L10n.shared.t("medication.archiveSubtitle").uppercased(),
      font: UIFont.monospacedSystemFont(ofSize: 11, weight: .regular),
      color: Theme.Archive.Color.inkMuted, kern: 1.8)

    for case let leaf as MiniLeaf in leafStack.subviews {
      leaf.frame = CGRect(
        x: 0, y: (b.height - Geo.leafH) / 2,
        width: Geo.leafW, height: Geo.leafH)
    }
  }
}

// MARK: - 封皮下的飞行说明书

/// 封皮下的飞行说明书：闭合时按索引递增偏移形成扇形厚沓；
/// 展开时飞到第 index+1 个列表卡位（文件夹占第 0 位），到位后淡出。
///
/// 飞行与淡出由收藏夹上的一条 display link 逐帧推动，不走
/// `UIViewPropertyAnimator`：起止都是「平移 + 旋转 + 缩放」的复合
/// `CGAffineTransform`，animator 对这种 transform 的插值落点会漂
/// （真机实测合上后卡片落点偏离文件夹）。逐分量 lerp 与 RN 侧
/// transform 数组的逐项插值同构；中途反转从当前进度续上。
///
/// 矩阵顺序对齐 CSS `translate() rotate() scale()`（从右往左应用）：
/// 先缩放、再旋转、最后平移。平移放在最外层，飞行距离才不会被
/// 0.65 的厚沓缩放吃掉，落点才能和列表卡位重合。
private final class MiniLeaf: UIView {
  private let leaflet = ArchiveLeafletView()
  /// transform 载体。leaf 自身必须永远保持 identity：UIKit 的 frame setter
  /// 在 transform ≠ identity 时会按缩放反推 bounds（合上态 scale 0.6476 会把
  /// 210×268 撑成 324×414，卡片内容整体错位）—— 展开态是纯平移所以只在
  /// 合上后暴露，表现为「出发正确、收回落点错」。Expo（Yoga）与 Android
  /// （graphicsLayer）布局与变换分离，没有这条耦合。
  /// `layoutSubviews` 里同样不能写 `content.frame`：父级一 layout（表格
  /// 滚动 header 就会），飞行中的 transform 就被反推掉，卡片不再移动。
  private let content = UIView()
  private let index: Int
  private let count: Int

  /// 飞行进度：0 = 闭合位、1 = 展开位。
  private var fly = ScalarTransition(0)
  /// 可见度：1 = 厚沓可见、0 = 飞出后淡出。
  private var fade = ScalarTransition(1)

  var isAnimating: Bool { fly.active || fade.active }

  init(entry: ArchiveEntry, index: Int, count: Int) {
    self.index = index
    self.count = count
    super.init(frame: .zero)
    clipsToBounds = false
    isUserInteractionEnabled = false
    content.clipsToBounds = false
    content.isUserInteractionEnabled = false
    leaflet.isUserInteractionEnabled = false
    leaflet.configure(entry: entry)
    content.addSubview(leaflet)
    addSubview(content)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func layoutSubviews() {
    super.layoutSubviews()
    let center = CGPoint(x: bounds.midX, y: bounds.midY)
    if content.bounds.size != bounds.size || content.center != center {
      content.bounds = CGRect(origin: .zero, size: bounds.size)
      content.center = center
    }
    if leaflet.bounds.size != content.bounds.size {
      leaflet.frame = content.bounds
    }
  }

  func applyOpen(_ open: Bool, animated: Bool, now: CFTimeInterval) {
    if animated {
      fly.begin(
        to: open ? 1 : 0,
        delay: open ? Beat.takeoffDelay(index, count) : Beat.returnDelay(index),
        now: now)
      // 展开：落点前 crossFade 起淡，与列表卡淡入交叉；合上：与飞行同刻
      let fadeDelay = open
        ? Beat.takeoffDelay(index, count) + Beat.flyDuration(index) - Beat.crossFade
        : Beat.returnDelay(index)
      fade.begin(to: open ? 0 : 1, delay: fadeDelay, now: now)
    } else {
      fly.snap(open ? 1 : 0)
      fade.snap(open ? 0 : 1)
    }
    render()
  }

  func tick(_ now: CFTimeInterval) -> Bool {
    let flyRunning = fly.tick(now: now, duration: Beat.flyDuration(index), Beat.flyP1, Beat.flyP2)
    let fadeRunning = fade.tick(now: now, duration: Beat.leafOpacity, Beat.cssP1, Beat.cssP2)
    render()
    return flyRunning || fadeRunning
  }

  /// 按当前进度摆位：progress=0 是闭合厚沓、1 是第 index+1 个列表卡位。
  private func render() {
    let step = Beat.stackStep(count)
    let progress = fly.value
    let x = lerp(-7 + CGFloat(index) * 6 * step, CGFloat(index + 1) * Geo.pitch, progress)
    let y = lerp(-6 + CGFloat(index) * 7 * step, 0, progress)
    let angle = lerp((-4 + CGFloat(index) * 3.5 * step) * .pi / 180, 0, progress)
    let scale = lerp(Geo.stackScale, 1, progress)
    // scale → rotate → translate，对齐 CSS 从右往左的应用顺序。
    content.transform = CGAffineTransform(scaleX: scale, y: scale)
      .rotated(by: angle)
      .translatedBy(x: x, y: y)
    content.alpha = fade.value
  }
}

// MARK: - 水平列表里的说明书卡位

/// 水平列表里的说明书卡位：平时透明，展开时按反转顺序交叉淡入。
private final class LeafletSlot: PressScaleButton {
  let entry: ArchiveEntry
  private let index: Int
  private let count: Int
  private let leaflet = ArchiveLeafletView()
  /// 模型透明度。不要读 `alpha`：父级若正处于别的动画事务里，读到的是呈现值。
  private var fade = ScalarTransition(0)

  var isAnimating: Bool { fade.active }

  init(entry: ArchiveEntry, index: Int, count: Int) {
    self.entry = entry
    self.index = index
    self.count = count
    super.init(frame: .zero)
    backgroundColor = .clear
    clipsToBounds = false
    // 说明书本身不接触摸，否则点不中这颗按钮（UIControl 不向子视图冒泡）
    leaflet.isUserInteractionEnabled = false
    leaflet.configure(entry: entry)
    leaflet.translatesAutoresizingMaskIntoConstraints = false
    addSubview(leaflet)
    NSLayoutConstraint.activate([
      leaflet.centerXAnchor.constraint(equalTo: centerXAnchor),
      leaflet.centerYAnchor.constraint(equalTo: centerYAnchor),
      leaflet.widthAnchor.constraint(equalToConstant: Geo.leafW),
      leaflet.heightAnchor.constraint(equalToConstant: Geo.leafH),
    ])
    scaleTarget = leaflet
    // 闭合时整列卡位露在屏幕右缘：不可见也不可点，别留隐形点击区
    isUserInteractionEnabled = false
    alpha = 0
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  func applyOpen(_ open: Bool, animated: Bool, now: CFTimeInterval) {
    isUserInteractionEnabled = open
    let target: CGFloat = open ? 1 : 0
    if animated {
      // 淡入起点 = 对应飞行卡落点前 120ms，两卡交叉淡入、落点像素级一致。
      // 合上无延迟，立刻淡出，飞行卡同时从卡位往回飞。
      let delay = open
        ? Beat.takeoffDelay(index, count) + Beat.flyDuration(index) - 0.12 : 0
      fade.begin(to: target, delay: delay, now: now)
    } else {
      fade.snap(target)
      alpha = target
    }
  }

  func tick(_ now: CFTimeInterval) -> Bool {
    let running = fade.tick(now: now, duration: Beat.slotFade, Beat.cssP1, Beat.cssP2)
    alpha = fade.value
    return running
  }
}

// MARK: - 说明书盒

/// 药物说明书盒样式：列表卡与文件夹内飞行卡完全共用 —— 闭合时整体缩小，
/// 打开时放大飞入卡位，落点与列表项必须像素级一致，所以两者同一实现。
private final class ArchiveLeafletView: UIView {
  private let topBar = UIView()
  private let nameLabel = UILabel()
  private let subLabel = UILabel()
  private let separator = UIView()
  private let footerLabel = UILabel()
  /// 正文行：label + value 一对。条数固定为 4，build 时建、layout 时摆位。
  private var rowLabels: [(UILabel, UILabel)] = []
  private var entry: ArchiveEntry?

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = Theme.Archive.Color.paper
    layer.cornerRadius = 10
    layer.cornerCurve = .continuous
    layer.shadowColor = Theme.Archive.Color.stampShadow.cgColor
    layer.shadowOffset = CGSize(width: 0, height: 10)
    layer.shadowRadius = 22
    layer.shadowOpacity = 0.4

    // 顶部一道色条，暗示「折叠的说明书」
    topBar.backgroundColor = Theme.Archive.Color.artTop
    topBar.alpha = 0.85
    addSubview(topBar)
    addSubview(nameLabel)
    addSubview(subLabel)
    addSubview(separator)
    addSubview(footerLabel)
    for _ in 0..<4 {
      let label = UILabel()
      let value = UILabel()
      addSubview(label)
      addSubview(value)
      rowLabels.append((label, value))
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  func configure(entry: ArchiveEntry) {
    self.entry = entry
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let b = bounds
    let padH: CGFloat = 13
    topBar.frame = CGRect(x: padH, y: 0, width: b.width - padH * 2, height: 3)
    topBar.layer.cornerRadius = 3
    topBar.layer.maskedCorners = [.layerMinXMaxYCorner, .layerMaxXMaxYCorner]

    // 头部：药名 + 小字 + 分隔线（设计稿 padding-top 15 + name 15pt + sub 8pt）
    let nameY: CGFloat = 23
    let nameH: CGFloat = 18
    nameLabel.frame = CGRect(
      x: padH, y: nameY, width: b.width - padH * 2, height: nameH)
    nameLabel.lineBreakMode = .byTruncatingTail
    nameLabel.setStyledText(
      entry?.name ?? "",
      font: UIFont.systemFont(ofSize: 15, weight: .heavy),
      color: Theme.Archive.Color.stampInk, kern: -0.15)
    let subY = nameY + nameH + 3
    let subH: CGFloat = 10
    subLabel.frame = CGRect(
      x: padH, y: subY, width: b.width - padH * 2, height: subH)
    subLabel.lineBreakMode = .byTruncatingTail
    subLabel.setStyledText(
      entry?.subtitle ?? L10n.shared.t("medication.archiveReadMe"),
      font: UIFont.systemFont(ofSize: 8, weight: .regular),
      color: Theme.Archive.Color.stampMuted)
    let headBottom = subY + subH + 9
    separator.frame = CGRect(
      x: padH, y: headBottom - 1, width: b.width - padH * 2, height: 1)
    separator.backgroundColor = Theme.Archive.Color.stampEdge

    // 底部：建档日期
    let footerH: CGFloat = 9
    let footerY = b.height - 10 - footerH
    footerLabel.frame = CGRect(
      x: padH, y: footerY, width: b.width - padH * 2, height: footerH)
    footerLabel.textAlignment = .center
    footerLabel.alpha = 0.85
    footerLabel.lineBreakMode = .byTruncatingTail
    if let footer = entry?.footer {
      footerLabel.setStyledText(
        footer,
        font: UIFont.monospacedSystemFont(ofSize: 7, weight: .medium),
        color: Theme.Archive.Color.stampMuted, kern: 0.14)
    } else {
      footerLabel.attributedText = nil
    }

    // 正文：label/value 两列，纵向均分（设计稿 justify-content: space-evenly）
    let rows = entry?.rows ?? []
    let labelW: CGFloat = 54
    let rowH: CGFloat = 11
    let bodyTop = headBottom + 9
    let bodyBottom = footerY - 6
    for (index, pair) in rowLabels.enumerated() {
      guard index < rows.count else {
        pair.0.isHidden = true
        pair.1.isHidden = true
        continue
      }
      let step = (bodyBottom - bodyTop) / CGFloat(rows.count)
      let rowY = bodyTop + step * CGFloat(index) + (step - rowH) / 2
      pair.0.isHidden = false
      pair.1.isHidden = false
      pair.0.frame = CGRect(x: padH, y: rowY, width: labelW, height: rowH)
      pair.0.lineBreakMode = .byTruncatingTail
      pair.0.setStyledText(
        rows[index].label, font: UIFont.systemFont(ofSize: 9, weight: .semibold),
        color: Theme.Archive.Color.stampInk)
      pair.1.frame = CGRect(
        x: padH + labelW + 8, y: rowY,
        width: b.width - padH * 2 - labelW - 8, height: rowH)
      pair.1.lineBreakMode = .byTruncatingTail
      pair.1.setStyledText(
        rows[index].value, font: UIFont.systemFont(ofSize: 8.5, weight: .regular),
        color: Theme.Archive.Color.stampMuted)
    }
  }
}
