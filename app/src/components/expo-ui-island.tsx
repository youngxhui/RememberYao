import { Host } from "@expo/ui";
import { GlassView } from "expo-glass-effect";
import { Pressable, Text } from "react-native";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * RN Yoga 树里的最小 Expo UI 岛。只收 Expo UI 子树，不要往里塞 RN 组件。
 */
export function ExpoUiIsland({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Host seedColor={theme.primary} matchContents>
      {children}
    </Host>
  );
}

/**
 * 玻璃按钮：补货提交等仍走系统玻璃。
 *
 * iOS 走 `expo-glass-effect` 的 `GlassView`，Android 回退为普通 View；
 * testID 落在外层 Pressable 上，保证 RN / Maestro 可定位。
 */
export function GlassHostButton({
  testID,
  label,
  onPress,
  fullWidth,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
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
            color: theme.onPrimary,
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
