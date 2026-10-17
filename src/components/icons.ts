/**
 * `expo-symbols` `<SymbolView>` 用的双平台名字典。
 *
 * Android 是 Material Symbols 的**字形名**（expo-symbols 内置 symbols.json 的 key），
 * 不是 @expo/material-symbols 的矢量图资源 —— SymbolView 在 Android 上用 font glyph
 * 渲染，不走矢量图路径。语义键按「角色」命名，一个角色对应一个键。
 *
 * 历史：早先还有一份 `ICONS`（`@expo/ui` 的 `Icon` + `Icon.select`），给活在 Host 里的
 * 图标用。孪生铝箔岛迁纯 RN（twin-foil.tsx）后它零引用，2026-10-16 整份删除 ——
 * 现在内容树图标走 `SymbolIcon` + 本字典，例外两处：工具栏图标
 * （`toolbar-icons.{ts,android.ts}`，`Stack.Toolbar` 只认 SF Symbol / 图片源）；
 * 设置页分组行与行尾箭头（`src/screens/profile/huge-icon.tsx` 的 Hugeicons SVG，
 * 2026-10-17 换过去，理由见那个文件的头注释）。
 */
export const SYMBOL_ICONS = {
  stockWarning: { ios: "exclamationmark.triangle.fill", android: "warning" },
  checkCircle: { ios: "checkmark.circle", android: "check_circle" },
  alarmRail: { ios: "alarm", android: "alarm" },
  xmarkCircle: { ios: "xmark.circle", android: "cancel" },
  pillsRail: { ios: "pills.fill", android: "medication" },
  // 详情页基础信息的行首图标（detail.tsx 的 FieldRow）
  categoryTag: { ios: "tag.fill", android: "sell" },
  specRuler: { ios: "ruler.fill", android: "straighten" },
  prescriptionDoc: { ios: "doc.text.fill", android: "description" },
  calendar: { ios: "calendar", android: "calendar_month" },
  // 详情页库存摘要组的行首图标（detail.tsx 的 StockSummaryCard）
  stockBox: { ios: "archivebox.fill", android: "inventory" },
  dailyBolt: { ios: "bolt.fill", android: "bolt" },
  daysClock: { ios: "clock.fill", android: "schedule" },
  chevronDownRail: { ios: "chevron.down", android: "keyboard_arrow_down" },
  check: { ios: "checkmark", android: "check" },
  xmark: { ios: "xmark", android: "close" },
  // 泡罩坑里的「历史消耗」标记（twin-foil.tsx 的 SlotMark）
  minusSlot: { ios: "minus", android: "remove" },
  // 引导页两枚大图标（onboarding.tsx）
  onboardingBrand: { ios: "capsule.fill", android: "medication" },
  onboardingIntro: { ios: "cross.case.fill", android: "emergency" },
} as const;
