import UIKit

/// 渐变层视图：`layerClass` 直接是 `CAGradientLayer`，Auto Layout 友好。
///
/// 设计稿里所有渐变都写成 CSS `linear-gradient(160deg, …)` 这种带角度的形式，
/// 原生侧按「角度 → 归一化起止点」换算后直接设 `startPoint` / `endPoint`
/// （换算表与 Android 端 `GRAD_160` / `GRAD_135` 一致）。
final class GradientView: UIView {
  override class var layerClass: AnyClass { CAGradientLayer.self }

  private var gradientLayer: CAGradientLayer { layer as! CAGradientLayer }

  /// `configure` 收到的原始色标。动态色一塞进 `CAGradientLayer` 就固化成
  /// CGColor，明暗切换不会自动更新，必须留原值按新 traits 重新解析
  private var palette: [UIColor] = []

  /// 配置渐变。
  /// - Parameters:
  ///   - colors: 色标（原生不支持 color-mix，半透明色由调用方预先混合）。
  ///   - start: 起点，单位坐标（0,0 = 左上）。
  ///   - end: 终点，单位坐标。
  ///   - locations: 可选色标位置，与 colors 等长。
  func configure(
    colors: [UIColor], start: CGPoint, end: CGPoint, locations: [CGFloat]? = nil
  ) {
    palette = colors
    gradientLayer.startPoint = start
    gradientLayer.endPoint = end
    gradientLayer.locations = locations?.map { NSNumber(value: Double($0)) }
    applyPalette()
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    // 明暗翻面时按新 traits 重解析色标。首次 configure 时视图通常还没进窗口，
    // traits 是默认的亮色档 —— 进窗口后这次回调会把渐变纠正到当前主题
    guard traitCollection.hasDifferentColorAppearance(comparedTo: previousTraitCollection)
    else { return }
    applyPalette()
  }

  private func applyPalette() {
    gradientLayer.colors = palette.map { $0.resolvedColor(with: traitCollection).cgColor }
  }
}
