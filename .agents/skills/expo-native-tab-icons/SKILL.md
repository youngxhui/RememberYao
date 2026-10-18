---
name: expo-native-tab-icons
description: 在 Expo 项目里把 SVG 做成 NativeTabs 的 tab 栏图标，含「描边主题色 + 封闭区填淡色」的双色选中态。新增或替换 tab 图标、把某个 SVG 用于底部导航、改 src/constants/theme.ts 的 primary/canvas 后需要重栅图标时用这一份。涵盖为什么不能直接传 SVG、iOS 双色必须整颗烘进位图的硬约束、scripts/generate-tab-icons.js 的声明式用法，以及踩过的坑。
version: 1.0.0
---

# Expo NativeTabs 自定义图标（SVG → 位图）

RememberYao 的 tab 栏图标工作流。参考实现：`scripts/generate-tab-icons.js`（生成器）、
`src/components/app-tabs.tsx`（接线）、`assets/images/tab-icons/`（产物）。

## 先知道三条硬约束（决定了一切做法）

1. **tab 栏图标由原生渲染**：iOS `UITabBarItem` / Android `BottomNavigationView`，
   只收「SF Symbol 名 / 资源名 / 图片源」。不吃 SVG、不吃 React 元素、不吃
   `data:image/svg+xml` 的 uri。`<Svg>` 组件只能活在 RN 视图树里，tab 栏不在树里。
2. **Metro 会把 `.svg` 当 asset**（默认 `assetExts` 含 svg），所以
   `require("./icon.svg")` **能过编译**，但原生 `UIImage` / `ImageView` 解不了 SVG
   —— 图标静默变空白且不报错。这是本主题最大的坑。
3. **iOS 的 `UIImage` 只有两种渲染模式**：`template`（整图当单色掩码，tab 栏统一染色）
   和 `original`（保留图自身颜色）。而 react-native-screens 要求 `icon` 与
   `selectedIcon` **必须解析成同一种图标类型**，expo-router 在
   `NativeTabsView.ios.js` 里为此发 warning 并统一采用**未选中态**的模式。
   → 结论：想要「描边一个色 + 封闭区另一个色」的双色，只能整颗图标走 `original`，
   **颜色全部烘进 PNG，未选中态也必须烘**（不再跟随 tint）。

`NativeTabs.Trigger.Icon` 的合法组合与优先级：iOS `sf` > `xcasset` > `src`；
Android `drawable` > `md` > `src`。`src` 收 `ImageSourcePropType` 或
`{ default, selected }` 两态。

## 标准流程

1. **取 path 数据**：图标用 Hugeicons 风格（`viewBox="0 0 24 24"`、`stroke-width="1.5"`、
   `stroke-linecap/linejoin="round"`）。把 SVG 里所有 `<path d="...">` 的 `d` 取出，
   多个子路径用空格拼成一个字符串；`<circle cx cy r>` 用脚本里的 `circle()` 助手转成
   两段半圆弧的 path，不必手写。
2. **在 `scripts/generate-tab-icons.js` 的 `ICONS` 里加一项**：

   ```js
   medica: {
     // strokes：两个状态都要描的子路径（未选中态只画这些）
     strokes: [KIT_HANDLE_PATH, KIT_BOX_PATH, KIT_CROSS_PATH],
     // fill：只有选中态才填；rule: "evenodd" 把内部子路径挖成洞
     fill: { d: KIT_BOX_PATH },
   }
   ```

   - **开放路径不要填**（如提手、肩）：填充会把首尾隐式连成一条贴边的色带。
   - 挖洞（门、头）要把洞的子路径和外形并进**同一个** `<path>` 并开
     `fill-rule="evenodd"`，两个分开的 `<path>` 互相剪不掉。
3. **栅图**：`bun scripts/generate-tab-icons.js`（依赖 `rsvg-convert`，
   `brew install librsvg`）。产出每个图标 × {未选中, 选中亮, 选中暗} × {1x,2x,3x}
   共 9 个 PNG + 3 个 SVG 源，24/48/72px。
4. **接线**（`src/components/app-tabs.tsx`，四个 trigger 同构）：

   ```tsx
   const scheme = useColorScheme();   // 来自 @/hooks/use-color-scheme

   <NativeTabs.Trigger.Icon
     md="home"                        // 留给 Android：md 优先于 src
     src={{
       default: scheme === "dark"
         ? require("@/assets/images/tab-icons/home-dark.png")
         : require("@/assets/images/tab-icons/home.png"),
       selected: scheme === "dark"
         ? require("@/assets/images/tab-icons/home-selected-dark.png")
         : require("@/assets/images/tab-icons/home-selected.png"),
     }}
     renderingMode="original"         // 双色的前提；不写 iOS 默认保色但别依赖默认
   />
   ```

   `require` 的路径必须是字面量， Metro 不做动态解析 —— 别抽成模板字符串的 helper。
5. **`bun run check`**（typecheck + oxlint + oxfmt；新脚本第一次会被 oxfmt 排版）。
6. **真机看**：见下方验证清单。位图资产不需要重新 `expo run:*`，Metro 重载即可
   （图标不显示就重启一次 dev server 清缓存）。

## 配色旋钮（都在脚本里，改 theme.ts 后同步重跑）

| 常量 | 作用 |
| --- | --- |
| `TOKENS.light/dark.primary`、`.canvas` | 与 `src/constants/theme.ts` 对齐 |
| `FILL_RATIO` | 选中态封闭区填充浓度：primary 混进 canvas 的比例，现为 0.3 |
| `UNSELECTED_STROKE` | 未选中描边，按模式取「UIKit 给 SF Symbol 的颜色」：亮 `#8E8E93` / 暗 `#FFFFFF` |

改 `primary` / `canvas` 后**必须重跑脚本** —— 颜色是烘死的，不会自动跟主题。

## 踩过的坑

- **未选中态漏描子路径**：曾经在「无填充就只输出填充路径」的分支里，导致未选中的
  房子丢了门。现在 `strokes` 是两个状态都描的完整列表，`fill` 只额外决定选中态填什么。
- **白线条预览看着是空的**：白描边 + 透明底，在浅色背景下看不见。验证几何别靠看图，
  `diff light.svg dark.svg` 只应有 `stroke` 一个属性差异即可。
- **双色只有 iOS 有**：Android 上 `md` 优先于 `src`；就算去掉 `md` 只用位图，那里的
  图片图标默认被 tint 压成单色，而 `tinting: "original"` 这个开关 expo-router 没透出
  （底层 react-native-screens 4.29 有）。要么 Android 继续用 Material Symbol，
  要么接受 Android 单色。
- **`xcasset` 是过渡 API**：react-native-screens v5（PR #4868，main only / breaking）
  会删掉 `templateSource` 与 `xcasset`，`imageSource` 默认改为自动 tint。别往 asset
  catalog 方向投入。
- **iOS 26 的 tab 栏由系统绘制**，`backgroundColor` 无效；选中态的药丸是系统给的，
  图标自带的填充浓度要跟它一起看。

## 什么时候别用这套

- 图标在 SF Symbol / Material Symbol 里找得到 → 直接 `sf` + `md`，零成本、系统着色、
  暗色与选中态全自动，也不违反 AGENTS.md 硬规则 12。
- 非要真矢量：iOS 走 asset catalog 的 custom symbol（按 Apple 模板 authored 的 SVG，
  `<Icon xcasset="..." />`），代价是要往 `ios/` 塞 `.symbolset` 并挂进 pbxproj 的
  config plugin，且撞上 v5 迁移；Android 走 `drawable="ic_x"`（VectorDrawable，
  默认被 tint），代价是要往 `android/app/src/main/res/drawable/` 塞 XML 的 config plugin。

## 真机验证清单

- [ ] 选中 / 未选中两态都在（含暗色档），描边粗细一致
- [ ] 未选中灰度与设计基准齐平（现在四个 tab 全是位图，`UNSELECTED_STROKE` 就是全部观感）
- [ ] 封闭区填充浓度合适（调 `FILL_RATIO`）
- [ ] 挖的洞确实露出后面的 tab 栏底色，没有被填充糊住
- [ ] 切系统明暗模式时图标跟着翻面（`useColorScheme` 那两套）
- [ ] 选中态的 label 仍是 primary（选中感不止靠图标）
