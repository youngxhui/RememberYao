import { Pressable as RNPressable } from "react-native";

import { SymbolIcon, type SymbolIconName } from "@/components/symbol-icon";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 纯 RN 圆形图标按钮（替代 Expo UI 版 RoundIconButton）。
 * 用于已迁到 RN 的屏幕（如 profile 首页）。
 */
export function RnRoundIconButton({
  testID,
  label,
  icon,
  size = 44,
  iconSize = 24,
  onPress,
}: {
  testID: string;
  label: string;
  icon: { ios: string; android: string };
  size?: number;
  iconSize?: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <RNPressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: Radius.pill,
        borderCurve: "continuous",
        backgroundColor: pressed ? theme.backgroundElement : theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <SymbolIcon
        name={icon as SymbolIconName}
        size={iconSize}
        color={theme.text}
      />
    </RNPressable>
  );
}
