import { Button } from "@expo/ui";
import { Host } from "@expo/ui";
import { Pressable } from "react-native";

import { nativeButtonModifiers } from "@/components/native-layout";
import { Radius } from "@/constants/theme";
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
 * 玻璃按钮残留岛：补货提交等仍需 SwiftUI `.glass` 按钮时使用。
 *
 * 只在 iOS 上呈现系统玻璃；Android 忽略 `style`，退化为实心主按钮。
 * testID 落在外层 Pressable 上，保证 RN / Maestro 可定位。
 */
export function GlassHostButton({
  testID,
  label,
  onPress,
  style = "glass",
  fullWidth,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  style?: "glass" | "glassProminent" | "borderedProminent";
  fullWidth?: boolean;
}) {
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
      <ExpoUiIsland>
        <Button
          label={label}
          onPress={onPress}
          modifiers={nativeButtonModifiers({ style, fullWidth })}
        />
      </ExpoUiIsland>
    </Pressable>
  );
}
