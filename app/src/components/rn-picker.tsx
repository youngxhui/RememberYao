import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { SYMBOL_ICONS } from "@/components/icons";
import { SymbolIcon } from "@/components/symbol-icon";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export type PickerOption<T extends string | number> = {
  label: string;
  value: T;
};

/**
 * RN 版单选选择器：触发器 + TrueSheet 选项列表。
 *
 * 替代 `@expo/ui` 的 universal `Picker`。它的 `appearance` 默认就是 `'menu'`
 * （`node_modules/@expo/ui/src/universal/picker/types.ts`），iOS 落成 SwiftUI 的
 * `.pickerStyle(.menu)` 原生 Menu 胶囊：**不吃 RN `style`**（套进输入盒就是「盒子里嵌
 * 一颗绿胶囊」，窄列里中文选项还被折行），而且必须住在 `Host` 里 —— 内容树迁纯 RN 后
 * 每颗Picker 都要额外背一座 `ExpoUiIsland`。选项 ≤ 6 个时用 sheet 列表更一致。
 *
 * 触发器沿用 `RnDateTimePicker` 的灰底胶囊外观，两端同构；选项列表是真原生 sheet
 * （iOS `UISheetPresentationController` / Android `ModalBottomSheet`）。
 *
 * 选项的 testID 是 `<testID>-option-<value>`，与旧 ChipField 的
 * `<testID>-<选项值>` 同一套约定。
 */
export function RnPicker<T extends string | number>({
  testID,
  value,
  options,
  onValueChange,
  placeholder,
  disabled,
  sheetTitle,
}: {
  testID: string;
  value: T;
  options: PickerOption<T>[];
  onValueChange: (value: T) => void;
  /** 没有选中项时触发器上显示的文字 */
  placeholder?: string;
  disabled?: boolean;
  /** sheet 顶部的标题；不传则不画标题 */
  sheetTitle?: string;
}) {
  const theme = useTheme();
  const sheetRef = useRef<TrueSheet>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const openSheet = () => {
    setOpen(true);
    void sheetRef.current?.present(0);
  };

  const select = (next: T) => {
    onValueChange(next);
    void sheetRef.current?.dismiss();
  };

  return (
    <>
      <Pressable
        testID={testID}
        disabled={disabled}
        onPress={openSheet}
        accessibilityRole="button"
        accessibilityState={{ selected: false, disabled: !!disabled }}
        style={({ pressed }) => ({
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
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        })}
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
      </Pressable>

      <TrueSheet
        ref={sheetRef}
        detents={["auto", 0.6]}
        initialDetentIndex={-1}
        onDidDismiss={() => {
          setOpen(false);
        }}
      >
        {open ? (
          <View style={{ padding: Spacing.four, gap: Spacing.half }}>
            {sheetTitle ? (
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "700",
                  color: theme.text,
                  paddingBottom: Spacing.two,
                }}
              >
                {sheetTitle}
              </Text>
            ) : null}
            {options.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={String(option.value)}
                  testID={`${testID}-option-${option.value}`}
                  onPress={() => {
                    select(option.value);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Spacing.three,
                    minHeight: 44,
                    paddingHorizontal: Spacing.three,
                    borderRadius: Radius.tile,
                    backgroundColor: pressed
                      ? theme.backgroundSelected
                      : "transparent",
                  })}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontSize: 16,
                      color: theme.text,
                      fontWeight: active ? "700" : "400",
                    }}
                  >
                    {option.label}
                  </Text>
                  {active ? (
                    <SymbolIcon
                      name={SYMBOL_ICONS.check}
                      size={18}
                      color={theme.primary}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </TrueSheet>
    </>
  );
}
