import UIKit

/// 表单输入单元格：左侧 label + 右侧 `UITextField`。
///
/// 这是本项目**唯一**自造的单元格：`UIListContentConfiguration` 没有「左标签 +
/// 右输入框」这种组合，UIKit 也没提供现成的。它只负责外观与第一响应者转发，
/// 不含任何业务校验。
final class FieldCell: UITableViewCell, UITextFieldDelegate {
  static let reuseID = "FieldCell"

  /// 一个输入字段。
  struct Field {
    let id: String
    let labelKey: String
    /// label 的占位符参数（如 `["name": 药名, "unit": 片]`）。
    var labelArgs: [String: String]
    var value: String
    let placeholderKey: String?
    var keyboardType: UIKeyboardType
    /// 只读字段点一下弹选择器，不弹键盘。
    var readOnly: Bool
    /// 右侧展示的勾选标记（已选中的选项）。
    var showsCheckmark: Bool

    init(
      id: String,
      labelKey: String,
      value: String = "",
      placeholderKey: String? = nil,
      keyboardType: UIKeyboardType = .default,
      readOnly: Bool = false,
      showsCheckmark: Bool = false,
      labelArgs: [String: String] = [:]
    ) {
      self.id = id
      self.labelKey = labelKey
      self.value = value
      self.placeholderKey = placeholderKey
      self.keyboardType = keyboardType
      self.readOnly = readOnly
      self.showsCheckmark = showsCheckmark
      self.labelArgs = labelArgs
    }
  }

  private let label = UILabel()
  fileprivate let textField = UITextField()

  /// 值变化回调。用闭包而不是 delegate 链：表单屏要收集十几个字段的值，
  /// delegate 转发会让每个屏都多写一层。
  var onValueChange: ((String) -> Void)?
  /// 只读字段被点击（要弹选择器）。
  var onReadOnlyTap: (() -> Void)?

  private var field: Field?

  override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
    super.init(style: .default, reuseIdentifier: reuseIdentifier)
    selectionStyle = .none

    label.font = Theme.Font.body
    label.textColor = Theme.Color.label
    label.adjustsFontForContentSizeCategory = true
    label.setContentHuggingPriority(.defaultHigh, for: .horizontal)

    textField.borderStyle = .none
    textField.font = Theme.Font.body
    textField.textAlignment = .right
    textField.adjustsFontForContentSizeCategory = true
    textField.delegate = self
    textField.addTarget(self, action: #selector(editingChanged), for: .editingChanged)
    textField.clearButtonMode = .whileEditing

    let stack = UIStackView(arrangedSubviews: [label, textField])
    stack.axis = .horizontal
    stack.spacing = Theme.Space.md
    stack.alignment = .center
    stack.translatesAutoresizingMaskIntoConstraints = false
    contentView.addSubview(stack)

    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(equalTo: contentView.topAnchor, constant: Theme.Space.sm),
      stack.leadingAnchor.constraint(
        equalTo: contentView.leadingAnchor, constant: Theme.Space.lg),
      stack.trailingAnchor.constraint(
        equalTo: contentView.trailingAnchor, constant: -Theme.Space.lg),
      stack.bottomAnchor.constraint(
        equalTo: contentView.bottomAnchor, constant: -Theme.Space.sm),
      stack.heightAnchor.constraint(greaterThanOrEqualToConstant: 36),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  func configure(with field: Field) {
    self.field = field
    label.text = L10n.shared.t(field.labelKey, field.labelArgs)
    textField.text = field.value
    textField.placeholder = field.placeholderKey.map { L10n.shared.t($0) }
    textField.keyboardType = field.keyboardType
    textField.isUserInteractionEnabled = !field.readOnly
    textField.textColor = field.readOnly ? Theme.Color.labelSecondary : Theme.Color.label
    accessoryType = field.showsCheckmark ? .checkmark : .none
    // 只读字段：点整行弹选择器
    if field.readOnly {
      let tap = UITapGestureRecognizer(target: self, action: #selector(rowTapped))
      contentView.addGestureRecognizer(tap)
      contentView.isUserInteractionEnabled = true
    }
  }

  @objc private func editingChanged() {
    field?.value = textField.text ?? ""
    onValueChange?(textField.text ?? "")
  }

  @objc private func rowTapped() {
    onReadOnlyTap?()
  }

  func textFieldDidBeginEditing(_ textField: UITextField) {
    // 右侧输入框左对齐更易读，系统「设置」里的输入行也是这个行为
    textField.textAlignment = .left
    textField.clearButtonMode = .whileEditing
  }

  func textFieldDidEndEditing(_ textField: UITextField) {
    textField.textAlignment = .right
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    // 复用必须清闭包，否则上一行的回调会打到这一行上
    onValueChange = nil
    onReadOnlyTap = nil
    textField.text = ""
    textField.isUserInteractionEnabled = true
    contentView.gestureRecognizers?.forEach(contentView.removeGestureRecognizer)
    accessoryType = .none
  }
}
