import UIKit

extension UIViewController {
  /// 呈现 `UIAlertController` 并自动补上 iPad 锚点。
  ///
  /// iPad 上 `.actionSheet` 没有 popover 锚点会直接崩，每个调用点都写一遍
  /// 那四行太容易漏 —— 收到这里统一处理。
  func present(
    _ alert: UIAlertController, anchoredTo source: UIView, animated: Bool
  ) {
    if let popover = alert.popoverPresentationController {
      popover.sourceView = source
      popover.sourceRect = CGRect(
        x: source.bounds.midX, y: source.bounds.midY, width: 0, height: 0)
    }
    present(alert, animated: animated)
  }
}

extension UIViewController {
  /// 弹一个原生 actionSheet 单选（性别、单位、分类、间隔…）。
  ///
  /// 系统 actionSheet 就是 iOS 的原生单选器，比塞一个 `UIPickerView` 更符合
  /// 平台习惯 —— 设置页的间隔选择就是这么做的。列表屏和表单屏都要用，
  /// 所以挂在 `UIViewController` 上而不是某个基类里。
  func presentSingleChoice(
    titleKey: String,
    options: [(key: String, label: String)],
    selectedKey: String?,
    sourceView: UIView?,
    onSelect: @escaping (String) -> Void
  ) {
    let alert = UIAlertController(
      title: L10n.shared.t(titleKey), message: nil, preferredStyle: .actionSheet)
    for option in options {
      let isSelected = option.key == selectedKey
      alert.addAction(
        UIAlertAction(
          title: option.label + (isSelected ? "  ✓" : ""),
          style: isSelected ? .destructive : .default
        ) { _ in
          onSelect(option.key)
        })
    }
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    present(alert, anchoredTo: sourceView ?? view, animated: true)
  }

  /// 弹一个内嵌 `UIDatePicker` 的 actionSheet。
  ///
  /// 通过未文档化的 `contentViewController` 把选择器塞进 alert：系统没有
  /// 公开的「actionSheet + 日期」组合，三处表单都要同一套，收到这里。
  func presentDatePicker(
    titleKey: String,
    current: String?,
    maximumDate: Date? = nil,
    showsClear: Bool = false,
    onPicked: @escaping (String) -> Void,
    onClear: (() -> Void)? = nil
  ) {
    let picker = UIDatePicker()
    picker.datePickerMode = .date
    picker.preferredDatePickerStyle = .inline
    picker.maximumDate = maximumDate
    if let current, let date = DateKey.date(current) {
      picker.date = date
    }
    let alert = UIAlertController(
      title: L10n.shared.t(titleKey), message: nil, preferredStyle: .actionSheet)
    let container = UIViewController()
    container.view = picker
    container.preferredContentSize = CGSize(
      width: view.bounds.width - Theme.Space.xl, height: 420)
    alert.setValue(container, forKey: "contentViewController")
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.done"), style: .default) { _ in
        onPicked(DateKey.key(picker.date))
      })
    if showsClear {
      alert.addAction(
        UIAlertAction(title: L10n.shared.t("common.clear"), style: .destructive) { _ in
          onClear?()
        })
    }
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    present(alert, anchoredTo: view, animated: true)
  }
}
