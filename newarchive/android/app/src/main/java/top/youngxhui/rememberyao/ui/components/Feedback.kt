package top.youngxhui.rememberyao.ui.components

import android.provider.Settings
import android.view.HapticFeedbackConstants
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView

/**
 * 交互反馈小工具：轻触感、减弱动效、分数坐标渐变。
 *
 * 这三样原本散落在首页牌堆组件里，现在提升为共享基元 —— 触感与「系统
 * 动画时长缩放为 0」的判定在任何手势组件里都会用到。
 */

/**
 * 轻触感：换卡、提交这类「办成了一件事」的节点给一下轻震。
 *
 * 用 `View.performHapticFeedback(CONTEXT_CLICK)` 而不是
 * `LocalHapticFeedback`：后者只有 LongPress / TextHandleMove 两档，都太重。
 */
@Composable
fun rememberLightHaptic(): () -> Unit {
    val view = LocalView.current
    return remember(view) {
        { view.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK) }
    }
}

/**
 * 系统是否要求减弱动效（开发者选项里「动画程序时长缩放」拨到关闭）。
 *
 * 为 true 时手势组件把过渡换成 `snap()`，不做位移与形变动画。
 */
@Composable
fun rememberReduceMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) {
        Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

/**
 * 分数坐标线性渐变：起止点按组件宽高的比例给（0f~1f），不写死像素。
 *
 * 卡底的三层叠色（半透明主题色、accent 染色、斜向光泽）都靠它 ——
 * 起止点是设计稿里 `linear-gradient(... at 33% 3%, ...)` 的直译。
 */
@Composable
fun FractionalGradient(
    colors: List<Color>,
    start: Pair<Float, Float>,
    end: Pair<Float, Float>,
    modifier: Modifier = Modifier,
    stops: List<Float>? = null
) {
    Box(
        modifier = modifier.drawBehind {
            val from = Offset(start.first * size.width, start.second * size.height)
            val to = Offset(end.first * size.width, end.second * size.height)
            val brush = if (stops != null) {
                Brush.linearGradient(
                    colorStops = colors.zip(stops)
                        .map { (color, stop) -> stop to color }
                        .toTypedArray(),
                    start = from,
                    end = to
                )
            } else {
                Brush.linearGradient(colors = colors, start = from, end = to)
            }
            drawRect(brush)
        }
    )
}
