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
 * **两端不同构，这是有意的**：
 *
 * - iOS：`display="compact"` 自己就是「当前值 + 点击弹出」的一颗原生胶囊，直接渲染。
 *   早期在它外面还套过一颗自己的灰底胶囊，结果是屏幕上出现两颗日期（eccc425 的修复
 *   动机），所以 iOS 不套触发器，testID 直接落在原生控件上。
 * - Android / web：社区组件默认 `presentation="dialog"`，而 Material 3 的
 *   `TimePickerDialog` / `DatePickerDialog` 整个 content 就是一个 AlertDialog
 *   （`expo-ui` 的 `DatePickerView.kt`）—— **挂载即弹**。所以这里先画一颗灰底胶囊
 *   显示当前值，**点一下才挂载对话框**，选完（`onValueChange`）或取消（`onDismiss`）
 *   立即卸载。直接渲染进表单等于进页面就弹系统对话框（快速添加第二步一进来「吃药时间」
 *   扑面而来，plan-form 把每日次数从 1 调到 3 还会连弹三层）。
 *
 * ⚠️ 这两条都靠真机行为验证，不要为了「两端一致」把 iOS 也包上触发器或把 Android 的
 * 门拆掉。
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

  if (Platform.OS === "ios") {
    return (
      <DateTimePicker
        testID={testID}
        value={value}
        onChange={handleChange}
        {...pickerOptions}
      />
    );
  }

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
