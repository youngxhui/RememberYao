import { Pressable as RNPressable, Text as RNText } from "react-native";

import { Spacing, Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

import { ContentGlass, useLiquidGlassEnabled } from "./content-glass";

/**
 * RN 版玻璃 Chip：与旧 `Chip`（Expo UI / FilterChip）双轨共存，
 * 等第 3 批孪生外壳迁完后由 PR14 删除旧文件。
 *
 * - iOS：ContentGlass 铺原生液态玻璃，文字色不随暗色翻面。
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

  // 玻璃开启：印刷色不随暗色翻面（叠在 canvas 上的透明玻璃）。
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
      {nativeGlass ? (
        <ContentGlass
          variant="regular"
          tint={active ? theme.primary : undefined}
          interactive
          // 玻璃圆角只认 cornerRadius prop（原生侧会 clamp 成胶囊）；
          // style.borderRadius 落在非渲染层上，对玻璃形状无效。
          cornerRadius={999}
          // 铺满 Pressable 的边框盒（含 padding），玻璃才是整颗胶囊。
          // 禁止 overflow: 'hidden'（会糊掉高光）。
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
          fallbackStyle={{
            backgroundColor: active ? theme.primary : theme.surface,
            borderWidth: 1,
            borderColor: active ? theme.primary : theme.border,
          }}
        />
      ) : null}
      <RNText style={{ fontSize: 14, fontWeight: "600", color: labelColor }}>
        {label}
      </RNText>
    </RNPressable>
  );
}
