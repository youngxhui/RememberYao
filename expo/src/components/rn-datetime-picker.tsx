import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Text } from "react-native";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

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
  const theme = useTheme();
  const [open, setOpen] = useState(false);

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
      <Text
        testID={testID}
        onPress={() => {
          setOpen(true);
        }}
        style={{
          backgroundColor: theme.backgroundElement,
          borderRadius: Radius.pill,
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.two,
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
          onChange={handleChange}
          {...pickerOptions}
        />
      ) : null}
    </>
  );
}

/** 胶囊上显示的当前值：格式跟 App 语言走，不跟系统 locale */
function formatValue(
  value: Date,
  mode: "date" | "time",
  locale?: string,
  is24Hour?: boolean,
) {
  if (mode === "time") {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: is24Hour === undefined ? undefined : !is24Hour,
    }).format(value);
  }
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}
