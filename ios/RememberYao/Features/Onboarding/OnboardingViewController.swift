import UIKit

/// 引导页：首次启动的两页产品介绍。
///
/// 放在 tab 组之外，全屏无 tab 栏（与 Android 端 `OnboardingScreen` 一致）。
/// 翻页用 `UIPageViewController`、进度用 `UIPageControl`、主操作用系统
/// `UIButton.Configuration.filled()` —— 引导页没有需要自造的控件。
final class OnboardingViewController: UIViewController {
  private let onFinish: () -> Void

  private let pages: [(titleKey: String, subtitleKey: String, symbol: String)] = [
    ("onboarding.page1Title", "onboarding.page1Subtitle", "pills.fill"),
    ("onboarding.page2Title", "onboarding.page2Subtitle", "person.2.fill"),
  ]

  private let pageControl = UIPageControl()
  private let primaryButton = UIButton(type: .system)

  private var pageViewController: UIPageViewController!
  private var currentIndex = 0

  init(onFinish: @escaping () -> Void) {
    self.onFinish = onFinish
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = Theme.Color.canvas
    // 主按钮先入层级：pageControl 的下边缘要锚到它上面，激活约束时
    // 两个视图必须有共同祖先，否则直接崩
    configurePrimaryButton()
    configurePageViewController()
  }

  // MARK: - 翻页

  private func configurePageViewController() {
    pageViewController = UIPageViewController(
      transitionStyle: .scroll,
      navigationOrientation: .horizontal
    )
    pageViewController.dataSource = self
    pageViewController.delegate = self

    pageControl.numberOfPages = pages.count
    pageControl.currentPage = 0
    pageControl.currentPageIndicatorTintColor = Theme.Color.primary
    pageControl.pageIndicatorTintColor = Theme.Color.hairline
    pageControl.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(pageControl)

    addChild(pageViewController)
    view.addSubview(pageViewController.view)
    pageViewController.view.translatesAutoresizingMaskIntoConstraints = false
    pageViewController.didMove(toParent: self)

    NSLayoutConstraint.activate([
      pageViewController.view.topAnchor.constraint(equalTo: view.topAnchor),
      pageViewController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      pageViewController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      pageViewController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),

      pageControl.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      pageControl.bottomAnchor.constraint(
        equalTo: primaryButton.topAnchor, constant: -Theme.Space.xl),
    ])

    pageViewController.setViewControllers(
      [page(at: 0)], direction: .forward, animated: false)

    // pageVC 的 view 是后加的、铺满全屏且不透明，z 序压在按钮和页码点上面。
    // 不显式置顶的话，最后一屏既滑不动、也点不到「开始使用」—— 用户会直接
    // 卡死在引导页进不了主界面。UIPageViewController 每次翻页还会重建内部
    // 视图层级，所以每次 setViewControllers 后都要重新置顶。
    bringOverlaysToFront()
  }

  /// 把按钮与页码点挪到最上层。翻页会重建 pageVC 内部视图，得重复调。
  private func bringOverlaysToFront() {
    view.bringSubviewToFront(pageControl)
    view.bringSubviewToFront(primaryButton)
  }

  private func page(at index: Int) -> UIViewController {
    let spec = pages[index]
    let controller = UIViewController()
    controller.view.backgroundColor = Theme.Color.canvas
    // 翻页会重建页面控制器，靠引用比较不可靠，用 tag 记索引
    controller.view.tag = index

    let symbol = UIImageView(image: UIImage(systemName: spec.symbol))
    symbol.tintColor = Theme.Color.primary
    symbol.contentMode = .scaleAspectFit
    symbol.preferredSymbolConfiguration = UIImage.SymbolConfiguration(
      pointSize: 72, weight: .light)
    symbol.translatesAutoresizingMaskIntoConstraints = false

    let title = UILabel()
    title.text = L10n.shared.t(spec.titleKey)
    title.font = Theme.Font.largeTitle
    title.textColor = Theme.Color.label
    title.textAlignment = .center
    title.adjustsFontForContentSizeCategory = true
    title.numberOfLines = 0
    title.translatesAutoresizingMaskIntoConstraints = false

    let subtitle = UILabel()
    subtitle.text = L10n.shared.t(spec.subtitleKey)
    subtitle.font = Theme.Font.body
    subtitle.textColor = Theme.Color.labelSecondary
    subtitle.textAlignment = .center
    subtitle.adjustsFontForContentSizeCategory = true
    subtitle.numberOfLines = 0
    subtitle.translatesAutoresizingMaskIntoConstraints = false

    let stack = UIStackView(arrangedSubviews: [symbol, title, subtitle])
    stack.axis = .vertical
    stack.spacing = Theme.Space.lg
    stack.alignment = .center
    stack.setCustomSpacing(Theme.Space.xxl, after: symbol)
    stack.translatesAutoresizingMaskIntoConstraints = false
    controller.view.addSubview(stack)

    NSLayoutConstraint.activate([
      stack.centerYAnchor.constraint(equalTo: controller.view.centerYAnchor),
      stack.leadingAnchor.constraint(
        equalTo: controller.view.leadingAnchor, constant: Theme.Space.xxl),
      stack.trailingAnchor.constraint(
        equalTo: controller.view.trailingAnchor, constant: -Theme.Space.xxl),
      symbol.heightAnchor.constraint(equalToConstant: 96),
    ])

    // 翻页后要同步页码与按钮文案：scroll 转场下只在交互结束时触发一次，
    // 代码驱动的 setViewControllers 不触发，所以 primaryTapped 里也同步了一份
    return controller
  }

  // MARK: - 主按钮

  private func configurePrimaryButton() {
    var configuration = UIButton.Configuration.filled()
    configuration.cornerStyle = .capsule
    // 不显式给色就会退回系统蓝：filled() 的底色取自 tintColor，而引导页在
    // tab 组之外、没有 tab 栏注入品牌 tint
    configuration.baseBackgroundColor = Theme.Color.primary
    configuration.baseForegroundColor = Theme.Color.onPrimary
    configuration.contentInsets = NSDirectionalEdgeInsets(
      top: Theme.Space.md, leading: Theme.Space.xl, bottom: Theme.Space.md,
      trailing: Theme.Space.xl)
    primaryButton.configuration = configuration
    primaryButton.configurationUpdateHandler = { [weak self] button in
      guard let self else { return }
      var config = button.configuration ?? configuration
      config.title = L10n.shared.t(
        self.currentIndex == self.pages.count - 1
          ? "onboarding.start" : "onboarding.next")
      button.configuration = config
    }
    primaryButton.addTarget(self, action: #selector(primaryTapped), for: .touchUpInside)
    primaryButton.accessibilityIdentifier = "onboarding-primary-button"
    primaryButton.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(primaryButton)

    NSLayoutConstraint.activate([
      primaryButton.leadingAnchor.constraint(
        equalTo: view.leadingAnchor, constant: Theme.Space.page),
      primaryButton.trailingAnchor.constraint(
        equalTo: view.trailingAnchor, constant: -Theme.Space.page),
      primaryButton.bottomAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -Theme.Space.xl),
      primaryButton.heightAnchor.constraint(equalToConstant: Theme.Size.button),
    ])
  }

  @objc private func primaryTapped() {
    let next = currentIndex + 1
    if next >= pages.count {
      onFinish()
      return
    }
    pageViewController.setViewControllers(
      [page(at: next)], direction: .forward, animated: true)
    currentIndex = next
    pageControl.currentPage = next
    primaryButton.setNeedsUpdateConfiguration()
    bringOverlaysToFront()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    primaryButton.setNeedsUpdateConfiguration()
  }
}

extension OnboardingViewController: UIPageViewControllerDataSource {
  func pageViewController(
    _ pageViewController: UIPageViewController,
    viewControllerBefore viewController: UIViewController
  ) -> UIViewController? {
    guard let index = index(of: viewController), index > 0 else { return nil }
    return page(at: index - 1)
  }

  func pageViewController(
    _ pageViewController: UIPageViewController,
    viewControllerAfter viewController: UIViewController
  ) -> UIViewController? {
    guard let index = index(of: viewController), index < pages.count - 1 else { return nil }
    return page(at: index + 1)
  }

  private func index(of controller: UIViewController) -> Int? {
    // 用 tag 记索引：翻页会重建页面控制器，靠引用比较不可靠
    controller.view.tag
  }
}

extension OnboardingViewController: UIPageViewControllerDelegate {
  func pageViewController(
    _ pageViewController: UIPageViewController,
    didFinishAnimating finished: Bool,
    previousViewControllers: [UIViewController],
    transitionCompleted completed: Bool
  ) {
    guard completed,
      let visible = pageViewController.viewControllers?.first
    else { return }
    currentIndex = visible.view.tag
    pageControl.currentPage = currentIndex
    primaryButton.setNeedsUpdateConfiguration()
    bringOverlaysToFront()
  }
}
