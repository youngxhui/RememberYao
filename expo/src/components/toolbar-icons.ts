/**
 * 工具栏图标的跨平台取值：iOS 是 SF Symbol 名，Android 是 Material Symbols 的
 * 矢量图资源（见 `toolbar-icons.android.ts` 的同名导出）。
 *
 * 为什么值得单独拆平台文件：`Stack.Toolbar.Button` / `Stack.Toolbar.Menu` 的
 * `icon` prop 只接受「SF Symbol 字符串 或 图片源」这一种联合类型，没有
 * `Icon.select` 那样的 ios/android 双槽；而只给 SF Symbol 时 Android 端取不到
 * 图标，整颗按钮直接不渲染（`@expo/ui` 的 `Icon` 反而有 `Icon.select`）。
 * 所以按平台各给一份值，调用处写法不变。
 *
 * 新增工具栏图标时两边都要加同名导出：iOS 写 SF Symbol（`as const` 收窄成
 * 字面量，拼错会被 tsc 拦），Android 写 `@expo/material-symbols` 的矢量图
 * （Metro 把 `.xml` 当资源处理，值是资源 id）。
 */

// `as const`：类型收窄成字面量，赋给 `icon` 时才过得了他家 SFSymbol 联合类型的检查
export const memberFilterIcon = "person.2.fill" as const;
export const addIcon = "plus" as const;
export const settingsIcon = "gearshape" as const;
export const editIcon = "square.and.pencil" as const;
