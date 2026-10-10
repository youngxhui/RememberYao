import { DateTimePicker } from "@expo/ui/community/datetime-picker";

/**
 * 日期 / 时间选择器：跨平台同一套 props 的入口。
 *
 * 为什么拆平台文件：社区的 `DateTimePicker` 把原生 `DatePicker` 包在一个
 * `Host`（`matchContents`）里 —— 也就是在 Expo UI 的原生树里嵌一块 RN island。
 * 这块 island 的定位不可靠（真机实测：放进 `Column` 会顶出父容器内边距，放进
 * `Row` 会纵向偏移），所以 iOS 侧直接用纯 SwiftUI 的 `DatePicker`
 * （见 `native-date-picker.ios.tsx`），Android / web 继续用社区组件。
 *
 * props 三个变体必须完全一致（AGENTS.md：平台文件的 API 不许漂移）。
 */
export type NativeDatePickerProps = {
  value: Date;
  mode: "date" | "time";
  minimumDate?: Date;
  /** iOS：显示格式的 locale（跟随 App 语言，见 `@/i18n` 的 `pickerFormat`） */
  locale?: string;
  /** Android：12/24 小时制。iOS 由 locale 决定，忽略本参数 */
  is24Hour?: boolean;
  accentColor?: string;
  testID?: string;
  onValueChange: (date: Date) => void;
};

/** web / 兜底：社区组件（各平台实现一致的那一层） */
export function NativeDatePicker({
  value,
  mode,
  minimumDate,
  is24Hour,
  accentColor,
  testID,
  onValueChange,
}: NativeDatePickerProps) {
  return (
    <DateTimePicker
      value={value}
      mode={mode}
      display="compact"
      minimumDate={minimumDate}
      is24Hour={is24Hour}
      accentColor={accentColor}
      testID={testID}
      onValueChange={(_, date) => {
        onValueChange(date);
      }}
    />
  );
}
