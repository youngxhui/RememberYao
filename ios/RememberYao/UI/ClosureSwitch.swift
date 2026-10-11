import UIKit

/// 带闭包回调的 `UISwitch`。
///
/// UIKit 只有 target-action，而设置页 / 表单里每个开关改写的字段都不同。
/// 用 tag 存动作索引会退化成一张 switch 表；用闭包直接写在本行旁边，
/// 读起来就是「这个开关改这个值」。除此之外它就是普通 `UISwitch`。
final class ClosureSwitch: UISwitch {
  var onChange: ((Bool) -> Void)?

  init(isOn: Bool, identifier: String? = nil) {
    super.init(frame: .zero)
    self.isOn = isOn
    self.accessibilityIdentifier = identifier
    addTarget(self, action: #selector(valueChanged), for: .valueChanged)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  @objc private func valueChanged() {
    onChange?(isOn)
  }
}
