import CoreGraphics
import UIKit

/// 设计稿的动画节奏工具。
///
/// 设计稿里所有曲线都写成 `cubic-bezier(x1, y1, x2, y2)`（见两个组件的注释），
/// 原生侧只有两处对应物：
/// - `UICubicTimingParameters(controlPoint1:controlPoint2:)` —— 交给
///   `UIViewPropertyAnimator` 驱动 layer 属性过渡；
/// - `CubicEase` —— 自己按帧推进的标量（手势跟手阶段的浮起量），
///   与 RN worklet 里逐帧读 shared value 的行为同构。
///
/// 顺带收一个「减弱动态」判断：两端都不引第三方动画库，时长统一在这里归零。
/// 标 `@MainActor` 是因为 `UICubicTimingParameters` 与 `UIAccessibility`
/// 本身都是主 actor 隔离的，所有调用点也都在 UI 线程。
@MainActor
enum Motion {
  /// 自定义三次贝塞尔曲线参数（与 CSS `cubic-bezier()` 同口径）。
  static func cubic(
    _ x1: CGFloat, _ y1: CGFloat, _ x2: CGFloat, _ y2: CGFloat
  ) -> UICubicTimingParameters {
    UICubicTimingParameters(
      controlPoint1: CGPoint(x: x1, y: y1), controlPoint2: CGPoint(x: x2, y: y2))
  }

  /// 系统「减弱动态」是否开启。开启时所有过渡时长按 0 处理（直接落位）。
  static var reduced: Bool { UIAccessibility.isReduceMotionEnabled }
}

/// cubic-bezier 求值：给定线性进度 `t` 返回缓动后的进度。
///
/// 控制点 x 单调（合法曲线必满足），用二分解 `x(s) = t` 再代入 `y(s)`。
/// 每帧调一次、20 次迭代足够收敛到 1e-4。
enum CubicEase {
  static func value(at t: CGFloat, _ p1: CGPoint, _ p2: CGPoint) -> CGFloat {
    guard t > 0 else { return 0 }
    guard t < 1 else { return 1 }
    var low: CGFloat = 0
    var high: CGFloat = 1
    var s: CGFloat = t
    for _ in 0..<20 {
      let x = component(s, p1.x, p2.x)
      if abs(x - t) < 1e-4 { break }
      if x < t { low = s } else { high = s }
      s = (low + high) / 2
    }
    return component(s, p1.y, p2.y)
  }

  /// 三次贝塞尔的单个分量：`3(1-s)²s·a + 3(1-s)s²·b + s³`。
  private static func component(_ s: CGFloat, _ a: CGFloat, _ b: CGFloat) -> CGFloat {
    let u = 1 - s
    return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s
  }
}

/// 线性插值。跟手公式与设计稿的三段 lerp 同构。
@inline(__always)
func lerp(_ from: CGFloat, _ to: CGFloat, _ t: CGFloat) -> CGFloat {
  from + (to - from) * t
}
