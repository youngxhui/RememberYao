import { GlassView } from "expo-glass-effect";
import { Pressable, Text } from "react-native";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 玻璃按钮：补货提交、添加计划、删除等仍走系统玻璃。
 *
 * iOS 走 `expo-glass-effect` 的 `GlassView`，Android 退化为普通 View（实心主按钮由
 * theme token 出）；testID 落在外层 Pressable 上，保证 RN / Maestro 可定位。
 *
 * 历史：早先这里是 `ExpoUiIsland`（`@expo/ui` 的 `Host matchContents`，RN 树里挂
 * 原生控件的唯一边界）+ `GlassHostButton` 两个导出，玻璃按钮用 `@expo/ui` 的
 * `Button` + `nativeButtonModifiers({ style: "glass" })` 实现。2026-10-16 菜单
 * `Picker` 全部换成 `RnPicker` 后 `ExpoUiIsland` 生产零调用，整段删除；玻璃按钮也
 * 改成 RN `Pressable` + `GlassView`，不再需要 `Host`。文件随之改名为
 * `glass-host-button.tsx`。
 */
export function GlassHostButton({
  testID,
  label,
  onPress,
  fullWidth,
  tintColor,
  labelColor,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
  tintColor?: string | null;
  labelColor?: string | null;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        borderRadius: Radius.card,
        borderCurve: "continuous",
        overflow: "hidden",
        ...(fullWidth ? null : { alignSelf: "stretch" }),
      })}
    >
      <GlassView
        isInteractive
        {...(tintColor !== undefined && tintColor !== null
          ? { tintColor }
          : {})}
        style={{
          paddingVertical: Spacing.three,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: Radius.card,
          ...(fullWidth ? null : { alignSelf: "stretch" }),
        }}
      >
        <Text
          style={{
            color: labelColor ?? theme.onPrimary,
            fontSize: 15,
            fontWeight: "600",
          }}
        >
          {label}
        </Text>
      </GlassView>
    </Pressable>
  );
}
