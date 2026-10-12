import UIKit
import Observation

/// 持有 ViewModel 的 VC 标记协议。
///
/// 与 `AppViewModel` 同为主 actor 隔离，避免 Swift 6 并发检查报
/// 「conformance crosses into main actor-isolated code」。
@MainActor
protocol ViewModelHolder: AnyObject {
  var viewModel: AppViewModel { get }

  /// ViewModel 数据变更后调用。默认空实现，子类按需覆盖。
  func viewModelDataChanged()
}

extension ViewModelHolder {
  func viewModelDataChanged() {}
}

extension UIViewController {

  /// 注册对 ViewModel 数据变更的持续观察。
  ///
  /// 在 [viewDidLoad] 末尾调用一次。`withObservationTracking` 是**一次性**的：
  /// 第一次变更后就停止跟踪，所以 onChange 里重新注册自己，形成持续观察
  /// —— 否则只有第一笔写入能通知到屏幕，之后的变更就哑掉了。
  ///
  /// 观察粒度是属性级：屏幕在 `viewModelDataChanged()` / `reload()` 里只读
  /// 自己关心的集合，无关集合的变更虽然也会触发回调，但重算只发生在读到的
  /// 那些数据上。
  func registerViewModelObservation() {
    guard let holder = self as? any ViewModelHolder else { return }
    let viewModel = holder.viewModel
    withObservationTracking {
      // 读全部集合建立观察关系：任一集合变化都会通知本屏
      _ = viewModel.medications
      _ = viewModel.persons
      _ = viewModel.plans
      _ = viewModel.reminders
      _ = viewModel.usages
      _ = viewModel.packs
      _ = viewModel.blisterSlots
      _ = viewModel.settings
    } onChange: { [weak self] in
      Task { @MainActor in
        // 通过 existential 调用：viewModelDataChanged 现在是协议正式要求，
        // 存在于 witness table 里，可以正确分派到子类覆写。
        (self as? any ViewModelHolder)?.viewModelDataChanged()
        // 重新注册，继续观察后续变更
        self?.registerViewModelObservation()
      }
    }
  }
}
