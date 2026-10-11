package top.youngxhui.rememberyao.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.launch
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.model.Reminder
import top.youngxhui.rememberyao.core.model.ReminderStatus
import top.youngxhui.rememberyao.ui.theme.Promo
import top.youngxhui.rememberyao.ui.theme.StatusTint

/**
 * 提醒卡堆叠：接下来的待处理提醒上下堆叠，纵向滑动换卡。
 *
 * 交互与视觉基准 `design/today.html` 的「提醒卡」区块，与 Expo 版
 * `src/components/reminder-card-stack.tsx`、iOS `ReminderCardStackView.swift`
 * 同一套几何与节奏：
 * - 顶卡跟手并逐步缩小，越过 90dp 阈值后沉入牌堆后方，其余卡各前进一步；
 * - 右侧指示器固定原地不随卡片移动，仅高亮段与沉底同步 morph；
 * - 卡底 = 半透明主题色叠染 + accent 染色 + 斜向光泽。Android 没有实时
 *   backdrop blur（expo-blur 在 Android 上同样退化为半透明），因此不做模糊。
 *
 * 接入约定：放在滚动区**之外**用。纵向拖动与 `LazyColumn` 的滚动手势同向，
 * 嵌进列表会互相抢（首页因此把它放在列表上方的固定区）。
 */

/** 几何与节奏：与设计稿「提醒卡」区块同源。 */
private object StackGeo {
    /** 设计稿固定三张堆叠，更多待办交给列表。 */
    const val MaxCards = 3
    /** 触发换卡的滑动距离。 */
    val Threshold = 90.dp
    /** 点按顶卡时的浮起距离。 */
    val Lift = 6.dp
    /** 跟手阶段顶卡缩到的最小比例（设计稿 1 → 0.84）。 */
    const val FrontScaleMin = 0.84f
    /** 三个槽位的静止位（设计稿 is-front / is-mid / is-back）。 */
    val SlotY = listOf(0.dp, 16.dp, 32.dp)
    val SlotS = listOf(1f, 0.955f, 0.91f)
    /** 沉底后牌的横向溢出补偿（设计稿 .promo-stack padding-bottom: 30px）。 */
    val StackPadBottom = 30.dp
    /** 屏幕左右边距，与首页其它卡片一致。 */
    val Inset = 16.dp

    // 指示器
    val IndicatorRight = 27.dp
    val SegDot = 9.dp
    val SegActiveW = 6.dp
    val SegActiveH = 70.dp
    val SegGap = 8.dp

    // 时长（设计稿 CSS transition 的换算）
    const val Swap = 620
    const val Rebound = 340
    const val Float = 220
    const val SegColor = 300
    const val PressScale = 100
}

/** 换卡沉底曲线（设计稿 swapping 620ms）。 */
private val SwapEase = CubicBezierEasing(0.65f, 0f, 0.35f, 1f)
/** 弹回 / 浮起曲线。 */
private val ReboundEase = CubicBezierEasing(0.22f, 1f, 0.36f, 1f)

/** 状态徽章的色调。与语义色一一对应，中性档给「已跳过」。 */
enum class StackTone { Success, Warning, Danger, Primary, Neutral }

/** 色调取色：主色 / 浅色底两组，徽章与列表共用一套语义。 */
val StackTone.color: Color
    @Composable get() = when (this) {
        StackTone.Success -> StatusTint.Success
        StackTone.Warning -> StatusTint.Warning
        StackTone.Danger -> StatusTint.Danger
        StackTone.Primary -> MaterialTheme.colorScheme.primary
        StackTone.Neutral -> StatusTint.Neutral
    }

val StackTone.soft: Color
    @Composable get() = when (this) {
        StackTone.Success -> StatusTint.SuccessSoft
        StackTone.Warning -> StatusTint.WarningSoft
        StackTone.Danger -> StatusTint.DangerSoft
        StackTone.Primary -> MaterialTheme.colorScheme.primaryContainer
        StackTone.Neutral -> MaterialTheme.colorScheme.surfaceVariant
    }

/** 一张提醒卡的展示数据。由屏幕层用 `stringResource` 拼好再传进来。 */
data class StackCardItem(
    val reminderId: String,
    /** 顶部时间行：今天只显示 HH:MM，明天加「明天」，更早的显示月日时间。 */
    val timeLabel: String,
    /** 状态徽章（已服用 / 未服用 / 已漏服 / 待服用 / 稍后提醒）。 */
    val stateLabel: String,
    val stateTone: StackTone,
    val title: String,
    /** 剂量行：单次剂量 + 备注。 */
    val doseLine: String,
    val personName: String,
    /** 卡色 = 用药人头像色，按人区分家庭成员。 */
    val accent: Color,
    val freqLine: String,
    val stockLine: String,
    val stockLow: Boolean,
    /** 漏服补记：按钮文案走「补服」。 */
    val late: Boolean
)

/**
 * 淘汰队列：只保留按（日期+时间）升序的前 max 条 pending/missed。
 * 手写插入而非 `sortedBy` —— 标准排序不保证稳定，同位次要可复现。
 */
fun takeEarliest(reminders: List<Reminder>, max: Int): List<Reminder> {
    val out = mutableListOf<Reminder>()
    for (reminder in reminders) {
        if (reminder.status != ReminderStatus.PENDING &&
            reminder.status != ReminderStatus.MISSED
        ) {
            continue
        }
        val key = reminder.date + reminder.time
        var index = 0
        // 稳定升序：插在第一个比它大的前面（字典序比较，同 DateKey.compareTime）
        while (index < out.size && out[index].date + out[index].time <= key) {
            index += 1
        }
        out.add(index, reminder)
        if (out.size > max) out.removeAt(max)
    }
    return out
}

/** 一张卡的视觉位置：纵向位移 + 缩放。 */
private data class CardTransform(val ty: Float, val scale: Float)

@Composable
fun ReminderCardStack(
    items: List<StackCardItem>,
    onTake: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    if (items.isEmpty()) return

    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val haptic = rememberLightHaptic()
    val reduced = rememberReduceMotion()

    val slotYDp = StackGeo.SlotY
    val liftPx = with(density) { StackGeo.Lift.toPx() }
    val thresholdPx = with(density) { StackGeo.Threshold.toPx() }

    // order = 视觉顺序（首项为顶卡）。与数据解耦，换卡时手动轮转
    var order by remember { mutableStateOf(items.map { it.reminderId }) }
    // 换卡状态机：0 静止 | 1 跟手 | 2 已过阈值、正在沉底
    var phase by remember { mutableIntStateOf(0) }
    var dragY by remember { mutableFloatStateOf(0f) }
    var prog by remember { mutableFloatStateOf(0f) }
    val press = remember { Animatable(0f) }
    /** 沉底中的卡片 id：压到最低、不可交互（与 Expo 版 sinking 同义）。 */
    var sinkingId by remember { mutableStateOf<String?>(null) }

    // 指示器纵向位置 = 卡片中段（标题区）顶边。三张卡结构等高，取顶卡一次即可；
    // 只在空闲态（phase 0，顶卡无位移）更新，拖动中量到的是变换后的位置。
    // 首帧未测得时不渲染，避免闪到左上角（同 iOS 的 top === null 分支）。
    var midRootY by remember { mutableStateOf<Float?>(null) }
    var stackRootY by remember { mutableStateOf<Float?>(null) }
    val indicatorTopPx =
        if (midRootY != null && stackRootY != null) midRootY!! - stackRootY!! else null

    // 沉底 / 弹回：所有卡共用一段进度动画（设计稿就是同一条 620ms / 340ms），
    // 每张卡从各自捕获的跟手位插值到目标槽位。swap >= 1 表示已到位。
    val swap = remember { Animatable(1f) }
    var captured by remember { mutableStateOf(emptyMap<String, CardTransform>()) }
    var targets by remember { mutableStateOf(emptyMap<String, CardTransform>()) }

    // 视觉顺序与数据联动：剪掉已消失的、补上新到的（渲染期完成，不进 effect）
    val ids = items.map { it.reminderId }
    val kept = order.filter { ids.contains(it) }
    val nextOrder = kept + ids.filter { !kept.contains(it) }
    if (nextOrder != order) {
        order = nextOrder
    }
    val orderedItems = order.mapNotNull { id -> items.firstOrNull { it.reminderId == id } }
    val n = orderedItems.size

    // 指示器高亮段 = 当前顶卡在可见列表中的下标，由 order 推导而非自由计数器：
    // 列表收缩 / 补充（标记服用、新提醒到达）时自动跟随，不会错位
    val activeSeg = items.indexOfFirst { it.reminderId == order.firstOrNull() }.coerceAtLeast(0)

    fun slotTransform(slot: Int): CardTransform = CardTransform(
        ty = with(density) { slotYDp[slot].toPx() },
        scale = StackGeo.SlotS[slot]
    )

    /** 跟手公式：与设计稿 pointermove 的三段 lerp 同构，顶卡叠加点按浮起。 */
    fun followOf(slot: Int): CardTransform {
        val ty: Float
        val s: Float
        if (slot == 0) {
            ty = dragY - liftPx * press.value
            s = lerp(1f, StackGeo.FrontScaleMin, prog)
        } else {
            ty = lerp(
                with(density) { slotYDp[slot].toPx() },
                with(density) { slotYDp[slot - 1].toPx() },
                prog
            )
            s = lerp(StackGeo.SlotS[slot], StackGeo.SlotS[slot - 1], prog)
        }
        return CardTransform(ty, s)
    }

    /** 当前该画的位置：跟手 > 沉底 / 弹回插值 > 静止槽位。 */
    fun transformOf(id: String, slot: Int): CardTransform {
        if (phase == 1) return followOf(slot)
        val from = captured[id]
        val to = targets[id]
        if (from != null && to != null && swap.value < 1f) {
            return CardTransform(
                ty = lerp(from.ty, to.ty, swap.value),
                scale = lerp(from.scale, to.scale, swap.value)
            )
        }
        return slotTransform(slot)
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = StackGeo.Inset)
            .padding(bottom = StackGeo.StackPadBottom)
            .onGloballyPositioned { stackRootY = it.positionInRoot().y }
    ) {
        // 指示器：固定在卡片右侧，不随卡片移动（用户可见行为的硬要求）
        StackIndicator(
            count = n,
            active = activeSeg,
            reduced = reduced,
            topOffsetPx = indicatorTopPx,
            modifier = Modifier.align(Alignment.TopEnd)
        )

        orderedItems.forEachIndexed { slot, item ->
            val sinking = item.reminderId == sinkingId
            val transform = transformOf(item.reminderId, slot)
            val cardModifier =
                if (slot == 0) Modifier else Modifier.matchParentSize()
            StackCard(
                item = item,
                front = slot == 0 && !sinking,
                transform = transform,
                onMidMeasured = { coords ->
                    if (slot == 0 && phase == 0) midRootY = coords.positionInRoot().y
                },
                onTake = { onTake(item.reminderId) },
                modifier = Modifier
                    .zIndex(if (sinking) 0f else (StackGeo.MaxCards - slot).toFloat())
                    .then(cardModifier)
                    // 单张卡没有换卡语义，不挂手势（也无需指示器）
                    .then(
                        if (n < 2) Modifier else Modifier.pointerInput(n) {
                            detectVerticalDragGestures(
                                onDragStart = {
                                    phase = 1
                                    dragY = 0f
                                    prog = 0f
                                    captured = emptyMap()
                                    targets = emptyMap()
                                    scope.launch { swap.snapTo(1f) }
                                    // 触摸即让顶卡浮起（设计稿 :active 的 translateY(-6px)）
                                    scope.launch {
                                        if (reduced) {
                                            press.snapTo(1f)
                                        } else {
                                            press.animateTo(
                                                1f, tween(StackGeo.Float, easing = ReboundEase)
                                            )
                                        }
                                    }
                                },
                                onVerticalDrag = { _, delta ->
                                    // phase 离开 1 后不再跟手（Expo 的 onUpdate 同款早退），
                                    // 否则会踩掉正在跑的沉底动画
                                    if (phase != 1) return@detectVerticalDragGestures
                                    dragY += delta
                                    prog = (kotlin.math.abs(dragY) / thresholdPx).coerceIn(0f, 1f)
                                    if (kotlin.math.abs(dragY) >= thresholdPx) {
                                        phase = 2
                                        // 阈值穿越 = 沉底开始：commit 触感与动画同帧
                                        haptic()
                                        sinkingId = order.firstOrNull()
                                        // 目标必须在轮转前按旧 slot 算好：
                                        // (slot + n - 1) % n 恰好是轮转映射
                                        captured = order.mapIndexed { s, id ->
                                            id to followOf(s)
                                        }.toMap()
                                        targets = order.mapIndexed { s, id ->
                                            id to slotTransform((s + n - 1) % n)
                                        }.toMap()
                                        scope.launch {
                                            swap.snapTo(0f)
                                            swap.animateTo(
                                                1f,
                                                if (reduced) {
                                                    snap()
                                                } else {
                                                    tween(StackGeo.Swap, easing = SwapEase)
                                                }
                                            )
                                        }
                                    }
                                },
                                onDragEnd = {
                                    scope.launch {
                                        if (reduced) {
                                            press.snapTo(0f)
                                        } else {
                                            press.animateTo(
                                                0f, tween(StackGeo.Float, easing = ReboundEase)
                                            )
                                        }
                                    }
                                    if (phase == 2) {
                                        // 松手轮转牌堆：前→后、其余各前进一步。与 Expo 的
                                        // rotate() 同帧，子卡的沉底动画继续跑完
                                        if (n > 1) order = order.drop(1) + order.first()
                                        sinkingId = null
                                    } else if (phase == 1) {
                                        // 未过阈值：各卡弹回本槽位
                                        phase = 0
                                        captured = order.mapIndexed { s, id ->
                                            id to followOf(s)
                                        }.toMap()
                                        targets = order.mapIndexed { s, id ->
                                            id to slotTransform(s)
                                        }.toMap()
                                        scope.launch {
                                            swap.snapTo(0f)
                                            swap.animateTo(
                                                1f,
                                                if (reduced) {
                                                    snap()
                                                } else {
                                                    tween(StackGeo.Rebound, easing = ReboundEase)
                                                }
                                            )
                                        }
                                    }
                                },
                                onDragCancel = {
                                    scope.launch { press.snapTo(0f) }
                                    phase = 0
                                }
                            )
                        }
                    )
            )
        }
    }
}

/**
 * 牌堆指示器：高亮段加长、其余段变点，是尺寸 morph 而非位移 —— 每个分段都
 * 绝对定位，top 偏移与居中全部走 transform（零布局），width/height 过渡不推挤
 * 兄弟段。分段 top 与原「column + gap」排版逐像素一致。
 */
@Composable
private fun StackIndicator(
    count: Int,
    active: Int,
    reduced: Boolean,
    topOffsetPx: Float?,
    modifier: Modifier = Modifier
) {
    if (count < 2 || topOffsetPx == null) return
    val morph: AnimationSpec<Dp> = if (reduced) snap() else tween(StackGeo.Swap, easing = SwapEase)

    Box(
        modifier = modifier
            .padding(end = StackGeo.IndicatorRight)
            .graphicsLayer { translationY = topOffsetPx }
            .width(StackGeo.SegDot)
    ) {
        for (index in 0 until count) {
            val on = index == active
            val w by animateDpAsState(
                targetValue = if (on) StackGeo.SegActiveW else StackGeo.SegDot,
                animationSpec = morph,
                label = "segW"
            )
            val h by animateDpAsState(
                targetValue = if (on) StackGeo.SegActiveH else StackGeo.SegDot,
                animationSpec = morph,
                label = "segH"
            )
            val top by animateDpAsState(
                targetValue = segTop(index, active),
                animationSpec = morph,
                label = "segTop"
            )
            val color by animateColorAsState(
                targetValue = if (on) Promo.Ink.copy(alpha = 0.82f) else Promo.Dot.copy(alpha = 0.62f),
                animationSpec = if (reduced) {
                    snap()
                } else {
                    tween(StackGeo.SegColor, easing = LinearEasing)
                },
                label = "segColor"
            )
            Box(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .zIndex(5f)
                    .graphicsLayer {
                        // 锚点置顶中：高度变化向下生长，与「top 偏移 + 列排版」一致
                        transformOrigin = TransformOrigin(0.5f, 0f)
                        translationY = with(density) { top.toPx() }
                    }
                    .size(width = w, height = h)
                    .background(color, RoundedCornerShape(percent = 50))
                    .border(1.dp, Promo.Edge, RoundedCornerShape(percent = 50))
            )
        }
    }
}

/** 第 index 个分段的静止 top：与「纵向 column + 间距」的排版逐像素一致。 */
private fun segTop(index: Int, active: Int): Dp {
    var top = 0.dp
    for (i in 0 until index) {
        top += (if (i == active) StackGeo.SegActiveH else StackGeo.SegDot) + StackGeo.SegGap
    }
    return top
}

/** 单张提醒卡。 */
@Composable
private fun StackCard(
    item: StackCardItem,
    front: Boolean,
    transform: CardTransform,
    onMidMeasured: (LayoutCoordinates) -> Unit,
    onTake: () -> Unit,
    modifier: Modifier = Modifier
) {
    val radius = RoundedCornerShape(28.dp)
    Box(
        modifier = modifier
            .graphicsLayer {
                translationY = transform.ty
                scaleX = transform.scale
                scaleY = transform.scale
            }
            .shadow(
                elevation = 18.dp,
                shape = radius,
                ambientColor = item.accent.copy(alpha = 0.42f),
                spotColor = item.accent.copy(alpha = 0.42f)
            )
            .clip(radius)
            .background(Promo.Bg, radius)
            .border(1.dp, item.accent.copy(alpha = 0.4f), radius)
    ) {
        // 卡底三层叠加 = 设计稿 backdrop-filter + color-mix。Android 没有实时
        // backdrop blur，退化为半透明叠色（与 Expo 版跑在 Android 上一致）
        FractionalGradient(
            colors = listOf(Promo.Bg.copy(alpha = 0.76f), Promo.Bg.copy(alpha = 0.64f)),
            start = Pair(0.33f, 0.03f),
            end = Pair(0.67f, 0.97f),
            modifier = Modifier.matchParentSize()
        )
        FractionalGradient(
            colors = listOf(item.accent.copy(alpha = 0.09f), item.accent.copy(alpha = 0.13f)),
            start = Pair(0.33f, 0.03f),
            end = Pair(0.67f, 0.97f),
            modifier = Modifier.matchParentSize()
        )
        FractionalGradient(
            colors = listOf(Promo.Sheen, Color.Transparent),
            start = Pair(0.15f, 0.15f),
            end = Pair(0.85f, 0.85f),
            stops = listOf(0f, 0.46f),
            modifier = Modifier.matchParentSize()
        )
        // 内高光：玻璃顶棱（设计稿 inset 0 1px 0）
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .height(1.dp)
                .background(Promo.Hi)
        )

        Column(
            modifier = Modifier.padding(top = 20.dp, start = 26.dp, end = 26.dp, bottom = 18.dp)
        ) {
            // 上段：提醒时间 + 状态徽章
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = item.timeLabel,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 15.sp,
                    color = Promo.Sub,
                    maxLines = 1
                )
                Box(
                    modifier = Modifier
                        .background(item.stateTone.soft, RoundedCornerShape(percent = 50))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = item.stateLabel,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = item.stateTone.color,
                        maxLines = 1
                    )
                }
            }

            // 中段：药品名 + 剂量。固定行高给右侧指示器留轨道，
            // 右内边距避让指示器（右缘 9dp 指示条）。兼作指示器定位基准
            Column(
                modifier = Modifier
                    .padding(top = 22.dp, end = 14.dp)
                    .heightIn(min = 104.dp)
                    .onGloballyPositioned(onMidMeasured)
            ) {
                Text(
                    text = item.title,
                    fontSize = 34.sp,
                    fontWeight = FontWeight.ExtraBold,
                    letterSpacing = (-1).sp,
                    color = Promo.Ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = item.doseLine,
                    fontSize = 14.sp,
                    color = Promo.Sub,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }

            HorizontalDivider(
                thickness = 1.dp,
                color = Promo.Line,
                modifier = Modifier.padding(top = 24.dp, bottom = 14.dp)
            )

            // 下段：用药人 + 每日频次 / 库存 + 反色主按钮
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(item.accent, RoundedCornerShape(percent = 50)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = item.personName.take(1),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.personName,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Promo.Ink,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = item.freqLine,
                        fontSize = 13.sp,
                        color = Promo.Sub,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = item.stockLine,
                        fontSize = 13.sp,
                        // 库存告急按项目语义色用 warning（设计稿此处为 danger）
                        color = if (item.stockLow) StatusTint.Warning else Promo.Sub,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                TakeButton(
                    late = item.late,
                    enabled = front,
                    testId = "stack-card-take-${item.reminderId}",
                    onTake = onTake
                )
            }
        }
    }
}

/** 反色主按钮：标记已服用 / 补服。 */
@Composable
private fun TakeButton(
    late: Boolean,
    enabled: Boolean,
    testId: String,
    onTake: () -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = tween(StackGeo.PressScale, easing = ReboundEase),
        label = "takePress"
    )
    Box(
        modifier = Modifier
            .heightIn(min = 44.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .background(Promo.BtnBg, RoundedCornerShape(percent = 50))
            .testId(testId)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                onClick = onTake
            )
            .padding(horizontal = 26.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = stringResource(
                if (late) R.string.reminder_lateTake else R.string.reminder_taken
            ),
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
            color = Promo.BtnFg,
            maxLines = 1
        )
    }
}

/** 线性插值。跟手公式与设计稿的三段 lerp 同构。 */
private fun lerp(from: Float, to: Float, fraction: Float): Float =
    from + (to - from) * fraction
