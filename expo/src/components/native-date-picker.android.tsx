import { DateTimePicker } from "@expo/ui/community/datetime-picker";

import type { NativeDatePickerProps } from "./native-date-picker";

/**
 * Android：继续用社区的 `DateTimePicker`（Compose 选择器）。
 *
 * 与 web 兜底实现的差别只有一处：社区的 Android 实现默认 `presentation="dialog"`
 * （点一下弹系统对话框），这里显式保持默认，不引入 iOS 那套 compact 语义 ——
 * Material 3 没有对应的行内胶囊。
 */
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
