import CoreGraphics
import UIKit

/// 设计 token 的唯一来源。
///
/// 禁止在界面里写死颜色 / 字号 / 间距 / 圆角，一律从这里取。语义色按用途命名
/// （`primary` 品牌、`success` 已服、`warning` 即将到期、`danger` 漏服），
/// 不按色相命名 —— 换主题时只改这里，界面一行不用动。
public enum Theme {
  // MARK: 语义色

  public enum Color {
    /// 品牌主色。
    ///
    /// 与 `Assets.xcassets/AccentColor.colorset` 的 Any / Dark 两档是同一个值，
    /// 改这里必须同步改那边：全局 tint（导航栏按钮、tab 选中项、filled() 按钮等）
    /// 由 `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME` 从资产目录取，
    /// 界面代码里的引用走这里。
    public static let primary = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.373, green: 0.847, blue: 0.776, alpha: 1) : #colorLiteral(red: 0.059, green: 0.463, blue: 0.431, alpha: 1) })
    /// 品牌色上的文字 / 图标。
    ///
    /// 亮色模式下 `primary` 是深青、暗色模式下是浅青，所以文字色要跟着反过来：
    /// 暗色下再用白字会糊在浅青底上看不清。`UIButton.Configuration.filled()`
    /// 不设这条就会退回系统蓝，引导页的主按钮会明显不像这个 App。
    public static let onPrimary = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.035, green: 0.145, blue: 0.129, alpha: 1) : .white })
    /// 液态玻璃 chip 选中态的文字色。选中态底是品牌色玻璃（偏深），配白字。
    ///
    /// 未选中态**不**给固定色：玻璃的明暗由背后的页面底色决定，暗色模式下未选中
    /// 那颗玻璃是深的，固定黑字会看不见 —— 那一边走自适应的 `labelSecondary`。
    /// 与 Expo 版 `theme.onGlassChipActive` 同值。
    public static let onGlassChipActive = UIColor.white
    /// 已服用。
    public static let success = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.404, green: 0.808, blue: 0.545, alpha: 1) : #colorLiteral(red: 0.145, green: 0.561, blue: 0.322, alpha: 1) })
    /// 即将到期 / 库存偏低。
    public static let warning = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.976, green: 0.784, blue: 0.298, alpha: 1) : #colorLiteral(red: 0.769, green: 0.537, blue: 0.031, alpha: 1) })
    /// 漏服 / 库存告急 / 删除。
    public static let danger = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.973, green: 0.443, blue: 0.443, alpha: 1) : #colorLiteral(red: 0.737, green: 0.176, blue: 0.176, alpha: 1) })

    /// 页面底色。
    public static let canvas = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.098, green: 0.106, blue: 0.118, alpha: 1) : #colorLiteral(red: 0.976, green: 0.976, blue: 0.973, alpha: 1) })
    /// 卡片底色。
    public static let card = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.169, green: 0.180, blue: 0.196, alpha: 1) : #colorLiteral(red: 1, green: 1, blue: 1, alpha: 1) })
    /// 分组卡片底色（比 card 略沉一档）。
    public static let cardSunken = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.129, green: 0.141, blue: 0.157, alpha: 1) : #colorLiteral(red: 0.953, green: 0.953, blue: 0.949, alpha: 1) })

    /// 主文字。
    public static let label = UIColor.label
    /// 次要文字。
    public static let labelSecondary = UIColor.secondaryLabel
    /// 三级文字 / 占位符。
    public static let labelTertiary = UIColor.tertiaryLabel

    /// 发丝线。
    public static let hairline = UIColor.separator
    /// 描边（输入盒）。
    public static let border = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.278, green: 0.290, blue: 0.310, alpha: 1) : #colorLiteral(red: 0.855, green: 0.863, blue: 0.867, alpha: 1) })
    /// 输入框底色。
    public static let field = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.224, green: 0.235, blue: 0.251, alpha: 1) : #colorLiteral(red: 0.961, green: 0.961, blue: 0.957, alpha: 1) })

    /// 语义色的浅色底（状态徽章、选中行）。与 `*` 主色同组翻面。
    public static let primarySoft = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.078, green: 0.192, blue: 0.176, alpha: 1) : #colorLiteral(red: 0.902, green: 0.957, blue: 0.945, alpha: 1) })
    public static let successSoft = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.075, green: 0.169, blue: 0.110, alpha: 1) : #colorLiteral(red: 0.918, green: 0.965, blue: 0.933, alpha: 1) })
    public static let warningSoft = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.200, green: 0.149, blue: 0.043, alpha: 1) : #colorLiteral(red: 0.992, green: 0.953, blue: 0.890, alpha: 1) })
    public static let dangerSoft = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.200, green: 0.086, blue: 0.086, alpha: 1) : #colorLiteral(red: 0.992, green: 0.925, blue: 0.925, alpha: 1) })
    /// 选中态灰底（中性徽章用）。
    public static let backgroundSelected = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.180, green: 0.192, blue: 0.208, alpha: 1) : #colorLiteral(red: 0.878, green: 0.882, blue: 0.902, alpha: 1) })

    /// 从 `#rrggbb` 建色（头像色板、药饼配色用）。
    public static func hex(_ value: String, alpha: CGFloat = 1) -> UIColor {
      guard let c = value.hexComponents else { return .gray }
      return UIColor(red: c.r, green: c.g, blue: c.b, alpha: c.a * alpha)
    }
  }

  // MARK: Mini Archive 展示色

  /// Mini Archive 收藏夹（`design/profile.html` 的 `--archive-*`）：青绿封皮 +
  /// 米白纸说明书。纸与印刷色是「实物」，不随明暗模式翻面；封皮 / 墨色 /
  /// 阴影跟随主题。
  public enum Archive {
    public enum Color {
      /// 封皮渐变上沿。
      public static let coverTop = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.078, green: 0.522, blue: 0.478, alpha: 1) : #colorLiteral(red: 0.298, green: 0.788, blue: 0.725, alpha: 1) })
      /// 封皮渐变下沿。
      public static let coverBottom = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.059, green: 0.463, blue: 0.431, alpha: 1) : #colorLiteral(red: 0.051, green: 0.580, blue: 0.533, alpha: 1) })
      /// 底板渐变上沿（文件夹舌片）。
      public static let tab = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.055, green: 0.420, blue: 0.384, alpha: 1) : #colorLiteral(red: 0.169, green: 0.690, blue: 0.635, alpha: 1) })
      /// 底板渐变下沿。
      public static let back = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.043, green: 0.329, blue: 0.306, alpha: 1) : #colorLiteral(red: 0.059, green: 0.463, blue: 0.431, alpha: 1) })
      /// 封皮主文字。
      public static let ink = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.851, green: 0.949, blue: 0.933, alpha: 1) : #colorLiteral(red: 0.024, green: 0.188, blue: 0.169, alpha: 1) })
      /// 封皮次要文字。
      public static let inkMuted = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.561, green: 0.788, blue: 0.753, alpha: 1) : #colorLiteral(red: 0.247, green: 0.490, blue: 0.455, alpha: 1) })
      /// 封皮装饰线。
      public static let line = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? UIColor(red: 217 / 255, green: 242 / 255, blue: 238 / 255, alpha: 0.16) : UIColor(red: 6 / 255, green: 48 / 255, blue: 43 / 255, alpha: 0.16) })
      /// 文件夹投影。
      public static let shadow = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? UIColor(white: 0, alpha: 0.5) : UIColor(red: 13 / 255, green: 148 / 255, blue: 136 / 255, alpha: 0.3) })
      /// 说明书纸面（不随明暗翻面）。
      public static let paper = UIColor(red: 1, green: 253 / 255, blue: 244 / 255, alpha: 1)
      /// 说明书印刷主色（不随明暗翻面）。
      public static let stampInk = UIColor(red: 74 / 255, green: 52 / 255, blue: 23 / 255, alpha: 1)
      /// 说明书印刷次色（不随明暗翻面）。
      public static let stampMuted = UIColor(red: 138 / 255, green: 116 / 255, blue: 64 / 255, alpha: 1)
      /// 说明书分隔线（不随明暗翻面）。
      public static let stampEdge = UIColor(red: 74 / 255, green: 52 / 255, blue: 23 / 255, alpha: 0.32)
      /// 说明书投影（不随明暗翻面）。
      public static let stampShadow = UIColor(red: 60 / 255, green: 40 / 255, blue: 10 / 255, alpha: 0.4)
      /// 说明书顶部色条。
      public static let artTop = UIColor(red: 23 / 255, green: 184 / 255, blue: 166 / 255, alpha: 1)
    }
  }

  // MARK: 提醒卡堆叠展示色

  /// 提醒卡堆叠（`design/today.html` 的 `--promo-*`）：磨砂卡底 / 墨色 / 副文本 /
  /// 玻璃棱线与反色主按钮。独立于语义色的展示 token，暗色模式成组切换。
  public enum Promo {
    public enum Color {
      /// 磨砂卡底的半透明主题色。
      public static let bg = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.118, green: 0.118, blue: 0.125, alpha: 1) : #colorLiteral(red: 0.965, green: 0.953, blue: 0.918, alpha: 1) })
      /// 卡片主文字。
      public static let ink = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.961, green: 0.961, blue: 0.969, alpha: 1) : #colorLiteral(red: 0.078, green: 0.086, blue: 0.102, alpha: 1) })
      /// 卡片次要文字。
      public static let sub = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.557, green: 0.557, blue: 0.576, alpha: 1) : #colorLiteral(red: 0.545, green: 0.565, blue: 0.588, alpha: 1) })
      /// 卡片分隔线。
      public static let line = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? UIColor(white: 1, alpha: 0.1) : UIColor(red: 20 / 255, green: 22 / 255, blue: 26 / 255, alpha: 0.08) })
      /// 指示器未激活段。
      public static let dot = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.282, green: 0.282, blue: 0.290, alpha: 1) : #colorLiteral(red: 0.788, green: 0.812, blue: 0.831, alpha: 1) })
      /// 主按钮底（反色）。
      public static let btnBg = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.961, green: 0.961, blue: 0.969, alpha: 1) : #colorLiteral(red: 0.078, green: 0.086, blue: 0.102, alpha: 1) })
      /// 主按钮字（反色）。
      public static let btnFg = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? #colorLiteral(red: 0.078, green: 0.086, blue: 0.102, alpha: 1) : .white }
      )
      /// 玻璃棱线。
      public static let edge = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? UIColor(white: 1, alpha: 0.16) : UIColor(white: 1, alpha: 0.5) })
      /// 玻璃顶棱内高光。
      public static let hi = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? UIColor(white: 1, alpha: 0.14) : UIColor(white: 1, alpha: 0.55) })
      /// 斜向光泽。
      public static let sheen = UIColor(dynamicProvider: { $0.userInterfaceStyle == .dark ? UIColor(white: 1, alpha: 0.07) : UIColor(white: 1, alpha: 0.32) })
    }
  }

  // MARK: 字号

  public enum Font {
    /// 首页巨型日期（日）。
    public static let heroDay = UIFont.systemFont(ofSize: 56, weight: .bold)
    /// 首页巨型日期（月）。
    public static let heroMonth = UIFont.systemFont(ofSize: 20, weight: .medium)
    /// 页面大标题。
    public static let largeTitle = UIFont.systemFont(ofSize: 34, weight: .bold)
    /// 区块标题。
    public static let sectionTitle = UIFont.systemFont(ofSize: 13, weight: .semibold)
    /// 卡片主标题 / 列表主文字。
    public static let title = UIFont.systemFont(ofSize: 17, weight: .semibold)
    /// 正文。
    public static let body = UIFont.systemFont(ofSize: 15, weight: .regular)
    /// 次要说明。
    public static let caption = UIFont.systemFont(ofSize: 13, weight: .regular)
    /// 徽标 / 胶囊。
    public static let badge = UIFont.systemFont(ofSize: 11, weight: .semibold)
    /// 胶囊 chip 的文字（design/medications.html 的 .chip：14px / 600）。
    public static let chip = UIFont.systemFont(ofSize: 14, weight: .semibold)
    /// 等宽小字（药板上的印刷规格）。
    public static let mono = UIFont.monospacedSystemFont(ofSize: 8, weight: .medium)
    /// 首页库存行药名。
    public static let stockName = UIFont.systemFont(ofSize: 14, weight: .medium)
    /// 首页库存行剩余天数（等宽，不随数值跳动）。
    public static let stockDays = UIFont.monospacedDigitSystemFont(ofSize: 12, weight: .regular)
    /// 首页库存行告急天数。
    public static let stockDaysEmphasis = UIFont.monospacedDigitSystemFont(
      ofSize: 12, weight: .semibold)
    /// 头像里的姓名首字。
    public static let avatarInitial = UIFont.systemFont(ofSize: 18, weight: .semibold)
  }

  // MARK: 间距

  public enum Space {
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 12
    public static let lg: CGFloat = 16
    public static let xl: CGFloat = 24
    public static let xxl: CGFloat = 32
    /// 页面左右安全边距。
    public static let page: CGFloat = 20
    /// 胶囊 chip 的上下内边距（Expo 版 chip.ios.tsx：Spacing.two）。
    public static let chipVertical: CGFloat = 8
    /// 胶囊 chip 的左右内边距（Expo 版 chip.ios.tsx：Spacing.three）。
    public static let chipHorizontal: CGFloat = 16
    /// 筛选行上下让出的一圈：液态玻璃点击时会轻微放大，给足余量避免被
    /// 滚动容器裁掉（Expo 版 FilterRow 内层 Row 的 padding 在系统 glass
    /// 形变下不够用，这里多给一圈）。
    public static let chipRowInset: CGFloat = 8
  }

  // MARK: 圆角

  public enum Radius {
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 12
    public static let lg: CGFloat = 16
    public static let xl: CGFloat = 24
    /// 胶囊（chip、按钮）。
    public static let pill: CGFloat = 999
    /// 提醒卡堆叠的大圆角（design/today.html 的 --radius-promo）。
    public static let promo: CGFloat = 28
  }

  // MARK: 控件尺寸

  public enum Size {
    /// 主按钮高度。
    public static let button: CGFloat = 52
    /// 输入盒高度。
    public static let field: CGFloat = 52
    /// 头像直径。
    public static let avatar: CGFloat = 44
    /// 圆形加号按钮直径。
    public static let roundButton: CGFloat = 44
    /// 列表行高。
    public static let row: CGFloat = 52
  }

  /// 底部 tab 遮挡的安全内边距。真正的 inset 由各控制器从 `safeAreaInsets` 取。
  public static let bottomTabInset: CGFloat = 49
}
