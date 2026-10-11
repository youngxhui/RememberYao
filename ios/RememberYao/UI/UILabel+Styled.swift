import UIKit

extension UILabel {
  /// 带字距的文本。设计稿的 `letter-spacing` 在原生侧只有 `kern` 一个对应物。
  ///
  /// 走 `NSAttributedString` 而不是 `label.text`：后者没有字距入口，
  /// 而这两个组件（说明书微缩印刷、磨砂卡大标题）的观感一半来自字距。
  func setStyledText(
    _ text: String, font: UIFont, color: UIColor, kern: CGFloat = 0
  ) {
    attributedText = NSAttributedString(
      string: text,
      attributes: [
        .font: font, .foregroundColor: color, .kern: kern,
      ])
  }
}
