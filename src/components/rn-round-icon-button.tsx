import { Button } from "tamagui";

import { SymbolIcon, type SymbolIconName } from "@/components/symbol-icon";
import { useTheme } from "@/hooks/use-theme";

/**
 * 纯 Tamagui 圆形图标按钮（替代 Expo UI 版 RoundIconButton）。
 * 用于已迁到 Tamagui 的屏幕（如 profile 首页）。
 *
 * 尺寸不走 Button 的 sm/md/lg 档位：那三档高度是 36/54/56，而圆形按钮要的是
 * 「直径即高度」的方形尺寸。所以 `size={false}` 关掉档位派生，宽高与圆角全部显式给
 * （圆角用 Radius.pill 对应的 token 名 "pill"）。
 *
 * 图标颜色仍走 `useTheme()`：`SymbolIcon` 把 color 喂给原生的 SymbolView，
 * 收不了 Tamagui 的 token 名。
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
    <Button
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      size={false}
      width={size}
      height={size}
      minWidth={size}
      borderRadius="pill"
      borderCurve="continuous"
      backgroundColor="surface press:backgroundElement"
      borderWidth={1}
      borderColor="border"
      alignItems="center"
      justifyContent="center"
    >
      <SymbolIcon
        name={icon as SymbolIconName}
        size={iconSize}
        color={theme.text}
      />
    </Button>
  );
}
