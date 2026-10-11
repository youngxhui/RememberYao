import { DatePicker } from "@expo/ui/swift-ui";
import {
  datePickerStyle,
  environment,
  tint,
  type ModifierConfig,
} from "@expo/ui/swift-ui/modifiers";

import type { NativeDatePickerProps } from "./native-date-picker";

/**
 * iOS：直接用 SwiftUI 的 `DatePicker`，不经过社区的 `DateTimePicker`。
 *
 * 社区组件把 `DatePicker` 包在一个 `Host`（`matchContents`）里 —— 那是在 Expo UI
 * 的原生树里嵌一块 RN island，它的定位不可靠：放进 `Column`（VStack）会顶到父容器
 * 内边距外，放进 `Row`（HStack）会纵向偏移（真机实测，见
 * docs/conventions/ui-design.md「原生自绘控件不要套外盒」）。
 *
 * 这里渲染的 `DatePicker` 本身就是原生视图，由外层 VStack / HStack 正常排布，
 * compact 样式自带「值 + 点击弹出」的胶囊外观，与菜单 `Picker` 的观感一致。
 */
export function NativeDatePicker({
  value,
  mode,
  minimumDate,
  locale,
  accentColor,
  testID,
  onValueChange,
}: NativeDatePickerProps) {
  const modifiers: ModifierConfig[] = [datePickerStyle("compact")];
  if (accentColor) modifiers.push(tint(accentColor));
  // 日期/时间格式跟随 App 语言：中文出 24 小时制与「2026年10月10日」，
  // 英文出 AM/PM 与「Oct 10, 2026」
  if (locale) modifiers.push(environment("locale", locale));

  return (
    <DatePicker
      selection={value}
      displayedComponents={mode === "time" ? ["hourAndMinute"] : ["date"]}
      range={minimumDate ? { start: minimumDate } : undefined}
      onDateChange={(date) => {
        onValueChange(date);
      }}
      modifiers={modifiers}
      testID={testID}
    />
  );
}
