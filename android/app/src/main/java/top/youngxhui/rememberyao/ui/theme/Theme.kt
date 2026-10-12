package top.youngxhui.rememberyao.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp

/**
 * 应用主题：M3 Expressive + 动态取色。
 *
 * 配色分两层：
 * 1. Android 12+ 用壁纸生成的动态配色（`dynamicLightColorScheme` /
 *    `dynamicDarkColorScheme`），跟随系统明暗；
 * 2. 不支持的设备（以及模拟器预览）退回 Custom 系写死值 —— 即设计稿给的
 *    那套绿。
 *
 * 界面里一律 `MaterialTheme.colorScheme.xxx` 引用角色，不写死十六进制；
 * 唯一例外是 [StatusTint]（已服 / 偏低 / 告急是状态语义，M3 角色里没有
 * 对应项）与 [Foil]（泡罩铝箔是实物色，不随主题翻面）。
 */
@Composable
fun RememberYaoTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val context = LocalContext.current
    val colorScheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        darkTheme -> DarkScheme
        else -> LightScheme
    }
    MaterialExpressiveTheme(
        colorScheme = colorScheme,
        motionScheme = MotionScheme.expressive(),
        shapes = AppShapes,
        typography = AppTypography,
        content = content
    )
}

// MARK: - 备用配色（设计稿 Custom 系）

private val LightScheme = lightColorScheme(
    primary = Color(0xFF256B42),
    onPrimary = Color(0xFFFEFFFE),
    primaryContainer = Color(0xFFABF2C1),
    onPrimaryContainer = Color(0xFF02210E),
    secondary = Color(0xFF4F6355),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFD1E8D7),
    onSecondaryContainer = Color(0xFF0E1F14),
    tertiary = Color(0xFF006876),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFB6ECF4),
    onTertiaryContainer = Color(0xFF031F23),
    error = Color(0xFFB3261E),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFF9DEDC),
    onErrorContainer = Color(0xFF410E0B),
    background = Color(0xFFF5FBF6),
    onBackground = Color(0xFF181C1A),
    surface = Color(0xFFF5FBF6),
    onSurface = Color(0xFF181C1A),
    surfaceVariant = Color(0xFFDEE4E0),
    onSurfaceVariant = Color(0xFF3E4941),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFEFF5F1),
    surfaceContainer = Color(0xFFEAEFEB),
    surfaceContainerHigh = Color(0xFFE4EAE5),
    surfaceContainerHighest = Color(0xFFDEE4E0),
    surfaceBright = Color(0xFFF5FBF6),
    surfaceDim = Color(0xFFD5DBD7),
    inverseSurface = Color(0xFF2D312E),
    inverseOnSurface = Color(0xFFECF2EE),
    inversePrimary = Color(0xFF90D6A6),
    outline = Color(0xFF6E7A71),
    outlineVariant = Color(0xFFBDCAC0),
    scrim = Color(0xFF000000)
)

private val DarkScheme = darkColorScheme(
    primary = Color(0xFF90D6A6),
    onPrimary = Color(0xFF02391C),
    primaryContainer = Color(0xFF03522B),
    onPrimaryContainer = Color(0xFFABF2C1),
    secondary = Color(0xFFB6CCBC),
    onSecondary = Color(0xFF16281E),
    secondaryContainer = Color(0xFF384B3E),
    onSecondaryContainer = Color(0xFFD1E8D7),
    tertiary = Color(0xFF82D3E0),
    onTertiary = Color(0xFF00363D),
    tertiaryContainer = Color(0xFF154E55),
    onTertiaryContainer = Color(0xFFB6ECF4),
    error = Color(0xFFF2B8B5),
    onError = Color(0xFF601410),
    errorContainer = Color(0xFF8C1D18),
    onErrorContainer = Color(0xFFF9DEDC),
    background = Color(0xFF101411),
    onBackground = Color(0xFFDEE4E0),
    surface = Color(0xFF101411),
    onSurface = Color(0xFFDEE4E0),
    surfaceVariant = Color(0xFF3E4941),
    onSurfaceVariant = Color(0xFFBDCAC0),
    surfaceContainerLowest = Color(0xFF0B0F0D),
    surfaceContainerLow = Color(0xFF181C1A),
    surfaceContainer = Color(0xFF1C211E),
    surfaceContainerHigh = Color(0xFF272B28),
    surfaceContainerHighest = Color(0xFF313633),
    surfaceBright = Color(0xFF363B37),
    surfaceDim = Color(0xFF101411),
    inverseSurface = Color(0xFFDEE4E0),
    inverseOnSurface = Color(0xFF2D312E),
    inversePrimary = Color(0xFF256B42),
    outline = Color(0xFF87948B),
    outlineVariant = Color(0xFF3E4941),
    scrim = Color(0xFF000000)
)

// MARK: - 形状（整体缩小的 M3 比例）

/**
 * 圆角保持克制：按钮与标签片 8〜12dp、卡片 8dp、对话框约 12dp、大容器 28dp。
 *
 * 按钮 / 导航指示器 / FAB 不在这里收口 —— M3 Expressive 标准组件自己就是
 * 胶囊形（按钮）或 16dp（FAB），交给组件默认值，不自己画。
 */
private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(28.dp),
    largeIncreased = RoundedCornerShape(20.dp),
    extraLargeIncreased = RoundedCornerShape(32.dp),
    extraExtraLarge = RoundedCornerShape(48.dp)
)

// MARK: - 字体（Roboto + Expressive emphasized）

/**
 * 标题、按钮文字与标签页用 M3 Expressive 的 emphasized 样式（更粗字重）。
 *
 * 做法是取标准 `Typography()` 的默认值，再把上述角色替换成对应的
 * `*Emphasized` —— 字号行高仍是 M3 标准，只有字重变粗，屏幕里引用
 * `titleLarge` / `labelLarge` / `labelMedium` 的地方自动生效。
 * 正文（body 一族）保持常规字重：设计稿只要求标题 / 按钮 / 标签页加粗。
 */
private val AppTypography: Typography = Typography().let { base ->
    Typography(
        displayLarge = base.displayLargeEmphasized,
        displayMedium = base.displayMediumEmphasized,
        displaySmall = base.displaySmallEmphasized,
        headlineLarge = base.headlineLargeEmphasized,
        headlineMedium = base.headlineMediumEmphasized,
        headlineSmall = base.headlineSmallEmphasized,
        titleLarge = base.titleLargeEmphasized,
        titleMedium = base.titleMediumEmphasized,
        titleSmall = base.titleSmallEmphasized,
        labelLarge = base.labelLargeEmphasized,
        labelMedium = base.labelMediumEmphasized,
        labelSmall = base.labelSmallEmphasized
    )
}

// MARK: - 状态色

/**
 * 状态色：已服 / 偏低 / 告急 / 漏服。
 *
 * M3 角色里没有「成功 / 警告」，而这三态是全App共用的语义（已服=绿、
 * 即将用完=琥珀、漏服=红），色弱用户还靠旁边的文字补足，所以单独一组
 * 固定值，随明暗翻面（暗色下用浅档，保证在暗底上可辨）。
 */
object StatusTint {
    val Success: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF90D6A6) else Color(0xFF1B6B3F)
    val Warning: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFFFFB951) else Color(0xFF8A5300)
    val Danger: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFFF2B8B5) else Color(0xFFB3261E)
    val SuccessSoft: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF10281B) else Color(0xFFDFF2E5)
    val WarningSoft: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF33260F) else Color(0xFFFBEFD9)
    val DangerSoft: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF3B1512) else Color(0xFFF9DEDC)
    val Neutral: Color
        @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
}

// MARK: - 泡罩铝箔（实物色，不随主题翻面）

/** 板装药孪生页的铝箔：实物色，暗色档整体压暗，与语义色无关。 */
object Foil {
    val Base = Color(0xFFE9ECEF)
    val Highlight = Color(0xFFF7F8FA)
    val Shade = Color(0xFFC3C9D1)
    val Ring = Color(0xFFAEB5BF)
    val Dent = Color(0xFFDDE1E6)
}

// MARK: - Mini Archive（我的档案收藏夹）

/**
 * Mini Archive 收藏夹（`design/profile.html` 的 `--archive-*`）。
 *
 * 与 iOS `Theme.Archive` 同一套值。纸与印刷色是
 * 「实物」，不随明暗翻面；封皮 / 墨色 / 阴影跟随主题 —— 用 `@Composable` 取值
 * 而不是静态常量，就是为让这两组在暗色下自动换档。
 *
 * 命名跟随本文件的既有风格（扁平一层）：不嵌 `object Color`，那会遮蔽 Compose 的
 * `Color` 类型。
 */
object Archive {
    /** 封皮渐变上沿。 */
    val CoverTop: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF14857A) else Color(0xFF4CC9B9)
    /** 封皮渐变下沿。 */
    val CoverBottom: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF0F766E) else Color(0xFF0D9488)
    /** 底板渐变上沿（文件夹舌片）。 */
    val Tab: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF0E6B62) else Color(0xFF2BB0A2)
    /** 底板渐变下沿。 */
    val Back: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF0B544E) else Color(0xFF0F766E)
    /** 封皮主文字。 */
    val Ink: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFFD9F2EE) else Color(0xFF06302B)
    /** 封皮次要文字。 */
    val InkMuted: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF8FC9C0) else Color(0xFF3F7D74)
    /** 封皮装饰线。 */
    val Line: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0x29D9F2EE) else Color(0x2906302B)
    /** 文件夹投影。 */
    val Shadow: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0x80000000) else Color(0x4D0D9488)
    /** 说明书纸面（实物，不翻面）。 */
    val Paper = Color(0xFFFFFDF4)
    /** 说明书印刷主色（实物，不翻面）。 */
    val StampInk = Color(0xFF4A3417)
    /** 说明书印刷次色（实物，不翻面）。 */
    val StampMuted = Color(0xFF8A7440)
    /** 说明书分隔线（实物，不翻面）。 */
    val StampEdge = Color(0x524A3417)
    /** 说明书投影（实物，不翻面）。 */
    val StampShadow = Color(0x663C280A)
    /** 说明书顶部色条。 */
    val ArtTop = Color(0xFF17B8A6)
}

// MARK: - 提醒卡（首页牌堆的展示 token）

/**
 * 提醒卡堆叠（首页「今日待处理」容器里的牌堆）。
 *
 * 独立于语义色的展示 token，暗色模式成组切换；取色偏中性冷灰，与绿色
 * 主色同屏不打架。卡底不做实时模糊（Android 没有稳定的 backdrop blur），
 * 用半透明主题色叠染代替。
 */
object Promo {
    /** 磨砂卡底的半透明主题色。 */
    val Bg: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF1C211E) else Color(0xFFEDF3EE)
    /** 卡片主文字。 */
    val Ink: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFFF5F5F7) else Color(0xFF14161A)
    /** 卡片次要文字。 */
    val Sub: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF9AA39D) else Color(0xFF6B726C)
    /** 卡片分隔线。 */
    val Line: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0x1AFFFFFF) else Color(0x1414161A)
    /** 指示器未激活段。 */
    val Dot: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF48484A) else Color(0xFFC9CFD4)
    /** 主按钮底（反色）。 */
    val BtnBg: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFFF5F5F7) else Color(0xFF14161A)
    /** 主按钮字（反色）。 */
    val BtnFg: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0xFF14161A) else Color(0xFFFFFFFF)
    /** 玻璃棱线。 */
    val Edge: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0x29FFFFFF) else Color(0x80FFFFFF)
    /** 玻璃顶棱内高光。 */
    val Hi: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0x24FFFFFF) else Color(0x8CFFFFFF)
    /** 斜向光泽。 */
    val Sheen: Color
        @Composable get() = if (isSystemInDarkTheme()) Color(0x12FFFFFF) else Color(0x52FFFFFF)
}
