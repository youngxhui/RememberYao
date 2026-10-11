import UIKit

import OSLog

/// 临时调试日志：确认开合动画的调用序列，定位后删除
private let archiveDebug = Logger(
  subsystem: "top.youngxhui.rememberyao", category: "MiniArchive")

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
  static let coverEase = Motion.cubic(0.23, 1, 0.32, 1)
  /// CSS 默认 ease，用于按压反馈与交叉淡入淡出（animator 版）。
  static let cssEase = Motion.cubic(0.25, 0.1, 0.25, 1)
  /// 逐帧驱动的曲线控制点（`CubicEase` 版，与上面两条同参数）：
  /// 飞行卡的飞行与淡入淡出。RN 侧逐帧读 shared value，两端同构。
  static let flyP1 = CGPoint(x: 0.3, y: 0.4)
  static let flyP2 = CGPoint(x: 0.2, y: 1)
  static let cssP1 = CGPoint(x: 0.25, y: 0.1)
  static let cssP2 = CGPoint(x: 0.25, y: 1)

  /// 按压反馈时长：反馈带 100–150ms。
  static let pressScale: TimeInterval = 0.13
  /// 封皮翻开时长：超过 ~700ms 整组动作会脱拍。
  static let coverDuration: TimeInterval = 0.65
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

  /// 上次布局应用的宽度。宽度没变（随表格滚动反复重排）时不碰开合状态，
  /// 否则会把正在飞的开合动画瞬间清零
  private var appliedWidth: CGFloat = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    scrollView.delegate = self
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.alwaysBounceHorizontal = true
    scrollView.decelerationRate = .fast
    // 卡片投影（尤其文件夹底部 -16px 扩散的那圈）要溢出滚动区，
    // 默认裁剪会把阴影切掉
    scrollView.clipsToBounds = false
    addSubview(scrollView)
    scrollView.addSubview(contentView)
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
    setNeedsLayout()
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
    archiveDebug.log("layoutSubviews width=\(width) applied=\(self.appliedWidth)")
    // 只在宽度真的变了（分屏 / 旋转）时按当前开合状态原样恢复。
    // tableHeaderView 会随表格滚动反复重排，无条件 applyState(animated:false)
    // 会把正在飞的开合动画瞬间拍死 —— 点按展开/合上正是滚动驱动的，
    // scrollViewDidScroll 刚启动动画就被这里清零（Expo 侧由 React state
    // 驱动，没有这条重置路径）
    guard width != appliedWidth else { return }
    appliedWidth = width
    applyState(animated: false)
  }

  // MARK: - 开合

  /// 按当前 `open` 刷新封皮与列表卡（飞行卡各自管理自己的过渡）。
  private func applyState(animated: Bool) {
    let animate = animated && !Motion.reduced
    archiveDebug.log("applyState animated=\(animate) open=\(self.open)")
    folder.applyOpen(open, animated: animate)
    for case let leaf as MiniLeaf in folder.leafStack.subviews {
      leaf.applyOpen(open, animated: animate)
    }
    for slot in leafSlots {
      slot.applyOpen(open, animated: animate)
    }
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
    archiveDebug.log("scrollViewDidScroll flip open=\(shouldOpen) x=\(x)")
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
  private var coverAnimator: UIViewPropertyAnimator?

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

    back.configure(
      colors: [Theme.Archive.Color.tab, Theme.Archive.Color.back],
      start: Grad.p160Start, end: Grad.p160End)
    back.layer.cornerRadius = Geo.folderRadius
    back.layer.cornerCurve = .continuous
    back.layer.shadowColor = Theme.Archive.Color.shadow.cgColor
    back.layer.shadowOffset = CGSize(width: 0, height: 16)
    back.layer.shadowRadius = 30
    back.layer.shadowOpacity = 0.3
    addSubview(back)
    addSubview(leafStack)

    front.layer.cornerRadius = Geo.folderRadius
    front.layer.cornerCurve = .continuous
    front.layer.borderWidth = 1
    front.layer.borderColor = UIColor(white: 1, alpha: 0.22).cgColor
    front.clipsToBounds = true
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

  /// 开合封皮。磨砂在 3D 旋转期间每帧重采样会出残影，与 Expo 版一致
  /// 在打开时直接摘掉（设计稿 backdrop-filter: none）。
  func applyOpen(_ open: Bool, animated: Bool) {
    let target: CATransform3D
    if open {
      var t = CATransform3DIdentity
      t.m34 = -1 / 1500
      target = CATransform3DRotate(t, -58 * .pi / 180, 0, 1, 0)
    } else {
      target = CATransform3DIdentity
    }
    blurView.isHidden = open
    coverAnimator?.stopAnimation(false)
    coverAnimator?.finishAnimation(at: .current)
    coverAnimator = nil
    if animated {
      let animator = UIViewPropertyAnimator(
        duration: Beat.coverDuration, timingParameters: Beat.coverEase)
      animator.addAnimations { self.front.layer.transform = target }
      animator.startAnimation()
      coverAnimator = animator
    } else {
      front.layer.transform = target
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let b = bounds
    back.frame = b
    leafStack.frame = b
    front.frame = b
    // 封皮绕左缘翻开：锚点置左中，position 同步修正（改锚点会移动 layer）
    front.layer.anchorPoint = CGPoint(x: 0, y: 0.5)
    front.layer.position = CGPoint(x: 0, y: b.midY)
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
/// 飞行与淡出用 `CADisplayLink` 逐帧驱动，不走 `UIViewPropertyAnimator`：
/// 起止都是「平移 + 旋转 + 缩放」的复合 `CGAffineTransform`，animator 对
/// 这种 transform 的插值落点会漂（真机实测合上后卡片落点偏离文件夹，
/// 与 Expo 侧不一致），且 `finishAnimation(at: .current)` 对已跑完的
/// animator 是未定义行为，「延迟期间保持旧值」也得靠 DispatchWorkItem
/// 手动补。逐帧显式按分量插值（translate/rotate/scale 各自 lerp）与 RN
/// 侧 transform 数组的逐项插值同构，落点逐像素一致；中途反转从当前进度
/// 续上，不会跳回上一次的目标值。曲线与跟手阶段共用 `CubicEase`。
private final class MiniLeaf: UIView {
  private let leaflet = ArchiveLeafletView()
  /// transform 载体。leaf 自身必须永远保持 identity：UIKit 的 frame setter
  /// 在 transform ≠ identity 时会按缩放反推 bounds（合上态 scale 0.6476 会把
  /// 210×268 撑成 324×414，卡片内容整体错位）—— 展开态是纯平移所以只在
  /// 合上后暴露，表现为「出发正确、收回落点错」。Expo（Yoga）与 Android
  /// （graphicsLayer）布局与变换分离，没有这条耦合。
  private let content = UIView()
  private let index: Int
  private let count: Int

  /// 飞行进度：0 = 闭合位、1 = 展开位。
  private var progress: CGFloat = 0
  /// 可见度：1 = 厚沓可见、0 = 飞出后淡出。
  private var fade: CGFloat = 1

  // 两条过渡各自的起点与起跑时刻（时刻已含延迟，CACurrentMediaTime 口径）
  private var flyFrom: CGFloat = 0
  private var flyTo: CGFloat = 0
  private var flyStart: CFTimeInterval = 0
  private var fadeFrom: CGFloat = 1
  private var fadeTo: CGFloat = 1
  private var fadeStart: CFTimeInterval = 0

  /// CADisplayLink 强引用 target，离屏必须手动断（同 ReminderCardStackView）
  private var link: CADisplayLink?

  init(entry: ArchiveEntry, index: Int, count: Int) {
    self.index = index
    self.count = count
    super.init(frame: .zero)
    leaflet.configure(entry: entry)
    content.addSubview(leaflet)
    addSubview(content)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      link?.invalidate()
      link = nil
    }
  }

  deinit {
    // link 强引用 self，只靠 didMoveToWindow 断不掉「从未离屏就随层级一起
    // 释放」的角况（CADisplayLink 挂在 main runloop 上，会一直持有 target）
    MainActor.assumeIsolated {
      link?.invalidate()
      link = nil
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    content.frame = bounds
    leaflet.frame = content.bounds
  }

  func applyOpen(_ open: Bool, animated: Bool) {
    stopLink()
    archiveDebug.log(
      "applyOpen index=\(self.index) open=\(open) animated=\(animated) progress=\(self.progress)"
    )
    guard animated && !Motion.reduced else {
      progress = open ? 1 : 0
      fade = open ? 0 : 1
      render()
      return
    }

    // 飞行与淡出是两条独立过渡（时长 / 起点都不同），各自从当前值起跑
    let now = CACurrentMediaTime()
    flyFrom = progress
    flyTo = open ? 1 : 0
    flyStart = now
      + (open ? Beat.takeoffDelay(index, count) : Beat.returnDelay(index))
    fadeFrom = fade
    fadeTo = open ? 0 : 1
    // 展开：落点前 crossFade 起淡，与列表卡淡入交叉；合上：与飞行同刻
    let fadeDelay = open
      ? Beat.takeoffDelay(index, count) + Beat.flyDuration(index) - Beat.crossFade
      : Beat.returnDelay(index)
    fadeStart = now + max(0, fadeDelay)
    startLink()
  }

  private func startLink() {
    guard link == nil else { return }
    // .common 而非 .default：滚动（tracking 模式）期间卡片仍在飞
    let link = CADisplayLink(target: self, selector: #selector(step))
    link.add(to: .main, forMode: .common)
    self.link = link
  }

  private func stopLink() {
    link?.invalidate()
    link = nil
  }

  @objc private func step() {
    let now = CACurrentMediaTime()
    var running = false
    if now >= flyStart {
      let t = min(1, (now - flyStart) / Beat.flyDuration(index))
      progress = lerp(flyFrom, flyTo, CubicEase.value(at: t, Beat.flyP1, Beat.flyP2))
      if t < 1 { running = true } else {
        archiveDebug.log("fly done index=\(self.index) progress=\(self.progress)")
      }
    } else {
      running = true  // 延迟期间保持旧值（CSS transition-delay 语义）
    }
    if now >= fadeStart {
      let t = min(1, (now - fadeStart) / Beat.leafOpacity)
      fade = lerp(fadeFrom, fadeTo, CubicEase.value(at: t, Beat.cssP1, Beat.cssP2))
      if t < 1 { running = true }
    } else {
      running = true
    }
    render()
    if !running { stopLink() }
  }

  /// 按当前进度摆位：progress=0 是闭合厚沓、1 是第 index+1 个列表卡位。
  private func render() {
    let step = Beat.stackStep(count)
    let x = lerp(-7 + CGFloat(index) * 6 * step, CGFloat(index + 1) * Geo.pitch, progress)
    let y = lerp(-6 + CGFloat(index) * 7 * step, 0, progress)
    let angle = lerp((-4 + CGFloat(index) * 3.5 * step) * .pi / 180, 0, progress)
    let scale = lerp(Geo.stackScale, 1, progress)
    content.transform = CGAffineTransform.identity
      .translatedBy(x: x, y: y)
      .rotated(by: angle)
      .scaledBy(x: scale, y: scale)
    content.alpha = fade
  }
}

// MARK: - 水平列表里的说明书卡位

/// 水平列表里的说明书卡位：平时透明，展开时按反转顺序交叉淡入。
private final class LeafletSlot: PressScaleButton {
  let entry: ArchiveEntry
  private let index: Int
  private let count: Int
  private let leaflet = ArchiveLeafletView()
  private var animators: [UIViewPropertyAnimator] = []
  /// 排了延迟的淡入任务。理由同 MiniLeaf：`startAnimation(afterDelay:)`
  /// 会在创建时就把模型 alpha 改成终值，延迟期间不保持旧值。
  private var pendingStarts: [DispatchWorkItem] = []

  init(entry: ArchiveEntry, index: Int, count: Int) {
    self.entry = entry
    self.index = index
    self.count = count
    super.init(frame: .zero)
    backgroundColor = .clear
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

  func applyOpen(_ open: Bool, animated: Bool) {
    isUserInteractionEnabled = open
    stopAnimators()
    guard animated else {
      alpha = open ? 1 : 0
      return
    }
    // 淡入起点 = 对应飞行卡落点前 120ms，两卡交叉淡入、落点像素级一致
    let delay =
      open
      ? Beat.takeoffDelay(index, count) + Beat.flyDuration(index) - 0.12 : 0
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      let animator = UIViewPropertyAnimator(
        duration: Beat.slotFade, timingParameters: Beat.cssEase)
      animator.addAnimations { self.alpha = open ? 1 : 0 }
      animator.startAnimation()
      self.animators.append(animator)
    }
    pendingStarts = [work]
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0, delay), execute: work)
  }

  private func stopAnimators() {
    pendingStarts.forEach { $0.cancel() }
    pendingStarts = []
    for animator in animators {
      animator.stopAnimation(false)
      animator.finishAnimation(at: .current)
    }
    animators.removeAll()
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
