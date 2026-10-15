import { Text } from "@expo/ui";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useState } from "react";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

import type { NativeDatePickerProps } from "./native-date-picker";

/**
 * Android：社区的 `DateTimePicker` 默认 `presentation="dialog"`，而 Material 3 的
 * `TimePickerDialog` / `DatePickerDialog` 整个 content 就是一个 AlertDialog
 * （见 `expo-ui` 的 `DatePickerView.kt`）—— **一挂载就弹**。把选择器直接渲染进
 * 表单，等于进页面就弹系统对话框：快速添加第二步一进来「吃药时间」扑面而来，
 * plan-form 把每日次数从 1 档调到 3 档还会连弹三层。社区组件的类型注释也写明了
 * 这个契约：`'dialog'` … opens on mount. The caller should unmount the component
 * in response.
 *
 * 所以这里按 iOS compact 那套语义改写：先画一颗灰底胶囊显示当前值，**点一下才挂载
 * 对话框**，选完（`onValueChange`）或取消（`onDismiss`）立即卸载。胶囊由 universal
 * `Text` 承担 —— 它在 Android 上就是原生 Compose Text，`style` 的
 * background / borderRadius / padding 与 `onPress` 会经 `transformToModifiers`
 * 翻成 `clip` + `background` + `padding` + `clickable`（带涟漪），`testID` 走
 * Compose testTag（对话框那版反而不转发 testID，Maestro 点不到）。
 *
 * props 与另两份平台实现保持一字不差（AGENTS.md：平台文件的 API 不许漂移），
 * 调用方无感。
 */
export function NativeDatePicker({
  value,
  mode,
  minimumDate,
  is24Hour,
  accentColor,
  locale,
  testID,
  embedInHost: _embedInHost,
  onValueChange,
}: NativeDatePickerProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Text
        testID={testID}
        onPress={() => {
          setOpen(true);
        }}
        style={{
          // 灰底胶囊对齐 iOS 的 compact 样式（compact 日期选择器自己就画一颗灰底胶囊）；
          // 值染品牌色对应 iOS 那边的 tint(accentColor)
          backgroundColor: theme.backgroundElement,
          borderRadius: Radius.pill,
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.two,
        }}
        textStyle={{
          fontSize: 15,
          fontWeight: "600",
          color: accentColor ?? theme.text,
        }}
      >
        {formatValue(value, mode, locale, is24Hour)}
      </Text>
      {open ? (
        <DateTimePicker
          value={value}
          mode={mode}
          minimumDate={minimumDate}
          is24Hour={is24Hour}
          accentColor={accentColor}
          onValueChange={(_, date) => {
            onValueChange(date);
            setOpen(false);
          }}
          onDismiss={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/** 胶囊上显示的当前值：格式跟 App 语言走（同 iOS 侧的 `locale`），不跟系统 locale */
function formatValue(
  value: Date,
  mode: NativeDatePickerProps["mode"],
  locale?: string,
  is24Hour?: boolean,
) {
  if (mode === "time") {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      // 没显式给 is24Hour 时交给 locale 默认（中文 24 小时制、英文 AM/PM），
      // 给了就按它：Android 的 Material 选择器没有 locale 可依
      hour12: is24Hour === undefined ? undefined : !is24Hour,
    }).format(value);
  }
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}
