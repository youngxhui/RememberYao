import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Spacing, BottomTabInset } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 内容树默认骨架：RN Yoga + theme token。
 * 默认不要水平 padding（profile Mini Archive 要通栏），
 * 区块自己决定用 Padded 还是 FullBleed。
 */
export function ScreenScaffold({
  children,
  scroll = true,
  contentContainerStyle,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  contentContainerStyle?: object;
}) {
  const theme = useTheme();
  const style = { flex: 1, backgroundColor: theme.canvas } as const;
  if (!scroll) {
    return (
      <ScrollView
        style={style}
        scrollEnabled={false}
        contentContainerStyle={[
          {
            paddingTop: Spacing.three,
            paddingBottom: BottomTabInset + Spacing.five,
          },
          contentContainerStyle,
        ]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <ScrollView
      style={style}
      contentContainerStyle={[
        {
          paddingTop: Spacing.three,
          paddingBottom: BottomTabInset + Spacing.five,
        },
        contentContainerStyle,
      ]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <SafeAreaView>{children}</SafeAreaView>
    </ScrollView>
  );
}

/** 内缩一档：home / records / 表单的常规区块 */
export function Padded({ children }: { children: React.ReactNode }) {
  return <View style={{ paddingHorizontal: Spacing.screen }}>{children}</View>;
}

/** 通栏：profile Mini Archive。必须顶到屏幕左右缘。 */
export function FullBleed({ children }: { children: React.ReactNode }) {
  return <View style={{ alignSelf: "stretch" }}>{children}</View>;
}
