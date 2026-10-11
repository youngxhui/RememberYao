import UIKit

/// 少量原生控件的薄封装。
///
/// 刻意保持薄：能直接用 `UIButton` / `UITableViewCell` 的地方就直接用，这里只收
/// 「每次都要重写一遍的那几行」—— 本地化标题、圆角、禁用态。不做设计系统，
/// 也不自造 chip / 卡片 / 输入盒（那些在 UIKit 侧都有原生对应物）。
@MainActor
public enum NativeControls {

  /// 主操作按钮。系统 `filled` 样式 + 本地化标题。
  public static func filledButton(
    titleKey: String, target: Any?, action: Selector
  ) -> UIButton {
    var configuration = UIButton.Configuration.filled()
    configuration.title = L10n.shared.t(titleKey)
    configuration.cornerStyle = .capsule
    configuration.contentInsets = NSDirectionalEdgeInsets(
      top: Theme.Space.md, leading: Theme.Space.xl, bottom: Theme.Space.md,
      trailing: Theme.Space.xl)
    let button = UIButton(type: .system)
    button.configuration = configuration
    button.addTarget(target, action: action, for: .touchUpInside)
    return button
  }

  /// 危险操作按钮（删除）。
  public static func destructiveButton(
    titleKey: String, target: Any?, action: Selector
  ) -> UIButton {
    var configuration = UIButton.Configuration.filled()
    configuration.title = L10n.shared.t(titleKey)
    configuration.cornerStyle = .capsule
    configuration.baseBackgroundColor = Theme.Color.danger
    configuration.baseForegroundColor = .white
    let button = UIButton(type: .system)
    button.configuration = configuration
    button.addTarget(target, action: action, for: .touchUpInside)
    return button
  }

  /// 文字标签（表单字段的 label）。
  public static func label(_ key: String) -> UILabel {
    let label = UILabel()
    label.text = L10n.shared.t(key)
    label.font = Theme.Font.caption
    label.textColor = Theme.Color.labelSecondary
    label.adjustsFontForContentSizeCategory = true
    return label
  }

  /// 带圆角描边的输入框。UIKit 没有现成的「label 在上 + 盒子」组合，这一层是
  /// 唯一值得留的自定义：它只包了 `UITextField` + 外观，不含任何业务。
  public static func textField(placeholderKey: String, keyboardType: UIKeyboardType = .default)
    -> UITextField
  {
    let field = UITextField()
    field.borderStyle = .roundedRect
    field.placeholder = L10n.shared.t(placeholderKey)
    field.keyboardType = keyboardType
    field.font = Theme.Font.body
    field.adjustsFontForContentSizeCategory = true
    field.heightAnchor.constraint(equalToConstant: Theme.Size.field).isActive = true
    return field
  }

  /// 二次确认删除弹窗。系统 `UIAlertController`，不要自己写 modal。
  public static func confirmDelete(
    titleKey: String, confirmKey: String,
    onConfirm: @escaping () -> Void,
    onCancel: @escaping () -> Void = {}
  ) -> UIAlertController {
    let alert = UIAlertController(
      title: L10n.shared.t(titleKey), message: nil, preferredStyle: .actionSheet)
    alert.addAction(
      UIAlertAction(title: L10n.shared.t(confirmKey), style: .destructive) { _ in
        onConfirm()
      })
    // 取消也要通知调用方：侧滑删除场景里 UIContextualAction 的 done 必须
    // 在两条路上都调，否则用户点取消后那一行卡在展开态
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel) { _ in
        onCancel()
      })
    return alert
  }

  /// 单选菜单。系统 `UIAlertController` 的 actionSheet 就是 iOS 原生单选器，
  /// 比塞一个 `UIPickerView` 更符合平台习惯（设置页的间隔选择就这么做）。
  public static func singleChoice(
    titleKey: String,
    options: [(key: String, value: String)],
    selected: String?,
    onSelect: @escaping (String) -> Void
  ) -> UIAlertController {
    let alert = UIAlertController(
      title: L10n.shared.t(titleKey), message: nil, preferredStyle: .actionSheet)
    for option in options {
      let isSelected = option.key == selected
      alert.addAction(
        UIAlertAction(
          title: option.value + (isSelected ? "  ✓" : ""), style: isSelected ? .destructive : .default
        ) { _ in
          onSelect(option.key)
        })
    }
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    return alert
  }
}

/// `UITableViewCell` 的原生内容配置快捷方式。
///
/// `UIListContentConfiguration` 已经覆盖了「主标题 + 副标题 + 图标 + 右侧值」
/// 的全部排列，自造单元格只会丢失系统大字号与无障碍适配。
@MainActor
public enum CellContent {
  public static func valueCell(title key: String, value: String? = nil) -> UIListContentConfiguration {
    var content = UIListContentConfiguration.valueCell()
    content.text = L10n.shared.t(key)
    content.secondaryText = value
    content.textProperties.color = Theme.Color.label
    content.secondaryTextProperties.color = Theme.Color.labelSecondary
    return content
  }

  public static func subtitleCell(title: String, subtitle: String? = nil) -> UIListContentConfiguration {
    var content = UIListContentConfiguration.subtitleCell()
    content.text = title
    content.secondaryText = subtitle
    content.textProperties.numberOfLines = 1
    content.secondaryTextProperties.numberOfLines = 2
    return content
  }

  public static func cell(title key: String) -> UIListContentConfiguration {
    var content = UIListContentConfiguration.cell()
    content.text = L10n.shared.t(key)
    return content
  }
}
