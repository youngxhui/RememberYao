import UIKit
import Observation

/// 持有 ViewModel 的 VC 标记协议。
///
/// 与 `AppViewModel` 同为主 actor 隔离，避免 Swift 6 并发检查报
/// 「conformance crosses into main actor-isolated code」。
@MainActor
protocol ViewModelHolder: AnyObject {
  var viewModel: AppViewModel { get }

  /// ViewModel 数据变更后调用。
  ///
  /// 列表 / 表单基类已有默认实现（刷新本屏）。不给协议默认空实现：
  /// 否则 existential 分派会走空默认，盖住基类的刷新。
  func viewModelDataChanged()
}

extension UIViewController {

  /// 注册对 ViewModel 数据变更的持续观察。
  ///
  /// **只在基类 `viewDidLoad` 调一次**（`ListScreenViewController` /
  /// `FormScreenViewController`）。子类不要再调：`withObservationTracking`
  /// 每次变更会再注册自己，重复调用会让回调按 2、4、8 增长。
  /// 没有走这两个基类的屏幕（板装孪生）自己调一次。
  ///
  /// `withObservationTracking` 是一次性的：第一次变更后就停止跟踪，
  /// 所以 onChange 里重新注册自己，形成持续观察。
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
