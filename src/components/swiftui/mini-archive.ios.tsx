import { Host } from "@expo/ui";
import {
  Button,
  Group,
  HStack,
  Rectangle,
  RoundedRectangle,
  ScrollView,
  Spacer,
  Text,
  VStack,
  ZStack,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  Animation,
  animation,
  background,
  font,
  foregroundStyle,
  frame,
  id,
  offset,
  opacity,
  padding,
  rotation3DEffect,
  rotationEffect,
  scaleEffect,
  scrollPosition,
  scrollTargetLayout,
  shadow,
  strokeBorder,
  useScrollGeometryChange,
} from "@expo/ui/swift-ui/modifiers";
import { useEffect, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import type {
  ArchiveEntryExpoUI,
  MiniArchiveExpoUIProps,
} from "@/components/swiftui/mini-archive-types";
import { useTheme } from "@/hooks/use-theme";

export type {
  ArchiveEntryExpoUI,
  ArchiveRowExpoUI,
  MiniArchiveExpoUIProps,
} from "@/components/swiftui/mini-archive-types";

// ── 卡片几何：与 design/profile.html 的 --card-w / --card-gap 同源。
//    飞行位移按「节距 × 索引」计算，落点必须与列表卡位像素级一致。──
const CARD_W = 230;
const CARD_GAP = 16;
const PITCH = CARD_W + CARD_GAP;
const FOLDER_W = 210;
const FOLDER_H = 300;
const FOLDER_RADIUS = 26;
const LEAF_W = 210;
const LEAF_H = 268;
const LEAF_RADIUS = 10;
/** 闭合时说明书缩到该比例，形成「厚沓」层叠 */
const STACK_SCALE = 0.6476;
const SCROLL_PAD_TOP = 30;
const SCROLL_PAD_BOTTOM = 34;
const SECTION_PAD_TOP = 10;
const SECTION_PAD_BOTTOM = 4;
const CAPTION_MARGIN_TOP = 4;
const CAPTION_LINE = 16;
const SCROLLER_H = SCROLL_PAD_TOP + FOLDER_H + SCROLL_PAD_BOTTOM;
const SHELL_H =
  SECTION_PAD_TOP +
  SCROLLER_H +
  CAPTION_MARGIN_TOP +
  CAPTION_LINE +
  SECTION_PAD_BOTTOM;
/** 滚动定位用的稳定 id：文件夹是列表第 0 项 */
const FOLDER_ID = "mini-archive-folder";
/** 滚过 40px 即判定为展开（与设计稿 sync() 的阈值一致） */
const OPEN_THRESHOLD = 40;

// 飞行曲线（设计稿 cubic-bezier(0.3,0.4,0.2,1)）：峰值斜率压到 ~2.5，起步不爆冲。
// SwiftUI 无三次贝茨时长API，用 easeInOut + 各自时长/延迟复刻节奏
const FLY_EASE = Animation.easeInOut;
// 封皮翻开曲线（设计稿 cubic-bezier(0.23,1,0.32,1)）：末段极缓，用 easeOut 近似
const COVER_EASE = Animation.easeOut;

// 160deg / 135deg 的渐变起止点（CSS 角度 → 归一化坐标）。
// 键名用 SwiftUI 的 startPoint/endPoint，与 background() 的 ShapeStyle 对齐
const GRAD_160 = {
  startPoint: { x: 0.33, y: 0.03 },
  endPoint: { x: 0.67, y: 0.97 },
};
const GRAD_135 = {
  startPoint: { x: 0.15, y: 0.15 },
  endPoint: { x: 0.85, y: 0.85 },
};

/** 单张飞行时长：距离越远飞得久，平均速度压在 ≤1000px/s */
const flyDuration = (i: number) => 1.2 + i * 0.14;
/** 展开：按堆叠层序反转（最上层先飞），min() 封顶让头 3 张错峰 */
const takeoffDelay = (i: number, n: number) =>
  0.12 + Math.min(n - 1 - i, 2) * 0.12;
/** 收起：按堆叠顺序依次归位 */
const returnDelay = (i: number) => 0.12 + Math.min(i, 2) * 0.12;
/** 闭合扇形的递增步长：张数越多扇得越紧 */
const stackStep = (n: number) => Math.min(1, 3 / n);

/** #rrggbb → rgba()，用于设计稿 color-mix(x 55%, transparent) 这类半透明渐变 */
function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith("#")) return hex;
  const value =
    hex.length === 4
      ? hex
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Mini Archive 收藏夹：闭合时居中一个文件夹，点按或右滑展开成说明书横排。
 * 设计基准 design/profile.html 的「Mini Archive」区块。
 *
 * 纯 SwiftUI 实现：横排是一次原生 ScrollView + scrollTargetLayout 分页，
 * 开合状态由 scrollPosition 的 onChange 回传（点按发起 withAnimation 平滑滚动，
 * 手滑走同一条链路），飞行/翻封皮/交叉淡入淡出全部由 `animation(…, open)`
 * 修饰符在原生侧插值，不经 JS 线程逐帧 setState。
 */
export default function MiniArchiveExpoUI({
  entries,
  title = "我的档案",
  subtitle = "Mini Archive",
  closedHint = "点按展开",
  openHint = "右滑回到文件夹合上",
  emptyHint = "暂无药品档案",
  onSelectEntry,
  style,
}: MiniArchiveExpoUIProps) {
  const reduced = useReducedMotion();
  const count = entries.length;

  const [open, setOpen] = useState(false);
  // scrollPosition 绑定：写入即滚动到该 id 对应的卡位
  const scrollTarget = useNativeState<string | null>(FOLDER_ID);
  // 连续滚动几何：只用来在 UI 线程判定开合阈值，不逐帧回 JS
  const scrollX = useNativeState(0);
  // open 的 UI 线程镜像：worklet 里读它做阈值比较，避免 render 期写 ref
  const openMirror = useNativeState(open);
  const geometryModifier = useScrollGeometryChange((geometry) => {
    "worklet";
    scrollX.value = geometry.contentOffsetX;
  });

  // 阈值穿越只在跨过时回 RN 线程一次，与 RN 版 useAnimatedReaction 同构。
  // ObservableState.onChange 是 UI 线程监听器，必须挂 worklet
  useEffect(() => {
    scrollX.onChange = (x: number) => {
      "worklet";
      const next = x > OPEN_THRESHOLD;
      if (next !== openMirror.value) {
        openMirror.value = next;
        scheduleOnRN(setOpen, next);
      }
    };
    return () => {
      scrollX.onChange = null;
    };
  }, [scrollX, openMirror]);

  // RN state 变化时同步镜像，保证下次 worklet 读到的是最新值
  useEffect(() => {
    openMirror.value = open;
  }, [open, openMirror]);

  const handleTargetChange = (target: string | null) => {
    setOpen(target !== null && target !== FOLDER_ID);
  };

  // 点按文件夹：闭合→平滑滚到说明书1（展开）；已展开→平滑滚回文件夹（合上）。
  // 只发起原生滚动，不自造缓动，观感与手滑一致
  const toggleFolder = () => {
    if (count === 0) return;
    const next = open ? FOLDER_ID : entries[0].id;
    scrollTarget.value = next;
  };

  const caption = count === 0 ? emptyHint : open ? openHint : closedHint;

  return (
    <Host style={[{ height: SHELL_H }, style]}>
      <VStack
        spacing={0}
        modifiers={[
          padding({
            top: SECTION_PAD_TOP,
            bottom: SECTION_PAD_BOTTOM,
          }),
        ]}
      >
        <ScrollView
          axes="horizontal"
          showsIndicators={false}
          modifiers={[
            scrollPosition(scrollTarget, { onChange: handleTargetChange }),
            // useScrollGeometryChange 无回调时返回 null；本组件必传，展开兜住类型
            ...(geometryModifier ? [geometryModifier] : []),
          ]}
        >
          <HStack
            spacing={CARD_GAP}
            modifiers={[
              scrollTargetLayout(),
              padding({
                top: SCROLL_PAD_TOP,
                bottom: SCROLL_PAD_BOTTOM,
              }),
            ]}
          >
            <FolderSlot
              title={title}
              subtitle={subtitle}
              entries={entries}
              open={open}
              reduced={reduced}
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
          </HStack>
        </ScrollView>
        <Text
          modifiers={[
            padding({ top: CAPTION_MARGIN_TOP }),
            font({ size: 11 }),
            foregroundStyle("secondaryLabel"),
            frame({ height: CAPTION_LINE, alignment: "center" }),
          ]}
        >
          {caption}
        </Text>
      </VStack>
    </Host>
  );
}

/** 文件夹卡位（列表第 1 项）：按压缩放 + 封皮翻开 + 内部说明书堆叠 */
function FolderSlot({
  title,
  subtitle,
  entries,
  open,
  reduced,
  onPress,
}: {
  title: string;
  subtitle: string;
  entries: ArchiveEntryExpoUI[];
  open: boolean;
  reduced: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      onPress={onPress}
      modifiers={[
        frame({ width: CARD_W, height: FOLDER_H, alignment: "center" }),
        id(FOLDER_ID),
      ]}
    >
      <ZStack alignment="center">
        <FolderBack open={open} reduced={reduced} />
        {/* 说明书堆叠在封皮之下（z 序：底板 < 说明书 < 封皮），
            展开时从半透明封皮下飞出，与列表卡交叉淡入 */}
        <FolderStack entries={entries} open={open} reduced={reduced} />
        <FolderFront
          title={title}
          subtitle={subtitle}
          open={open}
          reduced={reduced}
        />
      </ZStack>
    </Button>
  );
}

/** 文件夹底板：青绿渐变 + 投影 */
function FolderBack({ open, reduced }: { open: boolean; reduced: boolean }) {
  const archive = useTheme().archive;
  return (
    <Group
      modifiers={[
        frame({ width: FOLDER_W, height: FOLDER_H }),
        // 设计稿的滚动变暗（opacity 1→0.65）依赖逐帧 contentOffset，
        // 纯 Expo UI 无此通道，退化为开合布尔驱动的过渡
        opacity(open ? 0.65 : 1),
        animation(FLY_EASE({ duration: reduced ? 0 : 0.6 }), open),
      ]}
    >
      <RoundedRectangle
        cornerRadius={FOLDER_RADIUS}
        modifiers={[
          frame({ width: FOLDER_W, height: FOLDER_H }),
          foregroundStyle({
            type: "linearGradient",
            colors: [archive.tab, archive.back],
            ...GRAD_160,
          }),
          // 设计稿 box-shadow 0 16px 30px -16px
          shadow({ radius: 30, x: 0, y: 16, color: archive.shadow }),
        ]}
      />
    </Group>
  );
}

/**
 * 磨砂半透明封皮：透视下绕左侧翻开（open 时 rotateY -58°），
 * 透过封皮能隐约看到里面的说明书。
 * RN 版用 expo-blur 近似 backdrop-filter；SwiftUI 有原生材质，直接取
 * thin material —— 与设计稿「透出磨砂内页」的意图一致且更接近原生观感。
 */
function FolderFront({
  title,
  subtitle,
  open,
  reduced,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  reduced: boolean;
}) {
  const archive = useTheme().archive;
  return (
    <Group
      modifiers={[
        frame({ width: FOLDER_W, height: FOLDER_H }),
        opacity(open ? 0.65 : 1),
        animation(FLY_EASE({ duration: reduced ? 0 : 0.6 }), open),
      ]}
    >
      <Group
        modifiers={[
          frame({ width: FOLDER_W, height: FOLDER_H }),
          // 绕左侧翻开：先平移到左缘作轴，再 3D 旋转，最后平移回去，
          // 等效 transform-origin: left center
          offset({ x: open ? -FOLDER_W / 2 : 0 }),
          rotation3DEffect({
            angle: open ? -58 : 0,
            axis: { x: 0, y: 1, z: 0 },
            perspective: 1500,
          }),
          offset({ x: open ? FOLDER_W / 2 : 0 }),
          animation(COVER_EASE({ duration: reduced ? 0 : 1.25 }), open),
        ]}
      >
        <ZStack alignment="bottomLeading">
          {/* 磨砂底：设计稿 backdrop-filter blur(14px) saturate(1.15)。
              用 thin material 填满圆角矩形，透出下层的说明书堆叠 */}
          <RoundedRectangle
            cornerRadius={FOLDER_RADIUS}
            modifiers={[
              frame({ width: FOLDER_W, height: FOLDER_H }),
              background({ type: "material", material: "thin" }),
            ]}
          />
          {/* 半透明青绿封皮：设计稿 color-mix 55% / 62% */}
          <RoundedRectangle
            cornerRadius={FOLDER_RADIUS}
            modifiers={[
              frame({ width: FOLDER_W, height: FOLDER_H }),
              foregroundStyle({
                type: "linearGradient",
                colors: [
                  withAlpha(archive.coverTop, 0.55),
                  withAlpha(archive.coverBottom, 0.62),
                ],
                ...GRAD_160,
              }),
            ]}
          />
          {/* 135deg 顶部光泽：设计稿 rgba(255,255,255,0.22) → transparent 46% */}
          <RoundedRectangle
            cornerRadius={FOLDER_RADIUS}
            modifiers={[
              frame({ width: FOLDER_W, height: FOLDER_H }),
              foregroundStyle({
                type: "linearGradient",
                colors: ["rgba(255,255,255,0.22)", "rgba(255,255,255,0)"],
                ...GRAD_135,
              }),
            ]}
          />
          {/* 边框：设计稿 1px rgba(255,255,255,0.22)。strokeBorder 贴着形状走，
              不会被 3D 旋转的边角裁切 */}
          <RoundedRectangle
            cornerRadius={FOLDER_RADIUS}
            modifiers={[
              frame({ width: FOLDER_W, height: FOLDER_H }),
              strokeBorder({
                content: "rgba(255,255,255,0.22)",
                style: { lineWidth: 1 },
              }),
              // 设计稿 box-shadow 0 26px 48px -14px
              shadow({ radius: 48, x: 0, y: 26, color: archive.shadow }),
            ]}
          />
          <VStack
            alignment="leading"
            modifiers={[padding({ horizontal: 22, vertical: 24 })]}
          >
            <Text
              modifiers={[
                font({ size: 27, weight: "heavy" }),
                foregroundStyle(archive.ink),
              ]}
            >
              {title}
            </Text>
            <Text
              modifiers={[
                padding({ top: 6 }),
                font({ size: 11, design: "monospaced" }),
                foregroundStyle(archive.inkMuted),
              ]}
            >
              {subtitle.toUpperCase()}
            </Text>
            {/* 设计稿的装饰线：100% / 84% / 92% */}
            <VStack
              alignment="leading"
              modifiers={[
                padding({ top: 24 }),
                frame({ width: FOLDER_W - 44 }),
              ]}
            >
              {[1, 0.84, 0.92].map((ratio) => (
                <RoundedRectangle
                  key={ratio}
                  cornerRadius={2}
                  modifiers={[
                    padding({ bottom: ratio === 1 ? 0 : 10 }),
                    frame({
                      width: (FOLDER_W - 44) * ratio,
                      height: 3,
                      alignment: "leading",
                    }),
                    foregroundStyle(archive.line),
                  ]}
                />
              ))}
            </VStack>
            <Spacer />
          </VStack>
        </ZStack>
      </Group>
    </Group>
  );
}

/** 封皮下的说明书堆叠层：与列表卡共用同一套盒样式 */
function FolderStack({
  entries,
  open,
  reduced,
}: {
  entries: ArchiveEntryExpoUI[];
  open: boolean;
  reduced: boolean;
}) {
  const count = entries.length;
  return (
    <Group modifiers={[frame({ width: FOLDER_W, height: FOLDER_H })]}>
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
    </Group>
  );
}

/**
 * 封皮下的飞行说明书：闭合时按索引递增偏移形成扇形厚沓；
 * 展开时飞到第 index+1 个列表卡位（文件夹占第 0 位），到位后淡出。
 *
 * 位移/旋转/缩放走 offset+rotationEffect+scaleEffect，opacity 单独一层 ——
 * `animation(_:value:)` 只会插值「同一渲染层」上的 animatable 属性，
 * 拆层才能让飞行与淡出各用自己的时长/延迟。
 */
function MiniLeaf({
  entry,
  index,
  count,
  open,
  reduced,
}: {
  entry: ArchiveEntryExpoUI;
  index: number;
  count: number;
  open: boolean;
  reduced: boolean;
}) {
  const step = stackStep(count);
  return (
    <Group
      modifiers={[
        frame({ width: LEAF_W, height: LEAF_H, alignment: "center" }),
        // 淡出起点 = 起飞延迟 + 飞行时长 + 错峰，落位前与列表卡的淡入交叉
        opacity(open ? 0 : 1),
        animation(
          FLY_EASE({
            duration: reduced ? 0 : 0.3,
          }).delay(
            reduced
              ? 0
              : open
                ? takeoffDelay(index, count) + flyDuration(index)
                : returnDelay(index),
          ),
          open,
        ),
      ]}
    >
      <Group
        modifiers={[
          offset({
            x: open ? (index + 1) * PITCH : -7 + index * 6 * step,
            y: open ? 0 : -6 + index * 7 * step,
          }),
          rotationEffect(open ? 0 : -4 + index * 3.5 * step),
          scaleEffect(open ? 1 : STACK_SCALE),
          animation(
            FLY_EASE({
              duration: reduced ? 0 : flyDuration(index),
            }).delay(
              reduced
                ? 0
                : open
                  ? takeoffDelay(index, count)
                  : returnDelay(index),
            ),
            open,
          ),
        ]}
      >
        <LeafletBody entry={entry} />
      </Group>
    </Group>
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
  entry: ArchiveEntryExpoUI;
  index: number;
  count: number;
  open: boolean;
  reduced: boolean;
  onPress?: () => void;
}) {
  // 淡入起点 = 起飞延迟 + 各自飞行时长 − 270ms，落位后 150ms 收尾
  const delay = reduced
    ? 0
    : open
      ? 1.05 + index * 0.14 + Math.min(count - 1 - index, 2) * 0.12
      : 0;
  const body = (
    <Group
      modifiers={[
        frame({ width: CARD_W, height: LEAF_H, alignment: "center" }),
        id(entry.id),
        opacity(open ? 1 : 0),
        animation(
          FLY_EASE({ duration: reduced ? 0 : 0.42 }).delay(delay),
          open,
        ),
      ]}
    >
      <LeafletBody entry={entry} />
    </Group>
  );
  if (!onPress) return body;
  return (
    <Button onPress={onPress} modifiers={[frame({ width: CARD_W })]}>
      {body}
    </Button>
  );
}

/**
 * 药物说明书盒样式：列表卡与文件夹内飞行卡完全共用 —— 闭合时整体缩小，
 * 打开时放大飞入卡位，落点与列表项必须像素级一致，所以两者同一实现。
 * SwiftUI 无伪元素，纸底/色条/分隔线都用 RoundedRectangle 形状画。
 */
function LeafletBody({ entry }: { entry: ArchiveEntryExpoUI }) {
  const archive = useTheme().archive;
  return (
    <Group modifiers={[frame({ width: LEAF_W, height: LEAF_H })]}>
      {/* 纸底 + 投影：设计稿 box-shadow 0 10px 22px -10px */}
      <RoundedRectangle
        cornerRadius={LEAF_RADIUS}
        modifiers={[
          frame({ width: LEAF_W, height: LEAF_H }),
          foregroundStyle(archive.paper),
          shadow({ radius: 22, x: 0, y: 10, color: archive.stampShadow }),
        ]}
      />
      {/* 顶部一道色条，暗示「折叠的说明书」 */}
      <RoundedRectangle
        cornerRadius={3}
        modifiers={[
          frame({ width: LEAF_W - 26, height: 3, alignment: "topLeading" }),
          offset({ x: 13, y: 0 }),
          foregroundStyle(archive.artTop),
          opacity(0.85),
        ]}
      />
      <VStack
        alignment="leading"
        modifiers={[padding({ top: 15, horizontal: 13, bottom: 10 })]}
      >
        <VStack alignment="leading" modifiers={[padding({ bottom: 9 })]}>
          <Text
            modifiers={[
              padding({ top: 8 }),
              font({ size: 15, weight: "heavy" }),
              foregroundStyle(archive.stampInk),
            ]}
          >
            {entry.name}
          </Text>
          <Text
            modifiers={[
              padding({ top: 3 }),
              font({ size: 8 }),
              foregroundStyle(archive.stampMuted),
            ]}
          >
            {entry.subtitle ?? "请仔细阅读并按说明使用"}
          </Text>
        </VStack>
        {/* 分隔线：设计稿 leaflet-head 的 1px border-bottom */}
        <Rectangle
          modifiers={[
            frame({ width: LEAF_W - 26, height: 1 }),
            foregroundStyle(archive.stampEdge),
          ]}
        />
        <VStack
          alignment="leading"
          modifiers={[padding({ top: 9 }), frame({ width: LEAF_W - 26 })]}
        >
          {entry.rows.map((row) => (
            <Group key={row.label} modifiers={[padding({ bottom: 6 })]}>
              <HStack alignment="center" spacing={8}>
                <Text
                  modifiers={[
                    font({ size: 9, weight: "semibold" }),
                    foregroundStyle(archive.stampInk),
                    frame({ width: 54, alignment: "leading" }),
                  ]}
                >
                  {row.label}
                </Text>
                <Text
                  modifiers={[
                    font({ size: 8.5 }),
                    foregroundStyle(archive.stampMuted),
                    frame({ alignment: "leading" }),
                  ]}
                >
                  {row.value}
                </Text>
              </HStack>
            </Group>
          ))}
        </VStack>
        <Spacer />
        {entry.footer ? (
          <Text
            modifiers={[
              padding({ top: 6 }),
              font({ size: 7, design: "monospaced" }),
              foregroundStyle(archive.stampMuted),
              opacity(0.85),
              frame({ width: LEAF_W - 26, alignment: "center" }),
            ]}
          >
            {entry.footer}
          </Text>
        ) : null}
      </VStack>
    </Group>
  );
}
