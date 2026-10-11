import UIKit

/// 根协调器：分流（引导页 / 主界面）并持有 tab 栏。
///
/// 与 Expo Router 的目录式路由不同，UIKit 侧用显式协调器：每个功能一个
/// `UIViewController` 工厂 + 一条 push 规则。项目只有十几个界面，显式比约定
/// 好查 —— 搜 `push(` 就知道有哪些跳转。
@MainActor
final class AppCoordinator: NSObject {
  private let window: UIWindow
  private let store = AppEnvironment.shared.store
  private var tabBarController: UITabBarController?

  /// 引导页是否已看过。
  private var onboardingSeen: Bool {
    get {
      // DEBUG 下可用启动参数直接进主界面，省得每次验证都要点两下引导页
      #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-skipOnboarding") { return true }
      #endif
      return UserDefaults.standard.bool(forKey: Self.onboardingKey)
    }
    set { UserDefaults.standard.set(newValue, forKey: Self.onboardingKey) }
  }

  private static let onboardingKey = "rememberyao.onboardingSeen"

  init(window: UIWindow) {
    self.window = window
  }

  func start() {
    showRoot()
  }

  /// 首屏：未看过引导页 → 引导页；否则 → 主界面。
  private func showRoot() {
    if onboardingSeen {
      showMain()
    } else {
      showOnboarding()
    }
  }

  private func showOnboarding() {
    let controller = OnboardingViewController { [weak self] in
      self?.onboardingSeen = true
      self?.showMain()
    }
    let navigation = UINavigationController(rootViewController: controller)
    setRoot(navigation, animated: false)
  }

  private func showMain() {
    let home = HomeViewController()
    let medica = MedicaListViewController()
    let profile = ProfileViewController()

    let tabs = makeTabBarController(
      tabs: [
        (home, "tab.home", "house", "house.fill"),
        (medica, "tab.medica", "cross.case", "cross.case.fill"),
        (profile, "tab.profile", "person", "person.fill"),
      ])
    self.tabBarController = tabs
    setRoot(tabs, animated: false)
    // 通知权限到这儿才要：引导页走完了，弹窗不会盖住 onboarding
    AppEnvironment.shared.requestNotificationPermissionIfNeeded()
  }

  private func makeTabBarController(
    tabs: [(controller: UIViewController, titleKey: String, icon: String, selectedIcon: String)]
  ) -> UITabBarController {
    let tabBar = UITabBarController()
    tabBar.viewControllers = tabs.map { entry in
      let navigation = UINavigationController(rootViewController: entry.controller)
      navigation.tabBarItem = UITabBarItem(
        title: L10n.shared.t(entry.titleKey),
        image: UIImage(systemName: entry.icon),
        selectedImage: UIImage(systemName: entry.selectedIcon)
      )
      return navigation
    }
    return tabBar
  }

  private func setRoot(_ controller: UIViewController, animated: Bool) {
    if animated {
      UIView.transition(
        with: window,
        duration: 0.3,
        options: .transitionCrossDissolve,
        animations: { self.window.rootViewController = controller }
      )
    } else {
      window.rootViewController = controller
    }
    window.makeKeyAndVisible()
  }

  /// 切换到指定 tab（调试页用）。
  func selectTab(index: Int) {
    tabBarController?.selectedIndex = index
  }
}
