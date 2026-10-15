import UIKit

/// 胶囊筛选行里的一枚 chip。
struct FilterChipItem {
  /// 稳定键：选中态比较与回调都用它（不是标题 —— 标题会随语言变）。
  let key: String
  /// 标题。调用方现取现译后传进来，组件里不写死文案（AGENTS 规则 14）。
  let title: String
}

/// 胶囊筛选行（design/medications.html 的 `.chip-row`）：横向滚动的胶囊按钮组，
/// 单选、互斥，永远恰好有一项选中。
///
/// 与 Expo 版 `expo/src/screens/medica/filter-row.tsx` + `chip.ios.tsx` 是同一
/// 实现：chip 顺序即视觉顺序，材质用 iOS 26 液态玻璃
/// （`UIGlassEffect(.clear)`，`.clearGlass()` 的同款风格），选中态系统自动出
/// tint，我们只负责文字色。五枚 chip 加间距约 440pt，超出内容区宽度，所以必须
/// 横滑 —— 横滑交给原生 `UIScrollView`，不自己写。
///
/// 刻意关掉 `isInteractive`：点击时的放大回弹会让玻璃超出 chip 自身边界，
/// 上下遮挡，对筛选这种"看一眼就点一下"的低调控件太抢戏。
///
/// 高度由内容自撑（chip 的行高即整行高），系统大字号下会长高 —— 这正是要的
/// 原生行为，不要给固定高度。
@MainActor
final class FilterChipRow: UIView {

  /// 当前选中项的键。
  var selectedKey: String? {
    didSet { refreshSelection() }
  }

  /// 选中变化回调，回传新选中项的键。
  var onSelect: ((String) -> Void)?

  private let scrollView = UIScrollView()
  private let stackView = UIStackView()
  /// 装配顺序即视觉顺序。选中变化只改文字色，不重建按钮。
  private var chips: [(key: String, button: UIButton)] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    setUpScrollView()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  /// 装配整行。重复调用会先清掉旧按钮 —— 语言切换后刷新标题走这条路。
  ///
  /// - Parameters:
  ///   - identifierPrefix: 测试标识前缀，组件拼成 `<前缀><key>`。由调用方给
  ///     `<屏幕>-<角色>-`，组件自己不知道挂在哪个屏幕下。
  func configure(
    items: [FilterChipItem],
    selectedKey: String?,
    identifierPrefix: String,
    onSelect: @escaping (String) -> Void
  ) {
    self.onSelect = onSelect
    chips.forEach { $0.button.removeFromSuperview() }
    chips = items.map { item in
      let button = makeChip(
        key: item.key, title: item.title, identifierPrefix: identifierPrefix)
      stackView.addArrangedSubview(button)
      return (item.key, button)
    }
    self.selectedKey = selectedKey
  }

  // MARK: - 布局

  private func setUpScrollView() {
    scrollView.showsHorizontalScrollIndicator = false
    // 内容不满一屏时也留一点回弹：横滑有个明确的「到边了」反馈
    scrollView.alwaysBounceHorizontal = true
    addSubview(scrollView)
    scrollView.translatesAutoresizingMaskIntoConstraints = false

    stackView.axis = .horizontal
    stackView.alignment = .center
    stackView.spacing = Theme.Space.sm
    stackView.translatesAutoresizingMaskIntoConstraints = false
    scrollView.addSubview(stackView)

    NSLayoutConstraint.activate([
      scrollView.topAnchor.constraint(equalTo: topAnchor),
      scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
      scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),

      stackView.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor),
      // 左右页边距由外层容器控制：SwiftUI 的 padding 或 UIKit 的 header 约束
      stackView.leadingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.leadingAnchor),
      stackView.trailingAnchor.constraint(equalTo: scrollView.contentLayoutGuide.trailingAnchor),
      stackView.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor),
      // 横向滚动容器的高度由内容撑：chip 的行高即整行高，滚动方向不挤压它。
      // 这条等式让整行（进而 tableHeaderView）的高度不依赖任何外部给定值 ——
      // 宿主还是 0 高时也不会被压扁
      stackView.heightAnchor.constraint(equalTo: scrollView.frameLayoutGuide.heightAnchor),
    ])
  }

  // MARK: - chip

  private func makeChip(key: String, title: String, identifierPrefix: String)
    -> UIButton
  {
    // 用显式 UIGlassEffect 而不是 UIButton.Configuration.clearGlass()：
    // 后者把 isInteractive 锁成 true，点击时玻璃会放大超出 chip 边界，
    // 上下遮挡。手动创建可以把 isInteractive 关掉。
    let glass = UIGlassEffect(style: .clear)
    glass.isInteractive = false

    var configuration = UIButton.Configuration.plain()
    configuration.cornerStyle = .capsule
    configuration.title = title
    configuration.titleTextAttributesTransformer =
      UIConfigurationTextAttributesTransformer { incoming in
        var outgoing = incoming
        outgoing.font = Theme.Font.chip
        return outgoing
      }
    configuration.contentInsets = NSDirectionalEdgeInsets(
      top: Theme.Space.chipVertical, leading: Theme.Space.chipHorizontal,
      bottom: Theme.Space.chipVertical, trailing: Theme.Space.chipHorizontal)
    configuration.background.visualEffect = glass

    let button = UIButton(configuration: configuration)
    button.accessibilityIdentifier = "\(identifierPrefix)\(key)"
    button.addAction(
      UIAction { [weak self] _ in
        guard let self, self.selectedKey != key else { return }
        self.selectedKey = key
        self.onSelect?(key)
      },
      for: .touchUpInside
    )
    return button
  }

  private func refreshSelection() {
    for (key, button) in chips {
      let active = key == selectedKey
      var configuration = button.configuration ?? UIButton.Configuration.plain()
      configuration.baseForegroundColor =
        active ? Theme.Color.onGlassChipActive : Theme.Color.labelSecondary
      button.configuration = configuration
      button.isSelected = active
      button.accessibilityTraits = active ? [.button, .selected] : .button
    }
  }
}
