import { GlassView } from "expo-glass-effect";
import { Text, View } from "tamagui";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 玻璃按钮：补货提交、添加计划、删除等仍走系统玻璃。
 *
 * 外壳是 Tamagui `View`（`onPress` + `press:` 子句，Tamagui 自己接线），
 * 玻璃层是 `expo-glass-effect` 的 `GlassView`。**为什么不套 Tamagui `Button`**：
 * Button 的基类自带 `opacity: press:0.7`，而玻璃祖先链上改 opacity 会让整层玻璃
 * 变淡（Metal 路径的采样一起淡）。玻璃按钮的按压反馈由 GlassView 的
 * `isInteractive` 承担，外层只做 0.85 的轻微压暗。
 *
 * Tamagui 没有液态玻璃能力（iOS 26 的 UIGlassEffect 是 Expo 原生模块），
 * 「玻璃外壳 + Tamagui 内容」是唯一模式，见 docs/conventions/ui-design.md。
 *
 * iOS 走 `GlassView`，Android 退化为普通 View（实心主按钮由 theme token 出）；
 * testID 落在外层 View 上，保证 Maestro 可定位。
 *
 * 历史：早先这里是 `ExpoUiIsland`（`@expo/ui` 的 `Host matchContents`，RN 树里挂
 * 原生控件的唯一边界）+ `GlassHostButton` 两个导出，玻璃按钮用 `@expo/ui` 的
 * `Button` + `nativeButtonModifiers` 实现。2026-10-16 菜单 `Picker` 全部换成
 * `RnPicker` 后 `ExpoUiIsland` 生产零调用，整段删除；玻璃按钮也改成 RN
 * `Pressable` + `GlassView`，不再需要 `Host`。文件随之改名为 `glass-host-button.tsx`。
 */
export function GlassHostButton({
  testID,
  label,
  onPress,
  tintColor,
  labelColor,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  /** 兼容旧调用方：按钮本来就是通栏的，这个 prop 现在是空操作 */
  fullWidth?: boolean;
  tintColor?: string | null;
  labelColor?: string | null;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      // 按压只压透明度、不换底色：换底色会被玻璃层盖住看不见
      opacity="1 press:0.85"
      alignSelf="stretch"
      borderRadius="card"
      borderCurve="continuous"
      overflow="hidden"
    >
      <GlassView
        isInteractive
        {...(tintColor !== undefined && tintColor !== null
          ? { tintColor }
          : {})}
        // GlassView 是原生视图，style 收 RN 的 props，不认 Tamagui 的 token 名
        style={{
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.three,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: Radius.card,
        }}
      >
        <Text
          fontSize={15}
          fontWeight="600"
          color={labelColor ?? theme.onPrimary}
        >
          {label}
        </Text>
      </GlassView>
    </View>
  );
}
