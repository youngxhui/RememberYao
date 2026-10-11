import Foundation
import SwiftData

/// 应用级依赖容器。
///
/// 只有一个 `Store`，所以不值得引入依赖注入框架。但通知调度（AppDelegate 里
/// 的 `UNUserNotificationCenter` 回调）和 UI（各 ViewController）都要够到它，
/// 用一个 `@MainActor` 单例把这条通路显式化，比到处传参或隐式全局变量好找。
@MainActor
public final class AppEnvironment {
  public static let shared = AppEnvironment()

  public let container: ModelContainer
  public let store: Store

  private init() {
    let schema = AppSchema.schema
    let configuration = ModelConfiguration(
      schema: schema,
      // 关闭 cloudKit：用药数据只存本机，且要保证「卸载即删除」的隐私承诺
      cloudKitDatabase: .none
    )
    //  schema 不兼容时（开发期改表）直接重建，避免带着坏 schema 启动后每步都崩
    if let container = try? ModelContainer(for: schema, configurations: [configuration]) {
      self.container = container
    } else {
      // 只删主库文件不够：残留的 -wal / -shm 会让新库同样打不开，
      // 三个文件一起删才是「按新 schema 重建」
      let url = configuration.url
      for suffix in ["", "-wal", "-shm"] {
        try? FileManager.default.removeItem(at: URL(fileURLWithPath: url.path + suffix))
      }
      if let rebuilt = try? ModelContainer(for: schema, configurations: [configuration]) {
        container = rebuilt
      } else {
        // 删了库还打不开，就不是 schema 问题了（磁盘满 / 沙箱异常）。
        // 再 try! 就是启动即崩，所以退到内存库：至少能进界面、能看能点，
        // 代价只是本次运行不落盘 —— 比白屏崩溃好。
        let memoryOnly = ModelConfiguration(
          schema: schema, isStoredInMemoryOnly: true, cloudKitDatabase: .none)
        container = try! ModelContainer(for: schema, configurations: [memoryOnly])
      }
    }
    store = Store(container: container)
  }

  /// 冷启动：载数据 → 注册通知文案。
  ///
  /// 故意**不**在这里请求通知权限：权限弹窗是系统 alert，会在引导页刚显示时
  /// 盖上来，把用户卡在引导页外。改成进主界面时再请求（见
  /// `AppCoordinator.showMain`）—— 那时用户已经知道这个 App 干什么，
  /// 也更符合「用到时再要权限」的惯例。
  public func bootstrap() async {
    await store.load()
    NotificationScheduler.shared.registerLocalizedTexts()
  }

  /// 进主界面时请求通知权限。已授权或已拒绝过都直接返回，不会重复弹
  /// （iOS 对同一 App 只弹一次系统 alert）。
  public func requestNotificationPermissionIfNeeded() {
    Task { _ = await NotificationScheduler.shared.requestAuthorization() }
  }
}
