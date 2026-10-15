import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform } from "react-native";

export type RnDateTimePickerProps = {
  value: Date;
  mode?: "date" | "time";
  minimumDate?: Date;
  locale?: string;
  is24Hour?: boolean;
  accentColor?: string;
  testID?: string;
  onValueChange: (date: Date) => void;
};

/**
 * RN 版日期/时间选择器：底层用 @react-native-community/datetimepicker。
 *
 * Android 保持「灰底胶囊 + 点一下才挂载对话框」的既有交互：
 * 社区组件在 Android 上默认 presentation="dialog"，挂载即弹，所以这里先画
 * 一颗胶囊，点按后才挂载 DateTimePicker，选完/取消立即卸载。
 *
 * iOS 走 compact 样式（与系统 Picker 的胶囊外观一致），web 走 spinner。
 */
export function RnDateTimePicker({
  value,
  mode = "date",
  minimumDate,
  locale,
  is24Hour,
  accentColor,
  testID,
  onValueChange,
}: RnDateTimePickerProps) {
  const [_, setOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android" && event.type === "dismissed") {
      setOpen(false);
      return;
    }
    if (date) {
      onValueChange(date);
    }
    if (Platform.OS === "android") {
      setOpen(false);
    }
  };

  const pickerOptions = {
    mode,
    minimumDate,
    is24Hour: is24Hour ?? (locale === "en" ? false : undefined),
    accentColor,
    ...(Platform.OS === "ios"
      ? { display: "compact" as const }
      : Platform.OS === "android"
        ? { display: "default" as const }
        : { display: "spinner" as const }),
  };

  return (
    <>
      <DateTimePicker
        testID={testID}
        value={value}
        onChange={handleChange}
        {...pickerOptions}
      />
      )
    </>
  );
}
