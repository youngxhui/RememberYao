import { RNHostView } from "@expo/ui";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useRef, useState, type ComponentProps } from "react";
import {
  Pressable,
  Text as RNText,
  View as RNView,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from "react-native";
import Animated, {
  cubicBezier,
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation, type Translate } from "@/i18n";
import {
  medicationTypeLabel,
  medicationUnitLabel,
  type Medication,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

/** 说明书正文的一行 */
export type ArchiveRow = { label: string; value: string };

/** 一张说明书卡片的数据（水平列表与文件夹内的飞行卡共用） */
export type ArchiveEntry = {
  id: string;
  name: string;
  /** 正文条目，设计稿为「成份 / 适应症 / …」四~五条 */
  rows: ArchiveRow[];
  /** 标题下小字 */
  subtitle?: string;
  /** 底部小字，设计稿为「批准文号 · 企业」位置 */
  footer?: string;
};

export type MiniArchiveProps = {
  entries: ArchiveEntry[];
  /** 封面大标题 */
  title?: string;
  /** 封面副标题（等宽小字） */
  subtitle?: string;
  /** 收起时的提示文案 */
  closedHint?: string;
  /** 展开后的提示文案 */
  openHint?: string;
  /** 无条目时的提示文案 */
  emptyHint?: string;
  /** 点按某张说明书 */
  onSelectEntry?: (entry: ArchiveEntry) => void;
  /** SwiftUI `Host` 的 onLayoutContent 实测内容区宽度，优先级最高。
   *  RNHostView(matchContents) 下 Yoga 用无约束测量被托管的 RN 子树，
   *  onLayout 只会把当前宽度回读出来、拿不到父级宽度，所以 SwiftUI 侧
   *  必须把实测宽度喂下来；窗口宽/安全区变化时 Host 会重新派发，值不会陈旧。
   *  纯 RN 接入不传，走 onLayout 自测。 */
  containerWidth?: number;
  /** 布局覆盖，最后合并。取 View 的 style 类型而非 StyleProp<ViewStyle> ——
   * expo 的 react-native-web 声明给 ViewStyle 并集塞进了 "fixed"/"sticky"，
   * 直接用它会被 View 的 style（仅 absolute/relative/static）拒绝 */
  style?: ComponentProps<typeof RNView>["style"];
};

// ── 卡片几何：与 design/profile.html 的 --card-w / --card-gap 同源。
//    飞行位移按「节距 × 索引」计算，落点必须与列表卡位像素级一致。──
const CARD_W = 230;
const CARD_GAP = 16;
const PITCH = CARD_W + CARD_GAP;
const FOLDER_W = 210;
const FOLDER_H = 300;
const FOLDER_RADIUS = 26;
/** 封皮磨砂强度：设计稿为 backdrop-filter blur(14px) saturate(1.15)，
 *  UIVisualEffectView 没有像素级对应，intensity（0–100）按观感校准 */
const COVER_BLUR_INTENSITY = 70;
const LEAF_W = 210;
const LEAF_H = 268;
/** 闭合时说明书缩到该比例，形成「厚沓」层叠 */
const STACK_SCALE = 0.6476;
const SCROLL_PAD_TOP = 30;
const SCROLL_PAD_BOTTOM = 34;
const SECTION_PAD_TOP = 10;
const SECTION_PAD_BOTTOM = 4;
const SCROLLER_H = SCROLL_PAD_TOP + FOLDER_H + SCROLL_PAD_BOTTOM;
// RN 版不渲染 caption；只预留实际 section + scroller 的高度。
const SHELL_H = SECTION_PAD_TOP + SCROLLER_H + SECTION_PAD_BOTTOM;

// 滚过 40px 即判定为展开（与设计稿 sync() 的阈值一致）
const OPEN_THRESHOLD = 40;
// 封面/底板变暗的滚动行程：0→260px 映射到透明度 1→0.65
const DIM_RANGE = 260;

// 飞行曲线（设计稿 cubic-bezier(0.3,0.4,0.2,1)）：峰值斜率压到 ~2.5，起步不爆冲
const FLY_EASE = cubicBezier(0.3, 0.4, 0.2, 1);
// 封皮翻开曲线（设计稿 cubic-bezier(0.23,1,0.32,1)）
const COVER_EASE = cubicBezier(0.23, 1, 0.32, 1);
// CSS 默认 ease，用于按压反馈与交叉淡入淡出
const CSS_EASE = cubicBezier(0.25, 0.1, 0.25, 1);

// 160deg / 135deg 的渐变起止点（CSS 角度 → 归一化坐标）
const GRAD_160 = {
  start: { x: 0.33, y: 0.03 },
  end: { x: 0.67, y: 0.97 },
};
const GRAD_135 = {
  start: { x: 0.15, y: 0.15 },
  end: { x: 0.85, y: 0.85 },
};

/** 单张飞行时长：距离越远飞得久，平均速度压在 ≤1000px/s */
const flyDuration = (i: number) => 1200 + i * 140;
/** 展开：按堆叠层序反转（最上层先飞），min() 封顶让头 3 张错峰 */
const takeoffDelay = (i: number, n: number) =>
  120 + Math.min(n - 1 - i, 2) * 120;
/** 收起：按堆叠顺序依次归位 */
const returnDelay = (i: number) => 120 + Math.min(i, 2) * 120;
/** 闭合扇形的递增步长：张数越多扇得越紧 */
const stackStep = (n: number) => Math.min(1, 3 / n);

/** store 药品 → 说明书条目：只展示 store 里真实存在的字段 */
export function archiveEntryFromMedication(
  medication: Medication,
  t: Translate,
): ArchiveEntry {
  const unit = medicationUnitLabel(medication.unit, t);
  return {
    id: medication.id,
    name: medication.name,
    rows: [
      {
        label: t("medication.totalQuantity"),
        value: `${medication.totalQuantity} ${unit}`,
      },
      {
        label: t("medication.remaining"),
        value: `${medication.remainingQuantity} ${unit}`,
      },
      {
        label: t("medication.packaging"),
        value: medicationTypeLabel(medication.type, t),
      },
      {
        label: t("medication.notes"),
        value: medication.notes.trim() || t("common.none"),
      },
    ],
    footer: t("medication.archiveCreatedAt", {
      date: medication.createdAt.slice(0, 10),
    }),
  };
}

/**
 * Mini Archive 收藏夹：闭合时居中一个文件夹，点按或右滑展开成说明书横排。
 * 设计基准 design/profile.html 的「Mini Archive」区块。
 * 开合状态完全由滚动进度驱动 —— 点按只是发起一次原生平滑滚动，
 * 点按与手滑因此走同一条链路，观感一致。
 */
export function MiniArchive({
  entries,
  containerWidth,
  title,
  subtitle,
  // closedHint / openHint / emptyHint 暂不生效：caption 提示段已按调试需要移除，
  // 字段保留在 MiniArchiveProps 中，恢复时加回解构即可
  onSelectEntry,
  style,
}: MiniArchiveProps) {
  const t = useTranslation();
  const reduced = useReducedMotion();
  const count = entries.length;

  const [open, setOpen] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // 宽度来源优先级：
  //   1. containerWidth —— SwiftUI Host onLayoutContent 实测的内容区宽，
  //      matchContents 下唯一可靠的来源，且窗口/安全区变化时会重新派发；
  //   2. measured —— 外层 RNView onLayout 实测，纯 RN 接入（有父级约束）有效；
  //   3. fallbackWidth —— 「窗口宽 − 水平安全区」。
  // SwiftUI 侧按安全区布局，Host 的内容区比窗口窄 insets.left + insets.right；
  // RN 侧不减掉同一块，RNHostView 就会宽过 Host，被 hosting controller 居中
  // 溢出，把同列的 SwiftUI 兄弟节点整体推歪（文本开头被屏幕左缘切掉）。
  const fallbackWidth = Math.max(0, windowWidth - insets.left - insets.right);
  // 窗口宽和安全区都会变（折叠屏展开、分屏、旋转），而 matchContents 下
  // onLayout 只会把当前宽度回读出来，所以实测值必须记下它是在哪套兜底宽度下
  // 量的：兜底宽度一变，旧实测值作废、重新派生，否则屏幕变了宽度还卡在旧值。
  const [measured, setMeasured] = useState<{
    fallback: number;
    width: number;
  } | null>(null);

  const handleMeasuredLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const next = Math.round(event.nativeEvent.layout.width);
      if (next > 0) {
        setMeasured((prev) =>
          prev && prev.width === next
            ? prev
            : { fallback: fallbackWidth, width: next },
        );
      }
    },
    [fallbackWidth],
  );

  const measuredWidth =
    measured?.fallback === fallbackWidth ? measured.width : 0;
  const requestedWidth =
    containerWidth != null && containerWidth > 0
      ? containerWidth
      : measuredWidth > 0
        ? measuredWidth
        : 0;
  // 折叠/展开时 Host 的 onLayoutContent 可能比 windowDimensions 晚一帧，
  // 不能让旧的展开宽度压过当前窗口的可用宽度；取两者较小值，展开时
  // Host 回调到达后再恢复到真实内容宽度。
  const width =
    requestedWidth > 0 && fallbackWidth > 0
      ? Math.min(requestedWidth, fallbackWidth)
      : requestedWidth > 0
        ? requestedWidth
        : fallbackWidth;

  const scrollX = useSharedValue(0);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollX.set(event.contentOffset.x);
  });

  // 阈值穿越只在跨过时回 RN 线程一次，不逐帧 setState
  useAnimatedReaction(
    () => scrollX.get() > OPEN_THRESHOLD,
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setOpen, current);
    },
  );

  // 封面与底板随滚动进度变暗，只影响文件夹本体，不影响飞行中的说明书
  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.get(),
      [0, DIM_RANGE],
      [1, 0.65],
      Extrapolation.CLAMP,
    ),
  }));

  // 点按文件夹：闭合→平滑滚到说明书1（展开）；已展开→平滑滚回文件夹（合上）
  const toggleFolder = () => {
    if (count === 0) return;
    scrollRef.current?.scrollTo({
      x: open ? 0 : PITCH,
      animated: !reduced,
    });
  };

  return (
    <RNView onLayout={handleMeasuredLayout}>
      <RNView
        style={[
          {
            width,
            height: SHELL_H,
            paddingTop: SECTION_PAD_TOP,
            paddingBottom: SECTION_PAD_BOTTOM,
          },
          style,
        ]}
      >
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          style={{ height: SCROLLER_H }}
          showsHorizontalScrollIndicator={false}
          onScroll={scrollHandler}
          decelerationRate="fast"
          snapToOffsets={Array.from({ length: count + 1 }, (_, k) => k * PITCH)}
          contentContainerStyle={{
            flexDirection: "row",
            alignItems: "center",
            gap: CARD_GAP,
            paddingHorizontal: Math.max(0, (width - CARD_W) / 2),
            paddingTop: SCROLL_PAD_TOP,
            paddingBottom: SCROLL_PAD_BOTTOM,
          }}
        >
          <FolderSlot
            title={title ?? t("medication.archiveTitle")}
            subtitle={subtitle ?? t("medication.archiveSubtitle")}
            open={open}
            count={count}
            reduced={reduced}
            dimStyle={dimStyle}
            entries={entries}
            accessibilityLabel={
              count === 0
                ? t("medication.archiveEmptyAccessibility")
                : open
                  ? t("medication.archiveCollapseAccessibility")
                  : t("medication.archiveExpandAccessibility")
            }
            onPress={toggleFolder}
          />
          {entries.map((entry, index) => (
            <LeafletSlot
              key={entry.id}
              entry={entry}
              index={index}
              count={count}
              open={open}
              reduced={reduced}
              onPress={onSelectEntry ? () => onSelectEntry(entry) : undefined}
            />
          ))}
        </Animated.ScrollView>
      </RNView>
    </RNView>
  );
}

/**
 * 放进 Expo UI 页面时用这个。
 * 高度由 MiniArchive 内部 RN View 的固定尺寸提供，RNHostView 通过
 * matchContents 将 RN 子树的尺寸同步给 SwiftUI / Compose；不要再给
 * RNHostView 写百分比 style，跨平台适配层对 style 的支持并不一致。
 * 纯 RN 页面继续直接用 MiniArchive。
 */
export function MiniArchiveExpoUI(props: MiniArchiveProps) {
  return (
    <RNHostView matchContents>
      <MiniArchive {...props} />
    </RNHostView>
  );
}

/** 文件夹卡位（列表第 1 项）：按压缩放 + 封皮翻开 + 内部说明书堆叠 */
function FolderSlot({
  title,
  subtitle,
  open,
  count,
  reduced,
  dimStyle,
  entries,
  accessibilityLabel,
  onPress,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  count: number;
  reduced: boolean;
  dimStyle: object;
  entries: ArchiveEntry[];
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={accessibilityLabel}
      testID="mini-archive-folder"
      style={{
        width: CARD_W,
        height: FOLDER_H,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          width: FOLDER_W,
          height: FOLDER_H,
          transform: [{ scale: pressed ? 0.97 : 1 }],
          transitionProperty: "transform",
          transitionDuration: reduced ? 0 : 200,
          transitionTimingFunction: CSS_EASE,
        }}
      >
        <FolderBack dimStyle={dimStyle} />
        {/* 说明书堆叠在封皮之下（z 序：底板 < 说明书 < 封皮），
            展开时从半透明封皮下飞出，与列表卡交叉淡入 */}
        <RNView style={StyleSheet.absoluteFill}>
          {entries.map((entry, index) => (
            <MiniLeaf
              key={entry.id}
              entry={entry}
              index={index}
              count={count}
              open={open}
              reduced={reduced}
            />
          ))}
        </RNView>
        <FolderFront
          title={title}
          subtitle={subtitle}
          open={open}
          reduced={reduced}
          dimStyle={dimStyle}
        />
      </Animated.View>
    </Pressable>
  );
}

/** 文件夹底板：青绿渐变 + 投影，随滚动变暗 */
function FolderBack({ dimStyle }: { dimStyle: object }) {
  const archive = useTheme().archive;
  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        dimStyle,
        {
          borderRadius: FOLDER_RADIUS,
          overflow: "hidden",
          boxShadow: `0 16px 30px -16px ${archive.shadow}`,
        },
      ]}
    >
      <LinearGradient
        colors={[archive.tab, archive.back]}
        start={GRAD_160.start}
        end={GRAD_160.end}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/**
 * 磨砂半透明封皮：透视下绕左侧翻开（open 时 rotateY -58°），
 * 透过封皮能隐约看到里面的说明书 —— RN 没有 backdrop-filter，
 * 半透明渐变本身已承载「透出内页」的意图
 */
function FolderFront({
  title,
  subtitle,
  open,
  reduced,
  dimStyle,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  reduced: boolean;
  dimStyle: object;
}) {
  const archive = useTheme().archive;
  return (
    <Animated.View
      style={[
        dimStyle,
        {
          ...StyleSheet.absoluteFill,
          borderRadius: FOLDER_RADIUS,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.22)",
          transformOrigin: ["0%", "50%", 0],
          transform: [
            { perspective: 1500 },
            { rotateY: open ? "-58deg" : "0deg" },
          ],
          transitionProperty: "transform",
          transitionDuration: reduced ? 0 : 1250,
          transitionTimingFunction: COVER_EASE,
        },
      ]}
    >
      {/* 磨砂底：等价设计稿封皮的 backdrop-filter: blur(14px) saturate(1.15)，
          模糊身后的文件夹底板与说明书堆叠，透过封皮看到的是磨砂后的内页。
          打开时封皮转开、磨砂不可见，与设计稿一致直接关闭
          （backdrop-filter: none），避免 transform 期间每帧重采样出残影 */}
      {!open ? (
        <BlurView
          intensity={COVER_BLUR_INTENSITY}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <LinearGradient
        colors={[
          withAlpha(archive.coverTop, 0.55),
          withAlpha(archive.coverBottom, 0.62),
        ]}
        start={GRAD_160.start}
        end={GRAD_160.end}
        style={StyleSheet.absoluteFill}
      />
      {/* 顶部内高光：设计稿 box-shadow 的 inset 0 1px 0 rgba(255,255,255,0.4) */}
      <RNView
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: "rgba(255,255,255,0.4)",
        }}
      />
      <LinearGradient
        colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"]}
        locations={[0, 0.46]}
        start={GRAD_135.start}
        end={GRAD_135.end}
        style={StyleSheet.absoluteFill}
      />
      <RNView
        style={{
          flex: 1,
          justifyContent: "flex-end",
          paddingVertical: 24,
          paddingHorizontal: 22,
        }}
      >
        <RNText
          numberOfLines={1}
          style={{
            fontSize: 27,
            fontWeight: "800",
            color: archive.ink,
            letterSpacing: -0.5,
          }}
        >
          {title}
        </RNText>
        <RNText
          numberOfLines={1}
          style={{
            marginTop: 6,
            fontFamily: Fonts.mono,
            fontSize: 11,
            color: archive.inkMuted,
            letterSpacing: 1.8,
            textTransform: "uppercase",
          }}
        >
          {subtitle}
        </RNText>
        <RNView style={{ marginTop: 24, gap: 10 }}>
          {["100%", "84%", "92%"].map((lineWidth) => (
            <RNView
              key={lineWidth}
              style={{
                width: lineWidth,
                height: 3,
                borderRadius: 2,
                backgroundColor: archive.line,
              }}
            />
          ))}
        </RNView>
      </RNView>
    </Animated.View>
  );
}

/**
 * 封皮下的飞行说明书：闭合时按索引递增偏移形成扇形厚沓；
 * 展开时飞到第 index+1 个列表卡位（文件夹占第 0 位），到位后淡出
 */
function MiniLeaf({
  entry,
  index,
  count,
  open,
  reduced,
}: {
  entry: ArchiveEntry;
  index: number;
  count: number;
  open: boolean;
  reduced: boolean;
}) {
  const step = stackStep(count);
  const transform = open
    ? [
        { translateX: (index + 1) * PITCH },
        { translateY: 0 },
        { rotate: "0deg" },
        { scale: 1 },
      ]
    : [
        { translateX: -7 + index * 6 * step },
        { translateY: -6 + index * 7 * step },
        { rotate: `${-4 + index * 3.5 * step}deg` },
        { scale: STACK_SCALE },
      ];
  // 淡出起点 = 起飞延迟 + 飞行时长 + 错峰，落位前与列表卡的淡入交叉
  const opacityDelay = open
    ? reduced
      ? 0
      : flyDuration(index) + Math.min(count - 1 - index, 2) * 100
    : reduced
      ? 0
      : returnDelay(index);
  return (
    <RNView
      style={[
        StyleSheet.absoluteFill,
        { alignItems: "center", justifyContent: "center" },
      ]}
    >
      <Animated.View
        style={{
          transform,
          opacity: open ? 0 : 1,
          transitionProperty: ["transform", "opacity"],
          transitionDuration: [
            reduced ? 0 : flyDuration(index),
            reduced ? 150 : 300,
          ],
          transitionDelay: [
            reduced
              ? 0
              : open
                ? takeoffDelay(index, count)
                : returnDelay(index),
            opacityDelay,
          ],
          transitionTimingFunction: [FLY_EASE, CSS_EASE],
        }}
      >
        <LeafletBody entry={entry} />
      </Animated.View>
    </RNView>
  );
}

/** 水平列表里的说明书卡位：平时透明，展开时按反转顺序交叉淡入 */
function LeafletSlot({
  entry,
  index,
  count,
  open,
  reduced,
  onPress,
}: {
  entry: ArchiveEntry;
  index: number;
  count: number;
  open: boolean;
  reduced: boolean;
  onPress?: () => void;
}) {
  const t = useTranslation();
  // 淡入起点 = 起飞延迟 + 各自飞行时长 − 270ms，落位后 150ms 收尾
  const delay = reduced
    ? 0
    : open
      ? 1050 + index * 140 + Math.min(count - 1 - index, 2) * 120
      : 0;
  return (
    <Animated.View
      style={{
        width: CARD_W,
        height: LEAF_H,
        alignItems: "center",
        justifyContent: "center",
        opacity: open ? 1 : 0,
        transitionProperty: "opacity",
        transitionDuration: reduced ? 150 : 420,
        transitionDelay: delay,
        transitionTimingFunction: CSS_EASE,
      }}
    >
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={entry.name}
          accessibilityHint={t("medication.archiveEntryHint")}
          testID={`mini-archive-entry-${entry.id}`}
        >
          <LeafletBody entry={entry} />
        </Pressable>
      ) : (
        <LeafletBody entry={entry} />
      )}
    </Animated.View>
  );
}

/**
 * 药物说明书盒样式：列表卡与文件夹内飞行卡完全共用 —— 闭合时整体缩小，
 * 打开时放大飞入卡位，落点与列表项必须像素级一致，所以两者同一实现
 */
function LeafletBody({ entry }: { entry: ArchiveEntry }) {
  const t = useTranslation();
  const archive = useTheme().archive;
  return (
    <RNView
      style={{
        width: LEAF_W,
        height: LEAF_H,
        paddingTop: 15,
        paddingHorizontal: 13,
        paddingBottom: 10,
        borderRadius: 10,
        backgroundColor: archive.paper,
        boxShadow: `0 10px 22px -10px ${archive.stampShadow}`,
      }}
    >
      {/* 顶部一道色条，暗示「折叠的说明书」 */}
      <RNView
        style={{
          position: "absolute",
          top: 0,
          left: 13,
          right: 13,
          height: 3,
          borderBottomLeftRadius: 3,
          borderBottomRightRadius: 3,
          backgroundColor: archive.artTop,
          opacity: 0.85,
        }}
      />
      <RNView
        style={{
          paddingBottom: 9,
          borderBottomWidth: 1,
          borderColor: archive.stampEdge,
        }}
      >
        <RNText
          numberOfLines={1}
          style={{
            marginTop: 8,
            fontSize: 15,
            fontWeight: "800",
            color: archive.stampInk,
            letterSpacing: -0.15,
          }}
        >
          {entry.name}
        </RNText>
        <RNText
          numberOfLines={1}
          style={{ marginTop: 3, fontSize: 8, color: archive.stampMuted }}
        >
          {entry.subtitle ?? t("medication.archiveReadMe")}
        </RNText>
      </RNView>
      <RNView
        style={{ flex: 1, justifyContent: "space-evenly", paddingTop: 9 }}
      >
        {entry.rows.map((row) => (
          <RNView
            key={row.label}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            <RNText
              numberOfLines={1}
              style={{
                width: 54,
                flexShrink: 0,
                fontSize: 9,
                fontWeight: "600",
                color: archive.stampInk,
              }}
            >
              {row.label}
            </RNText>
            <RNText
              numberOfLines={1}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 8.5,
                lineHeight: 11,
                color: archive.stampMuted,
              }}
            >
              {row.value}
            </RNText>
          </RNView>
        ))}
      </RNView>
      {entry.footer ? (
        <RNText
          numberOfLines={1}
          style={{
            marginTop: 6,
            fontFamily: Fonts.mono,
            fontSize: 7,
            letterSpacing: 0.14,
            color: archive.stampMuted,
            opacity: 0.85,
            textAlign: "center",
          }}
        >
          {entry.footer}
        </RNText>
      ) : null}
    </RNView>
  );
}
