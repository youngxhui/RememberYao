import UIKit
import UserNotifications

/// 应用入口。
///
/// 纯代码 UI：没有 Storyboard、没有 `@IBOutlet`。所有界面在 `Features/*` 里用
/// `UIViewController` + Auto Layout 写，好处是 diff 可读、合并冲突少、能整文件
/// 搜索。`window` 在 `SceneDelegate` 里搭。
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  /// 通知交互委托。保存引用，App 存活期间一直有效。
  private let notificationDelegate = NotificationInteractionDelegate()

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = notificationDelegate

    // 冷启动：载数据 → 注册通知文案 → 请求权限。
    // 故意不 await：首屏不等通知就绪，权限弹窗也不会挡启动。
    Task { await AppEnvironment.shared.bootstrap() }
    return true
  }

  // MARK: - UISceneSession Lifecycle

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: nil, sessionRole: connectingSceneSession.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}

/// 通知交互委托：把「已服用 / 跳过」按钮的点击转给调度层。
///
/// 单独一个类而不是塞进 AppDelegate：AppDelegate 已经管生命周期，再塞通知回调
/// 会让「启动时发生了什么」变难读。另外前台收到通知时也要展示横幅，否则用户在
/// App 内完全看不到到点提醒。
final class NotificationInteractionDelegate: NSObject, UNUserNotificationCenterDelegate {
  /// 前台收到通知也展示横幅（与 Android 端一致）。
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions)
      -> Void
  ) {
    completionHandler([.banner, .list, .sound])
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    // 点击通知本体（打开 App）无需处理，由 App 内界面操作
    // response 不是 Sendable，不能直接跨 isolation 传；这里只把要用的两个
    // 字符串取出来，在 MainActor 上重组
    let reminderId = response.notification.request.content.userInfo["reminderId"] as? String
    let action = response.actionIdentifier
    Task { @MainActor in
      NotificationScheduler.shared.handleResponse(
        reminderId: reminderId, actionIdentifier: action)
    }
    completionHandler()
  }
}

/// 场景委托：搭 window 与根导航。
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private var coordinator: AppCoordinator?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: windowScene)
    let coordinator = AppCoordinator(window: window)
    coordinator.start()
    self.coordinator = coordinator
    self.window = window
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    // 回前台时重新同步一次：用户可能改了系统时间、或跨了天
    Task { @MainActor in
      await NotificationScheduler.shared.resync()
    }
  }
}
