import { MenuView, type MenuAction } from "@react-native-menu/menu";
import { Text, View } from "react-native";

import { SYMBOL_ICONS } from "@/components/icons";
import { SymbolIcon } from "@/components/symbol-icon";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type PickerOption<T extends string | number> = {
  label: string;
  value: T;
};

/**
 * RN 版单选选择器：触发器 + **原生菜单**。
 *
 * 底层是 `@react-native-menu/menu`（iOS 14+ `UIMenu`、iOS 13 退化 `ActionSheet`、
 * Android `PopupMenu`），两端都是真原生控件。早先两代实现：
 *
 * 1. `@expo/ui` 的 universal `Picker` —— `appearance` 默认就是 `'menu'`，iOS 落成
 *    SwiftUI `.pickerStyle(.menu)`。它**不吃 RN `style`**（套进输入盒就是「盒子里嵌
 *    一颗绿胶囊」），还必须住在 `Host` 里，内容树迁纯 RN 后每颗都要背一座
 *    `ExpoUiIsland`。
 * 2. 自建的 `TrueSheet` 选项列表 —— 能用，但和设置页其它行的交互范式不一致，
 *    且选项多了之后底部 sheet 比原生菜单重。
 *
 * 现在回到原生菜单，但不依赖 `@expo/ui`：`MenuView` 的 children 就是普通 RN 视图，
 * 点击由外层原生视图接管，不需要 `Host`。
 *
 * ⚠️ 两个平台差异（都无法在 JS 侧抹平）：
 * - **`title` 只在 iOS 生效**，Android 的 `PopupMenu` 没有标题概念。
 * - **选项没有 testID** —— 原生菜单项不是 RN 视图，挂不上 `testID`，Maestro 只能按
 *   文案定位。触发器的 `testID` 仍在我们自己的 `View` 上，和迁移前完全一致。
 *
 * 选中勾由原生菜单自己画（`state: "on"`），不自己画。
 */
export function RnPicker<T extends string | number>({
  testID,
  value,
  options,
  onValueChange,
  placeholder,
  disabled,
  menuTitle,
}: {
  testID: string;
  value: T;
  options: PickerOption<T>[];
  onValueChange: (value: T) => void;
  /** 没有选中项时触发器上显示的文字 */
  placeholder?: string;
  disabled?: boolean;
  /** 菜单标题（仅 iOS 生效） */
  menuTitle?: string;
}) {
  const theme = useTheme();
  const selected = options.find((option) => option.value === value);

  // 触发器：灰底胶囊 + 当前值 + 下拉箭头。
  // 必须是**非交互** View —— 点击由外层 MenuView 的原生视图接管，
  // 在这里塞 Pressable 会和外层抢手势。
  const trigger = (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
        alignSelf: "flex-start",
        minHeight: 32,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderRadius: Radius.pill,
        borderCurve: "continuous",
        backgroundColor: theme.backgroundElement,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ fontSize: 15, fontWeight: "600", color: theme.text }}
      >
        {selected?.label ?? placeholder ?? ""}
      </Text>
      <SymbolIcon
        name={SYMBOL_ICONS.chevronDownRail}
        size={14}
        color={theme.textSecondary}
      />
    </View>
  );

  // MenuView 没有 disabled prop，包一层的话菜单照样弹得开（只是项全灰）。
  // 所以置灰时直接给静态触发器，不包 MenuView。
  if (disabled) return trigger;

  const actions: MenuAction[] = options.map((option) => ({
    id: String(option.value),
    title: option.label,
    state: option.value === value ? "on" : "off",
  }));

  return (
    <MenuView
      title={menuTitle}
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const next = options.find(
          (option) => String(option.value) === nativeEvent.event,
        );
        if (next) onValueChange(next.value);
      }}
    >
      {trigger}
    </MenuView>
  );
}
