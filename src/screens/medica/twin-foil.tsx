import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode } from "react";
import { View as RNView } from "react-native";
import { Text, View } from "tamagui";

import { SYMBOL_ICONS } from "@/components/icons";
import { SymbolIcon } from "@/components/symbol-icon";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import type { BlisterPack, BlisterSlot, Medication } from "@/lib/store";
import { pickPillTint, type PillTint } from "@/lib/store";
import { mixColor, withAlpha } from "@/utils/color";

/** 网格格子间距：等分宽度时扣掉的总间隙。取最小档让 10 列的窄板也放得下 */
const CELL_GAP = Spacing.one;

/** 格子尺寸上下限：下限保可点，上限防 3 列的板撑出巨型泡泡 */
const CELL_MIN = 26;
const CELL_MAX = 56;

/**
 * 光源方向：左上。所有径向渐变的中心都按它摆（泡罩受光面、药饼亮心、
 * 凹坑暗心），整板药的光才一致 —— 各处乱给中心会比不给更假。
 */
const LIGHT = { x: 0.36, y: 0.3 };

/** 径向渐变用同心圆近似的层数：越多越平滑，也越费渲染 */
const RADIAL_BANDS = 8;

/** 泡里装的药：剂型（胶囊 / 药饼）+ 配色。由药品推导，见 buildPillLook */
export type PillLook = {
  shape: "capsule" | "tablet";
  tint: PillTint;
};

/**
 * 药品 → 泡里的药长什么样。
 *
 * 剂型取 unit（粒 = 胶囊、片 = 片剂）：录入时已经选过，不重复提问。
 * 配色按药品 id 稳定取色 —— 同一盒药每次打开都是同一副面孔，
 * 换盒重录也不变（哈希同 pickAvatarColor）。
 */
export function buildPillLook(medication: Medication): PillLook {
  return {
    shape: medication.unit === "pill" ? "capsule" : "tablet",
    tint: pickPillTint(medication.id),
  };
}

/**
 * 铝箔药板：纯 RN 实现（`expo-linear-gradient` + 同心圆分层）。
 *
 * 早先这块活在 `@expo/ui` 的 `Host` 岛里，靠 SwiftUI 的
 * `background(_:in:)` 铺 linear / radial 渐变（`nativeGradientBackground`）。
 * 迁到 RN 后：
 *
 * - **linear**（铝箔纸的金属高光、胶囊的套合渐变）→ `LinearGradient` 直接铺，
 *   `start` / `end` 与原 SwiftUI 的 `startPoint` / `endPoint` 一一对应。
 * - **radial**（泡罩受光、凹坑暗心、药饼球面）→ `expo-linear-gradient` 只有线性，
 *   用「以光源为圆心的同心圆分层」近似：层数拉到 8、相邻层之间用 `mixColor`
 *   插值，视觉上读不出色带。这也正是当年 Android 侧的退化路径
 *   （AGENTS.md 记的「平色 + 同心圆分层」），现在两端同构。
 *
 * 想要真正的径向渐变得引 `react-native-svg`（多一个原生依赖 + 一次 prebuild），
 * 当前性价比不值得，先不做。
 */
export function TwinFoilCard({
  width,
  children,
}: {
  width: number;
  children: ReactNode;
}) {
  return <View style={{ width, gap: "three" }}>{children}</View>;
}

/** 泡罩网格：rows × cols 个格子，尺寸按实测内容宽等分 */
export function BlisterGrid({
  pack,
  slots,
  gridWidth,
  pill,
  medication,
  onSlotPress,
}: {
  pack: BlisterPack;
  slots: BlisterSlot[];
  gridWidth: number;
  /** 泡里装什么药：剂型 + 配色，由药品决定（见 buildPillLook） */
  pill: PillLook;
  /** 药板上的印刷内容（药名 + 规格）来自药品本身 */
  medication: Medication;
  onSlotPress: (slotId: string) => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const cellSize = Math.min(
    CELL_MAX,
    Math.max(
      CELL_MIN,
      Math.floor((gridWidth - (pack.cols - 1) * CELL_GAP) / pack.cols),
    ),
  );
  const used = slots.filter((s) => s.status !== "full").length;
  // 窄板（列数少）算完会剩宽度：左右各一条弹性占位把网格压到中线。
  // RN 有 flex，一行里两端各放一个 flex:1 的空 View 即可
  const leftover = Math.max(
    0,
    gridWidth - (pack.cols * cellSize + (pack.cols - 1) * CELL_GAP),
  );
  const pad =
    leftover > 0 ? (
      <View style={{ width: leftover / 2, flexShrink: 0 }} />
    ) : null;

  return (
    <View style={{ gap: "three" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: "$text" }}>
          {t("twin.packChip", { seq: pack.seq })}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 13, color: "$textSecondary" }}>
          {t("twin.packProgress", { used, total: slots.length })}
        </Text>
      </View>

      {/* 整块是一张药板：铝箔纸（金属渐变）+ 热压封边，泡罩排在箔上 */}
      <View
        style={{
          borderRadius: "card",
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: theme.foil.ring,
          backgroundColor: theme.foil.base,
          padding: "two",
          gap: CELL_GAP,
          overflow: "hidden",
        }}
      >
        {/* 铝箔纸：两道金属高光的各向异性渐变。SwiftUI 侧默认
            左上 → 右下，这里保持同一方向 */}
        <LinearGradient
          colors={[...theme.foil.metal]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />

        {/* 药板上的印刷：真泡罩卡一定印着药名与规格。等宽小字 + 字距 =
            油印感，也让它和界面文字区分开 */}
        <Text
          style={{
            fontFamily: "monospace",
            fontSize: 9,
            letterSpacing: 0.6,
            color: "$textSecondary",
          }}
        >
          {medication.specification
            ? `${medication.name}  ${medication.specification}`
            : medication.name}
        </Text>

        {Array.from({ length: pack.rows }, (_row, rowIndex) => (
          <View
            key={rowIndex}
            style={{
              flexDirection: "row",
              gap: CELL_GAP,
              alignItems: "center",
            }}
          >
            {pad}
            {Array.from({ length: pack.cols }, (_col, colIndex) => {
              const slot = slots[rowIndex * pack.cols + colIndex];
              if (!slot) return null;
              return (
                <SlotCell
                  key={slot.id}
                  slot={slot}
                  seq={pack.seq}
                  size={cellSize}
                  pill={pill}
                  onPress={() => {
                    onSlotPress(slot.id);
                  }}
                />
              );
            })}
            {pad}
          </View>
        ))}
      </View>
    </View>
  );
}

/** 格子：铝箔纸上的一泡。full 是凸起的泡罩，其余是服后/损坏留下的坑 */
function SlotCell({
  slot,
  seq,
  size,
  pill,
  onPress,
}: {
  slot: BlisterSlot;
  seq: number;
  size: number;
  pill: PillLook;
  onPress: () => void;
}) {
  const inset = sealInset(size);
  return (
    <View
      testID={`twin-slot-${seq}-${slot.index}`}
      onPress={onPress}
      accessibilityRole="button"
      width={size}
      height={size}
      alignItems="center"
    >
      {slot.status === "full" ? (
        <SealDisc size={size} tone="bubble">
          <Dome size={size - inset * 2} pill={pill} />
        </SealDisc>
      ) : (
        <SealDisc size={size} tone="hole">
          <SlotMark size={size - inset * 2} slot={slot} />
        </SealDisc>
      )}
    </View>
  );
}

/** 热压封边的宽度：泡罩直径 = 格径 − 两倍封边。封边是平的，塑料泡从它中间凸起 */
function sealInset(size: number): number {
  return Math.max(2, Math.round(size * 0.07));
}

/**
 * 热压封边：泡罩压在铝箔上的那一圈平环。
 *
 * 服不服药它都在 —— 顶破的只是塑料，箔上的热压封口不会消失。所以 full 与
 * empty 共用这个外圈，只有圈里的东西不同：泡罩 or 坑。
 */
function SealDisc({
  size,
  tone,
  children,
}: {
  size: number;
  tone: "bubble" | "hole";
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: theme.foil.ring,
        // 封边是平的，一道浅线性渐变就够；坑是凹的，径向渐变的暗心偏左上
        backgroundColor: tone === "bubble" ? theme.foil.shade : theme.foil.dent,
        overflow: "hidden",
      }}
    >
      {tone === "bubble" ? (
        <LinearGradient
          colors={[...theme.foil.seal]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : (
        <RadialStack size={size} colors={theme.foil.hole} />
      )}
      <View
        style={{ width: size, alignItems: "center", justifyContent: "center" }}
      >
        {children}
      </View>
    </View>
  );
}

/**
 * 泡罩：被压出铝箔的透明塑料泡。
 *
 * 径向受光，中心在左上（光源方向），向外一路压暗 —— 泡壁与箔面接近平行的
 * 角度受光最少，这就是塑料泡的体积。药有 0.94 的不透明度，泡的受光面会微微
 * 透上来，读作「药在塑料底下」而不是贴在泡面上。
 */
function Dome({ size, pill }: { size: number; pill: PillLook }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderCurve: "continuous",
        backgroundColor: theme.foil.highlight,
        overflow: "hidden",
      }}
    >
      <RadialStack size={size} colors={theme.foil.plastic} />
      <View
        // 药会沉到泡底：给一点上内边距，让药心比泡心低半个 padding。
        // 真实泡罩里药丸从不悬在泡正中，总是落底的
        style={{
          width: size,
          alignItems: "center",
          paddingTop: Math.round(size * 0.05),
        }}
      >
        <PillMark look={pill} size={Math.round(size * 0.58)} />
      </View>
    </View>
  );
}

/**
 * 径向渐变的同心圆近似：以光源为圆心，从中心到边缘铺 N 层实色圆。
 *
 * 层与层之间先用 `mixColor` 把主题色标插值成 N 段，所以看不出色带；
 * 最外层之外（`endRadius` 达到不了的角落）先用边缘色铺满，避免露底。
 * 半径与原 SwiftUI 的 `endRadius = size / 2` 一致。
 */
function RadialStack({
  size,
  colors,
  children,
}: {
  size: number;
  colors: readonly string[];
  children?: ReactNode;
}) {
  const stops = expandStops(colors, RADIAL_BANDS);
  const cx = LIGHT.x * size;
  const cy = LIGHT.y * size;
  const maxR = size / 2;

  return (
    <RNView style={{ width: size, height: size }} pointerEvents="none">
      {/* endRadius 之外一律用边缘色，先把整个盒子铺满 */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: stops[stops.length - 1],
        }}
      />
      {/* 从大到小画：后画的（小的）盖在先前画的（大的）上面 */}
      {stops.map((color, index) => {
        const r = ((index + 1) / stops.length) * maxR;
        if (r <= 0) return null;
        return (
          <View
            key={index}
            style={{
              position: "absolute",
              width: r * 2,
              height: r * 2,
              left: cx - r,
              top: cy - r,
              borderRadius: r,
              backgroundColor: color,
            }}
          />
        );
      })}
      {children}
    </RNView>
  );
}

/** 把 N 个色标插值成 count 段，让同心圆分层看不出台阶 */
function expandStops(colors: readonly string[], count: number): string[] {
  if (colors.length < 2 || count <= colors.length) return [...colors];
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const pos = t * (colors.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, colors.length - 1);
    out.push(mixColor(colors[lo], colors[hi], pos - lo));
  }
  return out;
}

/** 坑里的状态标记：已服 / 历史消耗 / 损坏 */
function SlotMark({ size, slot }: { size: number; slot: BlisterSlot }) {
  const mark = slotMark(slot);
  const tint = useMarkTint(mark.tone);
  return (
    <SymbolIcon
      name={SYMBOL_ICONS[mark.icon]}
      size={Math.max(9, Math.round(size * 0.42))}
      color={tint}
    />
  );
}

/** 坑里标记的语义档：已服 / 历史消耗 / 损坏。颜色走语义色，同库存胶囊 */
type MarkTone = "success" | "neutral" | "danger";

/** 语义档 → 颜色。hook 而不是常量表：要读 theme，且暗色下语义色会翻面。
 *  返回值喂给 SymbolIcon 的 color（原生 tintColor，不收 Tamagui token 名） */
function useMarkTint(tone: MarkTone): string {
  const theme = useTheme();
  if (tone === "success") return theme.successStrong;
  if (tone === "danger") return theme.dangerStrong;
  return theme.textSecondary;
}

/** 槽位 → 坑里的标记。纯函数：只读状态，颜色由 useMarkTint 从 theme 取 */
function slotMark(slot: BlisterSlot): {
  icon: keyof typeof SYMBOL_ICONS;
  tone: MarkTone;
} {
  if (slot.status === "void") return { icon: "xmark", tone: "danger" };
  if (slot.usageId) return { icon: "check", tone: "success" };
  return { icon: "minusSlot", tone: "neutral" };
}

/**
 * 泡里的药：胶囊（双色）或药饼（圆片）。
 *
 * 明暗不另存一套色板：胶囊的接缝、药饼的球面 shading 都由 tint 现算亮暗
 * 变体（mixColor）—— 换药片配色时不用重新推六套明暗。光源统一在左上，
 * 药饼的径向渐变中心就按它摆，整板药的光才是一致的。
 */
function PillMark({ look, size }: { look: PillLook; size: number }) {
  const { tint } = look;
  // 药在塑料泡底下：微微透出泡的受光面，而不是贴在泡面上
  const underPlastic = 0.94;

  if (look.shape === "capsule") {
    const height = Math.max(6, Math.round(size * 0.66));
    // 帽套在体上，接缝处比两色都暗一点（真实胶囊的套合位）
    const seam = mixColor(tint.cap, tint.body, 0.45);
    const glossHeight = Math.max(1, Math.round(height * 0.12));
    return (
      <View
        style={{
          width: size,
          height,
          borderRadius: height / 2,
          borderCurve: "continuous",
          backgroundColor: tint.body,
          opacity: underPlastic,
          overflow: "hidden",
        }}
      >
        {/* 明胶的蛋壳光泽：顶边一道细高光，只在上三分之一宽 */}
        <LinearGradient
          colors={[tint.cap, tint.cap, seam, tint.body, tint.body]}
          locations={[0, 0.3, 0.5, 0.7, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          style={{
            width: size,
            alignItems: "center",
            paddingTop: Math.max(1, Math.round(height * 0.14)),
          }}
        >
          <View
            style={{
              width: Math.round(size * 0.56),
              height: glossHeight,
              borderRadius: glossHeight / 2,
              backgroundColor: withAlpha("#FFFFFF", 0.55),
            }}
          />
        </View>
      </View>
    );
  }

  // 药饼：径向渐变当球面 shading（亮心在左上、边缘压暗），压痕是一道暗线
  const light = mixColor(tint.body, "#FFFFFF", 0.55);
  const mid = mixColor(tint.body, "#FFFFFF", 0.16);
  const edge = mixColor(tint.body, "#000000", 0.22);
  const scoreWidth = Math.max(2, Math.round(size * 0.5));
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderCurve: "continuous",
        backgroundColor: tint.body,
        opacity: underPlastic,
        overflow: "hidden",
      }}
    >
      <RadialStack size={size} colors={[light, mid, tint.body, edge]} />
      <View style={{ width: size, alignItems: "center" }}>
        <View
          style={{
            width: scoreWidth,
            height: Math.max(1, Math.round(size * 0.05)),
            backgroundColor: mixColor(tint.body, "#000000", 0.32),
          }}
        />
      </View>
    </View>
  );
}

/** 图例：四种格子态的小样，直接复用格子视觉（缩到 14pt 的迷你药板） */
export function SlotLegend({ pill }: { pill: PillLook }) {
  const t = useTranslation();
  // 图例就是缩小版的真格子：封边 + 泡罩 / 封边 + 坑，不是色块示意
  const swatch = 16;
  const items: {
    key: string;
    label: string;
    node: ReactNode;
  }[] = [
    {
      key: "full",
      label: t("twin.legendFull"),
      node: (
        <SealDisc size={swatch} tone="bubble">
          <Dome size={swatch - sealInset(swatch) * 2} pill={pill} />
        </SealDisc>
      ),
    },
    {
      key: "taken",
      label: t("twin.legendTaken"),
      node: (
        <SealDisc size={swatch} tone="hole">
          <SlotMark
            size={swatch - sealInset(swatch) * 2}
            slot={LEGEND_SLOTS.taken}
          />
        </SealDisc>
      ),
    },
    {
      key: "history",
      label: t("twin.legendHistory"),
      node: (
        <SealDisc size={swatch} tone="hole">
          <SlotMark
            size={swatch - sealInset(swatch) * 2}
            slot={LEGEND_SLOTS.history}
          />
        </SealDisc>
      ),
    },
    {
      key: "void",
      label: t("twin.legendVoid"),
      node: (
        <SealDisc size={swatch} tone="hole">
          <SlotMark
            size={swatch - sealInset(swatch) * 2}
            slot={LEGEND_SLOTS.void}
          />
        </SealDisc>
      ),
    },
  ];

  return (
    <View style={{ flexDirection: "row", gap: "three" }}>
      {items.map((item) => (
        <View
          key={item.key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: "half",
          }}
        >
          {item.node}
          <Text style={{ fontSize: 11, color: "$textSecondary" }}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** 图例用的三个假槽位：只借 slotMark 的形状与颜色，不落库 */
const LEGEND_SLOTS: Record<"taken" | "history" | "void", BlisterSlot> = {
  taken: {
    id: "legend-taken",
    packId: "legend",
    index: 0,
    status: "empty",
    usageId: "legend",
    consumedAt: null,
    consumedBy: null,
  },
  history: {
    id: "legend-history",
    packId: "legend",
    index: 0,
    status: "empty",
    usageId: null,
    consumedAt: null,
    consumedBy: null,
  },
  void: {
    id: "legend-void",
    packId: "legend",
    index: 0,
    status: "void",
    usageId: null,
    consumedAt: null,
    consumedBy: null,
  },
};
