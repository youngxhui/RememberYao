import {
  GlassContainer,
  GlassView,
  type GlassContainerProps,
} from "expo-glass-effect";
import { Text, View } from "tamagui";

import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

import { useLiquidGlassEnabled } from "./content-glass";

/**
 * 玻璃 Chip：Tamagui 视图 + `expo-glass-effect` 的原生液态玻璃。
 *
 * 玻璃这一层不可能用 Tamagui —— Tamagui 没有液态玻璃能力（iOS 26 的
 * UIGlassEffect 是 Expo 的原生模块），所以模式固定为「玻璃外壳 + Tamagui 内容」：
 * `GlassView` 绝对定位铺满，文字用 Tamagui `Text`。
 *
 * - iOS：`GlassView` 铺原生液态玻璃，文字色不随暗色翻面。
 * - Android / 降透明 / a11y 未 resolve：实心 token 选中态。
 * - 行壳是 Tamagui `View`，padding 写在这里，热区 = 整颗胶囊；按压反馈走
 *   `press:` 子句，由 Tamagui 接线。
 *
 * ⚠️ 玻璃路径上**不能改 opacity**（含按压反馈）：opacity 过低玻璃会直接变淡，
 * Metal 路径的采样会一起淡。所以 `press:` 只换底色，不动透明度。
 */
export function GlassChip({
  testID,
  label,
  active,
  onPress,
}: {
  testID?: string;
  label: string;
  active: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const nativeGlass = useLiquidGlassEnabled();

  // 玻璃开启：文字色随明暗模式翻面 —— 浅色 canvas 会把玻璃提亮成亮面（黑字），
  // 暗色 canvas 上玻璃仍是暗面（亮字），不翻面会看不见（2026-10-18 真机截图）。
  // 实心 fallback（API 不可用 / 降透明 / Android）：与 Android 相同的 token，
  // 禁止把 onGlassChipInactive（#000）铺到暗色 surface（#1C1C1E）上。
  const labelColor = nativeGlass
    ? active
      ? theme.onGlassChipActive
      : theme.onGlassChipInactive
    : active
      ? theme.onPrimary
      : theme.textSecondary;

  return (
    <View
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      paddingInline="three"
      paddingBlock="two"
      minHeight={32}
      borderRadius="pill"
      borderCurve="continuous"
      // 实心档才允许用透明度做按压反馈；玻璃档改了 opacity 会把玻璃一起淡掉
      {...(nativeGlass
        ? null
        : {
            opacity: "1 press:0.85",
            borderWidth: 1,
          })}
      backgroundColor={
        nativeGlass
          ? "transparent"
          : active
            ? "primary"
            : "surface press:backgroundElement"
      }
      {...(nativeGlass ? null : { borderColor: active ? "primary" : "border" })}
    >
      {nativeGlass ? (
        <GlassView
          tintColor={active ? theme.primary : undefined}
          isInteractive={true}
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: Radius.pill,
          }}
        />
      ) : null}

      <Text fontSize={14} fontWeight="600" color={labelColor}>
        {label}
      </Text>
    </View>
  );
}

/**
 * 玻璃 chip 行的融合容器：屏幕要横滑一排 chip 时套这一层，
 * 不要自己 import `expo-glass-effect`（allowlist 只允许共享组件层引玻璃包）。
 *
 * `spacing={2}` 是**故意**的：chip 间距 8pt，2pt 阈值下谁也融不到谁，
 * 容器只是个分组边界，不会出现「两颗 chip 糊成一颗」。
 */
export function GlassChipRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: GlassContainerProps["style"];
}) {
  return (
    <GlassContainer spacing={2} style={style}>
      {children}
    </GlassContainer>
  );
}
