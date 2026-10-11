import UIKit

/// 按压缩放到 0.97 的按钮。
///
/// 设计稿的 `:active` 反馈：文件夹 / 说明书卡位 130ms、「已服用」100ms，
/// 曲线都是 CSS 默认 ease 或弹回曲线，由调用方传。三处共用同一形态才抽出来；
/// 它只包「按压缩放」，不含任何业务。
class PressScaleButton: UIButton {
  /// 缩放目标；`nil` = 按钮自身。
  ///
  /// 卡位按钮自带透明内边距（230pt 卡位里放 210pt 卡片），缩放整颗会把
  /// 视觉卡面撑大，所以那两处传内部卡片视图。
  var scaleTarget: UIView?
  /// 按压时长：130ms（卡片）/ 100ms（按钮）。
  var pressDuration: TimeInterval = 0.13
  /// 按压曲线：CSS 默认 ease / 弹回曲线。
  var pressCurve = Motion.cubic(0.25, 0.1, 0.25, 1)

  private var pressAnimator: UIViewPropertyAnimator?

  private static let pressedTransform = CGAffineTransform(scaleX: 0.97, y: 0.97)

  override var isHighlighted: Bool {
    didSet {
      guard isHighlighted != oldValue else { return }
      let target = scaleTarget ?? self
      pressAnimator?.stopAnimation(true)
      pressAnimator = nil
      if Motion.reduced {
        target.transform = isHighlighted ? Self.pressedTransform : .identity
        return
      }
      let animator = UIViewPropertyAnimator(
        duration: pressDuration, timingParameters: pressCurve)
      animator.addAnimations {
        target.transform = self.isHighlighted ? Self.pressedTransform : .identity
      }
      animator.startAnimation()
      pressAnimator = animator
    }
  }
}
