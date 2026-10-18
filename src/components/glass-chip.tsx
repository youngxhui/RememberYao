import {
  GlassContainer,
  GlassView,
  type GlassContainerProps,
} from "expo-glass-effect";
import { Pressable as RNPressable, Text as RNText } from "react-native";

import { Spacing, Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

import { useLiquidGlassEnabled } from "./content-glass";

/**
 * RN 版玻璃 Chip：纯 RN `Pressable`，两端各自退化。
 *
 * - iOS：`expo-glass-effect` 的 `GlassView` 铺原生液态玻璃，文字色不随暗色翻面。
 * - Android / 降透明 / a11y 未 resolve：实心 token 选中态。
 * - Pressable 是最外层，padding 写在这里，热区 = 整颗胶囊。
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
    <RNPressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        minHeight: 32,
        borderRadius: Radius.pill,
        borderCurve: "continuous",
        // 玻璃祖先禁止改 opacity：opacity 过低玻璃会直接变淡，
        // Metal 路径的采样会一起淡。Android 实心分支可以。
        ...(!nativeGlass && pressed ? { opacity: 0.85 } : null),
        ...(nativeGlass
          ? null
          : {
              backgroundColor: active ? theme.primary : theme.surface,
              borderWidth: 1,
              borderColor: active ? theme.primary : theme.border,
            }),
      })}
    >
      <GlassView
        tintColor={active ? theme.primary : undefined}
        isInteractive={true}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          borderRadius: 999,
        }}
      />

      <RNText style={{ fontSize: 14, fontWeight: "600", color: labelColor }}>
        {label}
      </RNText>
    </RNPressable>
  );
}

/**
 * 玻璃 chip 行的融合容器：屏幕要横滑一排 chip 时套这一层，
 * 不要自己 import `expo-glass-effect`（迁移计划 §3 的 allowlist 只允许共享组件层引玻璃包）。
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
