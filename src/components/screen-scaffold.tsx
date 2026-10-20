import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { View } from "tamagui";

import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 内容树默认骨架：Tamagui 视图 + theme token。
 * 默认不要水平 padding（profile Mini Archive 要通栏），
 * 区块自己决定用 Padded 还是 FullBleed。
 *
 * 滚动容器仍是 RN 的 `ScrollView`：`contentInsetAdjustmentBehavior` 与
 * `keyboardShouldPersistTaps` 是 RN 专属 prop，Tamagui 的 ScrollView 不透传，
 * 而这两条是 AGENTS.md 的硬规则（安全区 / 可滚动表单）。Tamagui 的样式 prop
 * 收的是 token 名（`"$canvas"`），喂给 RN 组件不解析，所以这里仍走 `useTheme()`
 * 取真实色值。
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
  return <View paddingHorizontal="screen">{children}</View>;
}

/** 通栏：profile Mini Archive。必须顶到屏幕左右缘。 */
export function FullBleed({ children }: { children: React.ReactNode }) {
  return <View alignSelf="stretch">{children}</View>;
}
