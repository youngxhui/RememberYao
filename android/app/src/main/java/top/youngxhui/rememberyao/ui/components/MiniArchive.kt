package top.youngxhui.rememberyao.ui.components

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.ui.theme.Archive

/**
 * Mini Archive 收藏夹：闭合时居中一个文件夹，点按或右滑展开成说明书横排。
 *
 * 视觉与交互基准 `design/profile.html` 的「Mini Archive」区块，与 Expo 版
 * `src/components/mini-archive.tsx`、iOS `MiniArchiveView.swift` 同一套几何与节奏。
 *
 * 开合状态完全由滚动进度驱动 —— 点按只是发起一次动画滚动，点按与手滑因此走
 * 同一条链路，观感一致。内页卡的飞行用 `animateFloatAsState` + `tween(delay)`：
 * Compose 的 delay 语义与 CSS `transition-delay` 一致（延迟期间保持旧值），
 * 不需要像 UIKit 那样绕开 `startAnimation(afterDelay:)`。
 */
object MiniArchiveGeo {
    /** 卡片几何：与设计稿 `--card-w` / `--card-gap` 同源。 */
    val CardW: Dp = 230.dp
    val CardGap: Dp = 16.dp
    val Pitch: Dp = CardW + CardGap
    val FolderW: Dp = 210.dp
    val FolderH: Dp = 300.dp
    val FolderRadius: Dp = 26.dp
    val LeafW: Dp = 210.dp
    val LeafH: Dp = 268.dp
    /** 闭合时说明书缩到该比例，形成「厚沓」层叠。 */
    const val StackScale = 0.6476f
    val ScrollPadTop: Dp = 30.dp
    val ScrollPadBottom: Dp = 34.dp
    val SectionPadTop: Dp = 10.dp
    val SectionPadBottom: Dp = 4.dp
    val ScrollerH: Dp = ScrollPadTop + FolderH + ScrollPadBottom
    /** 外壳总高：section 内边距 + 滚动区。 */
    val ShellH: Dp = SectionPadTop + ScrollerH + SectionPadBottom

    /** 滚过 40dp 即判定为展开（与设计稿 sync() 的阈值一致）。 */
    val OpenThreshold: Dp = 40.dp
    /** 封面 / 底板变暗的滚动行程：0→260dp 映射到透明度 1→0.65。 */
    val DimRange: Dp = 260.dp

    // ── 时长预算：整套开合约 1s 收尾、封皮 650ms、单张飞行 ≤770ms ──
    const val FlyBase = 420
    const val FlyStep = 70
    const val TakeoffStep = 80L
    const val ReturnStep = 80L
    /** 封皮翻开时长：超过 ~700ms 整组动作会脱拍。 */
    const val CoverDuration = 650
    /** 说明书淡出 / 列表卡淡入时长。 */
    const val LeafOpacityDuration = 300
    const val SlotFadeDuration = 420
    /** 淡出起点 = 落点前 80ms，与列表卡的淡入交叉。 */
    const val CrossFade = 80L
    /** 列表卡淡入起点 = 落点前 120ms。 */
    const val SlotCrossFade = 120L
    const val PressScaleDuration = 130
    /** 点按文件夹发起的滚动时长：近似 iOS `setContentOffset(animated:)` 的系统默认。 */
    const val ScrollDuration = 320

    /** 单张飞行时长：距离越远飞得久，线性步进避免末片冲刺。 */
    fun flyDuration(index: Int): Int = FlyBase + index * FlyStep

    /** 展开：按堆叠层序反转（最上层先飞），min() 封顶让头 3 张错峰。 */
    fun takeoffDelay(index: Int, count: Int): Long =
        TakeoffStep + (count - 1 - index).coerceAtMost(2) * TakeoffStep

    /** 收起：按堆叠顺序依次归位。 */
    fun returnDelay(index: Int): Long = ReturnStep + index.coerceAtMost(2) * ReturnStep

    /** 闭合扇形的递增步长：张数越多扇得越紧。 */
    fun stackStep(count: Int): Float =
        (3f / count.coerceAtLeast(1)).coerceAtMost(1f)
}

/** 说明书正文的一行。 */
data class ArchiveRow(val label: String, val value: String)

/**
 * 一张说明书卡片的数据：水平列表卡位与文件夹内的飞行卡共用。
 *
 * 由屏幕层用 `stringResource` 拼好再传进来 —— 组件本身不碰词条，
 * 与 `ReminderCard` 一族「派生数据在屏幕、组件只负责摆」的分工一致。
 */
data class ArchiveEntry(
    val id: String,
    val name: String,
    /** 正文条目（总数量 / 剩余 / 包装 / 备注）。 */
    val rows: List<ArchiveRow>,
    /** 标题下小字；屏幕层负责兜底「请仔细阅读」。 */
    val subtitle: String? = null,
    /** 底部小字（建档日期）。 */
    val footer: String? = null
)

/** 飞行曲线（设计稿 cubic-bezier(0.3,0.4,0.2,1)）：峰值斜率压到 ~2.5，起步不爆冲。 */
private val FlyEase = CubicBezierEasing(0.3f, 0.4f, 0.2f, 1f)
/** 封皮翻开曲线（设计稿 cubic-bezier(0.23,1,0.32,1)）。 */
private val CoverEase = CubicBezierEasing(0.23f, 1f, 0.32f, 1f)
/** CSS 默认 ease，用于按压反馈与交叉淡入淡出。 */
private val CssEase = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

/** 160deg / 135deg 的渐变起止点（CSS 角度 → 归一化坐标）。 */
private val Grad160Start = Pair(0.33f, 0.03f)
private val Grad160End = Pair(0.67f, 0.97f)
private val Grad135Start = Pair(0.15f, 0.15f)
private val Grad135End = Pair(0.85f, 0.85f)

@Composable
fun MiniArchive(
    entries: List<ArchiveEntry>,
    onSelectEntry: (ArchiveEntry) -> Unit,
    modifier: Modifier = Modifier,
    title: String = stringResource(R.string.medication_archiveTitle),
    subtitle: String = stringResource(R.string.medication_archiveSubtitle)
) {
    val reduced = rememberReduceMotion()
    val haptic = rememberLightHaptic()
    val scope = rememberCoroutineScope()
    val pagerState = rememberPagerState(pageCount = { entries.size + 1 })

    // 滚动进度（以 pitch 为单位的页数）：settledPage 只在停稳后翻页，
    // fraction 补上拖动中的连续行程，两者相加全程连续
    val progress = pagerState.settledPage + pagerState.currentPageOffsetFraction
    val pitchPx = with(LocalDensity.current) { MiniArchiveGeo.Pitch.toPx() }
    val thresholdPx = with(LocalDensity.current) { MiniArchiveGeo.OpenThreshold.toPx() }
    val dimRangePx = with(LocalDensity.current) { MiniArchiveGeo.DimRange.toPx() }
    val scrollPx = progress * pitchPx
    val open = scrollPx > thresholdPx
    // 封面与底板随滚动进度变暗，只影响文件夹本体，不影响飞行中的说明书
    val dim = 1f - 0.35f * (scrollPx / dimRangePx).coerceIn(0f, 1f)

    // 阈值穿越只在跨过时回一次：轻触反馈与封面起始同帧
    var wasOpen by remember { mutableStateOf(false) }
    LaunchedEffect(open) {
        if (open != wasOpen) {
            wasOpen = open
            haptic()
        }
    }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .height(MiniArchiveGeo.ShellH)
            // section 内边距：上 10 / 下 4，与设计稿 .archive 一致
            .padding(
                top = MiniArchiveGeo.SectionPadTop,
                bottom = MiniArchiveGeo.SectionPadBottom
            )
    ) {
        // 首尾卡片居中：contentPadding 吃掉两侧剩余宽度
        val pad = ((maxWidth - MiniArchiveGeo.CardW) / 2).coerceAtLeast(0.dp)
        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .height(MiniArchiveGeo.ScrollerH),
            contentPadding = PaddingValues(horizontal = pad),
            pageSpacing = MiniArchiveGeo.CardGap,
            verticalAlignment = Alignment.Top
        ) { page ->
            // 每页占位统一为文件夹高（300），内容在其中居中。
            // 直接靠 pager 的 verticalAlignment 做不到「按最大项居中」：
            // CenterVertically 会相对 364 的滚动区居中，让文件夹落到 y=32 而
            // 设计稿要求 y=30（scrollPadTop），矮 32dp 的说明书卡也会跟着偏 2dp。
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = MiniArchiveGeo.ScrollPadTop)
                    .height(MiniArchiveGeo.FolderH),
                contentAlignment = Alignment.Center
            ) {
                if (page == 0) {
                    FolderSlot(
                        title = title,
                        subtitle = subtitle,
                        open = open,
                        dim = dim,
                        reduced = reduced,
                        entries = entries
                    ) {
                        // 没有说明书可展开时，文件夹点了也只是原地
                        if (entries.isNotEmpty()) {
                            scope.launch {
                                pagerState.animateScrollToPage(
                                    page = if (open) 0 else 1,
                                    animationSpec = if (reduced) {
                                        snap()
                                    } else {
                                        tween(
                                            MiniArchiveGeo.ScrollDuration,
                                            easing = CssEase
                                        )
                                    }
                                )
                            }
                        }
                    }
                } else {
                    val entry = entries[page - 1]
                    LeafletSlot(
                        entry = entry,
                        index = page - 1,
                        count = entries.size,
                        open = open,
                        reduced = reduced
                    ) {
                        onSelectEntry(entry)
                    }
                }
            }
        }
    }
}

/** 文件夹卡位（列表第 1 项）：按压缩放 + 封皮翻开 + 内部说明书堆叠。 */
@Composable
private fun FolderSlot(
    title: String,
    subtitle: String,
    open: Boolean,
    dim: Float,
    reduced: Boolean,
    entries: List<ArchiveEntry>,
    onClick: () -> Unit
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = if (reduced) snap() else tween(
            durationMillis = MiniArchiveGeo.PressScaleDuration, easing = CssEase
        ),
        label = "folderPress"
    )

    Box(
        modifier = Modifier
            .size(MiniArchiveGeo.CardW, MiniArchiveGeo.FolderH)
            .testId("mini-archive-folder")
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick
            ),
        contentAlignment = Alignment.Center
    ) {
        // 内部文件夹（210×300）按压缩放；卡位本身比文件夹宽，撑出点击热区
        Box(
            modifier = Modifier
                .size(MiniArchiveGeo.FolderW, MiniArchiveGeo.FolderH)
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                },
            // 说明书矮文件夹 32dp，必须居中：飞行终点 translationY 归 0 是相对
            // 文件夹左上角的，不居中就会比列表卡位高 16dp，「落点像素级一致」失效
            contentAlignment = Alignment.Center
        ) {
            FolderBack(dim = dim)
            // 说明书堆叠在封皮之下（z 序：底板 < 说明书 < 封皮），
            // 展开时从半透明封皮下飞出，与列表卡交叉淡入
            entries.forEachIndexed { index, entry ->
                MiniLeaf(
                    entry = entry,
                    index = index,
                    count = entries.size,
                    open = open,
                    reduced = reduced
                )
            }
            FolderFront(
                title = title,
                subtitle = subtitle,
                open = open,
                dim = dim,
                reduced = reduced
            )
        }
    }
}

/** 文件夹底板：青绿渐变 + 投影，随滚动变暗。 */
@Composable
private fun FolderBack(dim: Float) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer { alpha = dim }
            .shadow(
                elevation = 16.dp,
                shape = RoundedCornerShape(MiniArchiveGeo.FolderRadius),
                ambientColor = Archive.Shadow,
                spotColor = Archive.Shadow
            )
            .clip(RoundedCornerShape(MiniArchiveGeo.FolderRadius))
    ) {
        FractionalGradient(
            colors = listOf(Archive.Tab, Archive.Back),
            start = Grad160Start,
            end = Grad160End,
            modifier = Modifier.matchParentSize()
        )
    }
}

/**
 * 磨砂半透明封皮：透视下绕左侧翻开（open 时 rotateY -58°），透过封皮能隐约
 * 看到里面的说明书。
 *
 * Android 没有实时 backdrop blur（expo-blur 在 Android 上同样退化为半透明），
 * 因此这里只铺半透明渐变 —— 与 Expo 版跑在 Android 上的表现一致。
 */
@Composable
private fun FolderFront(
    title: String,
    subtitle: String,
    open: Boolean,
    dim: Float,
    reduced: Boolean
) {
    val angle by animateFloatAsState(
        targetValue = if (open) -58f else 0f,
        animationSpec = if (reduced) snap() else tween(
            durationMillis = MiniArchiveGeo.CoverDuration, easing = CoverEase
        ),
        label = "cover"
    )
    val radius = RoundedCornerShape(MiniArchiveGeo.FolderRadius)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer {
                alpha = dim
                rotationY = angle
                // CSS perspective(1500px)：Compose 的 cameraDistance 是物理像素
                cameraDistance = 1500.dp.toPx()
                transformOrigin = TransformOrigin(0f, 0.5f)
            }
            .border(1.dp, Color.White.copy(alpha = 0.22f), radius)
            .clip(radius)
    ) {
        FractionalGradient(
            colors = listOf(
                Archive.CoverTop.copy(alpha = 0.55f),
                Archive.CoverBottom.copy(alpha = 0.62f)
            ),
            start = Grad160Start,
            end = Grad160End,
            modifier = Modifier.matchParentSize()
        )
        // 顶部内高光：设计稿 box-shadow 的 inset 0 1px 0 rgba(255,255,255,0.4)
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .height(1.dp)
                .background(Color.White.copy(alpha = 0.4f))
        )
        FractionalGradient(
            colors = listOf(Color.White.copy(alpha = 0.22f), Color.Transparent),
            start = Grad135Start,
            end = Grad135End,
            stops = listOf(0f, 0.46f),
            modifier = Modifier.matchParentSize()
        )

        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .padding(horizontal = 22.dp, vertical = 24.dp)
        ) {
            Text(
                text = title,
                fontSize = 27.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Archive.Ink,
                letterSpacing = (-0.5).sp,
                maxLines = 1
            )
            Text(
                text = subtitle.uppercase(),
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                color = Archive.InkMuted,
                letterSpacing = 1.8.sp,
                maxLines = 1,
                modifier = Modifier.padding(top = 6.dp)
            )
            Column(
                modifier = Modifier.padding(top = 24.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                listOf(1f, 0.84f, 0.92f).forEach { widthFraction ->
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(widthFraction)
                            .height(3.dp)
                            .background(Archive.Line, RoundedCornerShape(2.dp))
                    )
                }
            }
        }
    }
}

/**
 * 封皮下的飞行说明书：闭合时按索引递增偏移形成扇形厚沓；
 * 展开时飞到第 index+1 个列表卡位（文件夹占第 0 位），到位后淡出。
 *
 * 飞行与淡出是两条独立过渡（时长 / 起点都不同），各用自己的 tween 延迟；
 * Compose 的 delay 期间保持起始值，与 CSS transition-delay 语义一致。
 */
@Composable
private fun MiniLeaf(
    entry: ArchiveEntry,
    index: Int,
    count: Int,
    open: Boolean,
    reduced: Boolean
) {
    val density = LocalDensity.current
    val step = MiniArchiveGeo.stackStep(count)
    val closedTx = with(density) { (-7 + index * 6 * step).dp.toPx() }
    val closedTy = with(density) { (-6 + index * 7 * step).dp.toPx() }
    val closedAngle = -4f + index * 3.5f * step
    val openedTx = with(density) { (index + 1) * MiniArchiveGeo.Pitch.toPx() }

    val fly: AnimationSpec<Float> = if (reduced) snap() else tween(
        durationMillis = MiniArchiveGeo.flyDuration(index),
        delayMillis = (
            if (open) MiniArchiveGeo.takeoffDelay(index, count)
            else MiniArchiveGeo.returnDelay(index)
            ).toInt(),
        easing = FlyEase
    )
    val progress by animateFloatAsState(
        targetValue = if (open) 1f else 0f,
        animationSpec = fly,
        label = "fly"
    )

    // 淡出起点 = 落点前 80ms，与列表卡的淡入交叉
    val fadeDelay = if (open) {
        MiniArchiveGeo.takeoffDelay(index, count) + MiniArchiveGeo.flyDuration(index) - MiniArchiveGeo.CrossFade
    } else {
        MiniArchiveGeo.returnDelay(index)
    }
    val alpha by animateFloatAsState(
        targetValue = if (open) 0f else 1f,
        animationSpec = if (reduced) snap() else tween(
            durationMillis = MiniArchiveGeo.LeafOpacityDuration,
            delayMillis = fadeDelay.coerceAtLeast(0L).toInt(),
            easing = CssEase
        ),
        label = "leafAlpha"
    )

    Box(
        modifier = Modifier
            .size(MiniArchiveGeo.LeafW, MiniArchiveGeo.LeafH)
            .graphicsLayer {
                translationX = lerp(closedTx, openedTx, progress)
                translationY = lerp(closedTy, 0f, progress)
                rotationZ = lerp(closedAngle, 0f, progress)
                val scale = lerp(MiniArchiveGeo.StackScale, 1f, progress)
                scaleX = scale
                scaleY = scale
                this.alpha = alpha
            }
    ) {
        LeafletBody(entry)
    }
}

/** 水平列表里的说明书卡位：平时透明，展开时按反转顺序交叉淡入。 */
@Composable
private fun LeafletSlot(
    entry: ArchiveEntry,
    index: Int,
    count: Int,
    open: Boolean,
    reduced: Boolean,
    onSelect: () -> Unit
) {
    val alpha by animateFloatAsState(
        targetValue = if (open) 1f else 0f,
        animationSpec = if (reduced) snap() else tween(
            // 淡入起点 = 对应飞行卡落点前 120ms，两卡交叉淡入、落点像素级一致
            durationMillis = MiniArchiveGeo.SlotFadeDuration,
            delayMillis = if (open) {
                (
                    MiniArchiveGeo.takeoffDelay(index, count) +
                        MiniArchiveGeo.flyDuration(index) - MiniArchiveGeo.SlotCrossFade
                    ).toInt()
            } else {
                0
            },
            easing = CssEase
        ),
        label = "slotAlpha"
    )
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.97f else 1f,
        animationSpec = if (reduced) snap() else tween(
            durationMillis = MiniArchiveGeo.PressScaleDuration, easing = CssEase
        ),
        label = "slotPress"
    )

    Box(
        modifier = Modifier
            .size(MiniArchiveGeo.CardW, MiniArchiveGeo.LeafH)
            .graphicsLayer {
                this.alpha = alpha
                scaleX = scale
                scaleY = scale
            },
        contentAlignment = Alignment.Center
    ) {
        // 闭合时整列卡位露在屏幕右缘：不可见也不可点，别留隐形点击区
        Box(
            modifier = Modifier
                .testId("mini-archive-entry-${entry.id}")
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    enabled = open,
                    onClick = onSelect
                )
        ) {
            LeafletBody(entry)
        }
    }
}

/**
 * 药物说明书盒样式：列表卡与文件夹内飞行卡完全共用 —— 闭合时整体缩小，
 * 打开时放大飞入卡位，落点与列表项必须像素级一致，所以两者同一实现。
 */
@Composable
private fun LeafletBody(entry: ArchiveEntry) {
    Box(
        modifier = Modifier
            .size(MiniArchiveGeo.LeafW, MiniArchiveGeo.LeafH)
            .shadow(
                elevation = 10.dp,
                shape = RoundedCornerShape(10.dp),
                ambientColor = Archive.StampShadow,
                spotColor = Archive.StampShadow
            )
            .clip(RoundedCornerShape(10.dp))
            .background(Archive.Paper)
    ) {
        // 顶部一道色条，暗示「折叠的说明书」
        Box(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(horizontal = 13.dp)
                .fillMaxWidth()
                .height(3.dp)
                .background(
                    color = Archive.ArtTop.copy(alpha = 0.85f),
                    shape = RoundedCornerShape(bottomStart = 3.dp, bottomEnd = 3.dp)
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(start = 13.dp, end = 13.dp, top = 15.dp, bottom = 10.dp)
        ) {
            // 头部：药名 + 小字 + 分隔线（设计稿 name 15pt + sub 8pt + padding-bottom 9）
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 9.dp)
            ) {
                Text(
                    text = entry.name,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Archive.StampInk,
                    letterSpacing = (-0.15).sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 8.dp)
                )
                Text(
                    text = entry.subtitle ?: stringResource(R.string.medication_archiveReadMe),
                    fontSize = 8.sp,
                    color = Archive.StampMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 3.dp)
                )
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(Archive.StampEdge)
            )

            // 正文：label/value 两列，纵向均分（设计稿 justify-content: space-evenly）
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .padding(top = 9.dp),
                verticalArrangement = Arrangement.SpaceEvenly
            ) {
                entry.rows.forEach { row ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = row.label,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Archive.StampInk,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.width(54.dp)
                        )
                        Text(
                            text = row.value,
                            fontSize = 8.5.sp,
                            lineHeight = 11.sp,
                            color = Archive.StampMuted,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }

            // 底部：建档日期
            if (entry.footer != null) {
                Text(
                    text = entry.footer,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 7.sp,
                    color = Archive.StampMuted.copy(alpha = 0.85f),
                    letterSpacing = 0.14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(top = 6.dp)
                )
            }
        }
    }
}

/** 线性插值。跟手公式与设计稿的三段 lerp 同构。 */
private fun lerp(from: Float, to: Float, fraction: Float): Float =
    from + (to - from) * fraction
