import UIKit

/// 带闭包回调的 `UIButton`。界面上随手放按钮用，不必再写 target-action。
final class ClosureButton: UIButton {
  var onTap: (() -> Void)?

  init(identifier: String, onTap: @escaping () -> Void) {
    super.init(frame: .zero)
    self.accessibilityIdentifier = identifier
    self.onTap = onTap
    addTarget(self, action: #selector(tapped), for: .touchUpInside)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  @objc private func tapped() {
    onTap?()
  }
}

/// 少量原生控件的薄封装。
///
/// 只收「每次都要重写一遍的那几行」。单选走 `presentSingleChoice`，
/// 日期走 `presentDatePicker`，都在 `Presenters.swift`。
@MainActor
public enum NativeControls {

  enum ButtonRole {
    case filled
    case destructive
  }

  /// 界面上的胶囊主按钮。标题、品牌色、测试标识、点击一次给齐。
  ///
  /// 放进视图后自己约束位置；钉在底部安全区用 `UIView.pinBottomCapsule`。
  /// 导航栏按钮走 `UIBarButtonItem`，表单行内按钮走 `FormRowSpec.button`。
  static func filledButton(
    titleKey: String,
    identifier: String,
    role: ButtonRole = .filled,
    onTap: @escaping () -> Void
  ) -> ClosureButton {
    var configuration = UIButton.Configuration.filled()
    configuration.title = L10n.shared.t(titleKey)
    configuration.cornerStyle = .capsule
    configuration.contentInsets = NSDirectionalEdgeInsets(
      top: Theme.Space.md, leading: Theme.Space.xl, bottom: Theme.Space.md,
      trailing: Theme.Space.xl)
    switch role {
    case .filled:
      configuration.baseBackgroundColor = Theme.Color.primary
      configuration.baseForegroundColor = Theme.Color.onPrimary
    case .destructive:
      configuration.baseBackgroundColor = Theme.Color.danger
      configuration.baseForegroundColor = .white
    }
    let button = ClosureButton(identifier: identifier, onTap: onTap)
    button.configuration = configuration
    button.translatesAutoresizingMaskIntoConstraints = false
    return button
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
}

/// 姓名首字头像。有照片时优先用照片。
@MainActor
enum Avatars {
  static func image(for person: Person) -> UIImage? {
    if let uri = person.avatarUri, let url = URL(string: uri),
      let photo = UIImage(contentsOfFile: url.path)
    {
      return photo
    }
    return initial(for: person.name)
  }

  static func initial(for name: String) -> UIImage? {
    let initial = String(name.prefix(1))
    let size = CGSize(width: Theme.Size.avatar, height: Theme.Size.avatar)
    let color = Theme.Color.hex(pickAvatarColor(name: name))
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      color.setFill()
      UIBezierPath(ovalIn: CGRect(origin: .zero, size: size)).fill()
      let attributes: [NSAttributedString.Key: Any] = [
        .foregroundColor: UIColor.white,
        .font: Theme.Font.avatarInitial,
      ]
      let textSize = initial.size(withAttributes: attributes)
      initial.draw(
        in: CGRect(
          x: (size.width - textSize.width) / 2,
          y: (size.height - textSize.height) / 2,
          width: textSize.width,
          height: textSize.height
        ),
        withAttributes: attributes
      )
    }
  }
}

extension UIView {
  /// 把胶囊按钮钉在底部安全区。返回底边约束，键盘顶起时改 `constant`。
  @discardableResult
  func pinBottomCapsule(_ button: UIButton) -> NSLayoutConstraint {
    if button.superview !== self {
      addSubview(button)
    }
    button.translatesAutoresizingMaskIntoConstraints = false
    let bottom = button.bottomAnchor.constraint(
      equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -Theme.Space.lg)
    NSLayoutConstraint.activate([
      button.leadingAnchor.constraint(equalTo: leadingAnchor, constant: Theme.Space.page),
      button.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -Theme.Space.page),
      button.heightAnchor.constraint(equalToConstant: Theme.Size.button),
      bottom,
    ])
    return bottom
  }
}
