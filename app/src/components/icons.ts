/**
 * `expo-symbols` `<SymbolView>` 用的双平台名字典。
 *
 * Android 是 Material Symbols 的**字形名**（expo-symbols 内置 symbols.json 的 key），
 * 不是 @expo/material-symbols 的矢量图资源 —— SymbolView 在 Android 上用 font glyph
 * 渲染，不走矢量图路径。语义键按「角色」命名，一个角色对应一个键。
 *
 * 历史：早先还有一份 `ICONS`（`@expo/ui` 的 `Icon` + `Icon.select`），给活在 Host 里的
 * 图标用。孪生铝箔岛迁纯 RN（twin-foil.tsx）后它零引用，2026-10-16 整份删除 ——
 * 现在图标统一走 `SymbolIcon` + 本字典，工具栏图标例外（`toolbar-icons.{ts,android.ts}`，
 * `Stack.Toolbar` 只认 SF Symbol / 图片源）。
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
  // 泡罩坑里的「历史消耗」标记（twin-foil.tsx 的 SlotMark）
  minusSlot: { ios: "minus", android: "remove" },
  // 设置页分组行（design/settings.html 的 .setting-icon）
  settingsLanguage: { ios: "globe", android: "language" },
  settingsNotification: { ios: "bell.fill", android: "notifications" },
  settingsSnooze: { ios: "alarm.fill", android: "alarm" },
  settingsQuiet: { ios: "moon.fill", android: "bedtime" },
  settingsSound: { ios: "speaker.wave.2.fill", android: "volume_up" },
  settingsMissed: { ios: "exclamationmark.triangle.fill", android: "warning" },
  settingsExport: { ios: "square.and.arrow.down", android: "download" },
  settingsPrivacy: { ios: "checkmark.shield.fill", android: "verified_user" },
  settingsVersion: { ios: "info.circle.fill", android: "info" },
  // 行尾「可进入下一层」的箭头（design/settings.html 的 .setting-action）
  chevronRight: { ios: "chevron.right", android: "chevron_right" },
} as const;
