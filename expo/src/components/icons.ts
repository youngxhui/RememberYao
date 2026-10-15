import { Icon, type IconName } from "@expo/ui";

/**
 * 语义图标键：一个「角色」对应一个键，两端取值相同。
 *
 * iOS 取 SF Symbol 字符串，Android 取 @expo/material-symbols 矢量图资源。
 * babel-preset-expo 自带的 @expo/ui/babel-plugin 会把 import('*.xml')
 * 改成 require('*.xml') 并按平台 DCE 掉另一端。
 */
export type IconKey =
  // 药品 / 库存
  | "pills"
  | "stockOk"
  | "stockLow"
  | "stockCritical"
  | "stockUnset"
  // 通用
  | "bookmark"
  | "stack"
  | "chevronRight"
  | "minus"
  | "clock"
  | "persons"
  | "check"
  | "xmark"
  | "minusSlot"
  | "globe"
  | "bell"
  | "alarm"
  | "moon"
  | "speaker"
  | "download"
  | "shield"
  | "info"
  | "chevronDown"
  | "person"
  | "bellSlash"
  | "medkit"
  | "calendar"
  | "plus";

/**
 * @expo/ui `<Icon>` 用的平台图标：iOS = SF Symbol，Android = @expo/material-symbols 矢量图。
 * 直接传给 `<Icon name={...} />` 即可，无需再包一层 select。
 */
export const ICONS = {
  pills: Icon.select({
    ios: "pills.fill",
    android: import("@expo/material-symbols/medication.xml"),
  }),
  stockOk: Icon.select({
    ios: "checkmark.circle.fill",
    android: import("@expo/material-symbols/check_circle.xml"),
  }),
  stockLow: Icon.select({
    ios: "exclamationmark.triangle.fill",
    android: import("@expo/material-symbols/warning.xml"),
  }),
  stockCritical: Icon.select({
    ios: "exclamationmark.octagon.fill",
    android: import("@expo/material-symbols/error.xml"),
  }),
  stockUnset: Icon.select({
    ios: "minus.circle.fill",
    android: import("@expo/material-symbols/do_not_disturb_on.xml"),
  }),
  bookmark: Icon.select({
    ios: "bookmark",
    android: import("@expo/material-symbols/bookmark.xml"),
  }),
  stack: Icon.select({
    ios: "square.stack.3d.up.fill",
    android: import("@expo/material-symbols/layers.xml"),
  }),
  chevronRight: Icon.select({
    ios: "chevron.right",
    android: import("@expo/material-symbols/chevron_right.xml"),
  }),
  minus: Icon.select({
    ios: "minus.circle",
    android: import("@expo/material-symbols/do_not_disturb_on.xml"),
  }),
  clock: Icon.select({
    ios: "clock.fill",
    android: import("@expo/material-symbols/schedule.xml"),
  }),
  persons: Icon.select({
    ios: "person.2.fill",
    android: import("@expo/material-symbols/group.xml"),
  }),
  check: Icon.select({
    ios: "checkmark",
    android: import("@expo/material-symbols/check.xml"),
  }),
  xmark: Icon.select({
    ios: "xmark",
    android: import("@expo/material-symbols/close.xml"),
  }),
  minusSlot: Icon.select({
    ios: "minus",
    android: import("@expo/material-symbols/remove.xml"),
  }),
  globe: Icon.select({
    ios: "globe",
    android: import("@expo/material-symbols/language.xml"),
  }),
  bell: Icon.select({
    ios: "bell.fill",
    android: import("@expo/material-symbols/notifications.xml"),
  }),
  alarm: Icon.select({
    ios: "alarm.fill",
    android: import("@expo/material-symbols/alarm.xml"),
  }),
  moon: Icon.select({
    ios: "moon.fill",
    android: import("@expo/material-symbols/bedtime.xml"),
  }),
  speaker: Icon.select({
    ios: "speaker.wave.2.fill",
    android: import("@expo/material-symbols/volume_up.xml"),
  }),
  download: Icon.select({
    ios: "square.and.arrow.down",
    android: import("@expo/material-symbols/download.xml"),
  }),
  shield: Icon.select({
    ios: "checkmark.shield.fill",
    android: import("@expo/material-symbols/verified_user.xml"),
  }),
  info: Icon.select({
    ios: "info.circle.fill",
    android: import("@expo/material-symbols/info.xml"),
  }),
  chevronDown: Icon.select({
    ios: "chevron.down",
    android: import("@expo/material-symbols/keyboard_arrow_down.xml"),
  }),
  person: Icon.select({
    ios: "person",
    android: import("@expo/material-symbols/person.xml"),
  }),
  bellSlash: Icon.select({
    ios: "bell.slash.fill",
    android: import("@expo/material-symbols/notifications_off.xml"),
  }),
  medkit: Icon.select({
    ios: "cross.case.fill",
    android: import("@expo/material-symbols/medical_information.xml"),
  }),
  calendar: Icon.select({
    ios: "calendar",
    android: import("@expo/material-symbols/calendar_month.xml"),
  }),
  plus: Icon.select({
    ios: "plus",
    android: import("@expo/material-symbols/add.xml"),
  }),
} as const satisfies Record<IconKey, IconName>;

/**
 * expo-symbols `<SymbolView>` 用的双平台名字典。
 * Android 是 Material Symbols 的**字形名**（expo-symbols 内置 symbols.json 的 key），
 * 不是 @expo/material-symbols 的矢量图资源——SymbolView 在 Android 上用 font glyph 渲染。
 */
export const SYMBOL_ICONS = {
  stockWarning: { ios: "exclamationmark.triangle.fill", android: "warning" },
  checkCircle: { ios: "checkmark.circle", android: "check_circle" },
  alarmRail: { ios: "alarm", android: "alarm" },
  xmarkCircle: { ios: "xmark.circle", android: "cancel" },
  pillsRail: { ios: "pills.fill", android: "medication" },
  chevronDownRail: { ios: "chevron.down", android: "keyboard_arrow_down" },
  check: { ios: "checkmark", android: "check" },
  xmark: { ios: "xmark", android: "close" },
} as const;
