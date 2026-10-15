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
 * 三端的**交互语义**因此也各自实现：iOS 是 compact 胶囊（点它弹轮盘）；
 * Android 的社区组件默认 `presentation="dialog"` 且**挂载即弹**，所以那边改成
 * 「灰底胶囊 + 点一下才挂载对话框」（见 `native-date-picker.android.tsx`）；
 * web 走 `display="compact"`。
 *
 * props 三个变体必须完全一致（AGENTS.md：平台文件的 API 不许漂移）。
 */
export type NativeDatePickerProps = {
  value: Date;
  mode: "date" | "time";
  minimumDate?: Date;
  /** 显示格式的 locale（跟随 App 语言，见 `@/i18n` 的 `pickerFormat`）。
   *  iOS 由原生 `DatePicker` 消费；Android 用来格式化胶囊上显示的值 */
  locale?: string;
  /** Android：12/24 小时制（原生选择器与胶囊文案共用）。iOS 由 locale 决定，忽略本参数 */
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
