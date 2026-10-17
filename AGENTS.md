# RememberYao — Agent 指南

家庭用药提醒 App：记录家里每个人的用药配置，到点本地通知提醒，服用后自动扣减库存。
`CLAUDE.md` 仅引用本文件，所有约定以本文件为准。

## 文档地图

本文件只放**硬规则**（必须 / 禁止）。理由、示例、自查方法在：

| 文件 | 内容 |
| --- | --- |
| [docs/conventions/code-style.md](docs/conventions/code-style.md) | oxlint/oxfmt 工具链、TypeScript、命名、导入顺序、库选择偏好、样式写法 |
| [docs/conventions/ui-design.md](docs/conventions/ui-design.md) | 选型阶梯（内容树纯 RN / chrome / 玻璃 / sheet）、主题 token、组件契约、native slop |
| [docs/conventions/expo-ui-layout.md](docs/conventions/expo-ui-layout.md) | 历史存档：`@expo/ui` 与 RN 混用时的布局边界与踩过的坑（该包已移除，读它只为不重犯） |
| [docs/conventions/routing-structure.md](docs/conventions/routing-structure.md) | `src/app` 规则、`_layout.tsx`、Stack/Link/NativeTabs、目录归属 |
| [docs/conventions/data-state.md](docs/conventions/data-state.md) | store.ts 单点持久化、按屏幕的查询 Hook、纯函数、日期字符串、提醒状态机、通知同步、Maestro |
| [docs/conventions/database.md](docs/conventions/database.md) | `src/db` 表结构、版本重建、按实体按需读写与事务、查询 Hook |
| [docs/conventions/i18n.md](docs/conventions/i18n.md) | `src/i18n` 运行时、`t()` 类型安全、词条维护、通知文案重注册 |

写代码前先读**精确版本**的 Expo 文档：https://docs.expo.dev/versions/v58.0.0/
任意文档 URL 后加 `.md` 可取 Markdown 版，完整目录见 https://docs.expo.dev/llms.txt。

本项目已安装 `.agents/skills/`（Claude 同步在 `.claude/skills/`）下的 Expo 官方 skills，涉及对应主题时优先加载，而不是凭记忆猜 API：
`expo-overview`（入口）、`expo-router`、`expo-animation`、`expo-project-structure`、`expo-design-system`、`expo-data-fetching`、`expo-module`、`expo-upgrade`、`eas-*`。（`expo-ui` / `expo-native-ui` 两个 skill 对应已移除的 `@expo/ui`，不再加载。）

## 技术栈

| | |
| --- | --- |
| Expo SDK | 58（`^58.0.0-preview.4`，预览版，API 与稳定版有差异） |
| React Native | `0.88.0-rc.1` / React `19.3.0` |
| 路由 | `expo-router` ~58，文件式路由，根目录 `src/app` |
| UI | 内容树纯 RN（`View`/`Text`/`Pressable`/`FlatList` + `useTheme()`）+ `ScreenScaffold`；内容玻璃走 `GlassChip` / `GlassHostButton`（`expo-glass-effect`）；图标走 `SymbolIcon`（`expo-symbols`；设置页例外走 Hugeicons SVG + `react-native-svg`，见 [ui-design.md](docs/conventions/ui-design.md) 图标小节）；sheet 用 `@lodev09/react-native-true-sheet`。**`@expo/ui` 已于 2026-10-16 从项目移除**（迁移计划 §6.9），见硬规则 1 |
| Lint / 格式 | **oxlint 1.85 + oxfmt 0.70**（Rust 实现，不用 ESLint/Prettier） |
| 数据 | `expo-sqlite` + `drizzle-orm`（本地 SQLite），`src/lib/store.ts` 单点持久化 |
| 头像照片 | `expo-image-picker` + `expo-image-manipulator` + `expo-file-system`（选图 → 裁方缩放 → 存沙盒） |
| 通知 | `expo-notifications`（本地调度 + 通知栏操作按钮） |
| 多语言 | `expo-localization` + 自建 `src/i18n`（zh/en 运行时切换，`t()` 路径类型安全） |
| 语言 | TypeScript strict，实验特性 `typedRoutes` + `reactCompiler` 已开启 |
| 测试 | Maestro（`maestro/*.yaml`），暂无单元测试 |
| 原生目录 | `ios/` + `android/`（prebuild 产物；Android 侧从未在设备上跑过） |

路径别名：`@/*` → `./src/*`，`@/assets/*` → `./assets/*`。

## 命令

```bash
npx expo start              # 开发服务器
npx expo run:ios            # 构建并运行到 iOS 模拟器/真机
npx expo run:android        # 构建并运行到 Android
bun run check               # typecheck + lint + format:check，提交前必过
bun run lint / lint:fix     # oxlint
bun run format / format:check
maestro test maestro/dashboard.yaml     # 首页（今日）冒烟：引导页 → 空态 → tab 往返
```

**必须使用 development build**（`expo run:ios` / `run:android`），Expo Go 跑不起来 —— 依赖 `expo-notifications`、`expo-widgets` 等原生模块。新增任何原生依赖后都要重新 prebuild + 构建。

包管理器：**bun**（`bun.lock` 是唯一权威 lockfile）。残留的 `pnpm-lock.yaml` / `package-lock.json` 已删除，装依赖只用 bun，不要新增/更新其他 lockfile。

## 硬规则

### UI

1. **内容树默认纯 RN**（`View`/`Text`/`Pressable`/`ScrollView`/`FlatList` + `useTheme()` + `ScreenScaffold`），**不要再写整屏 `Host`+`Column`+`ScrollView`** —— 2026-10 迁移已完成，全部生产屏都是纯 RN（见 `docs/plans/迁移计划.md`）。系统 chrome（`NativeTabs` / `Stack.Title` / `Toolbar` / `SearchBar`）不动。内容玻璃走 `@/components/glass-chip`（`GlassChip` / `GlassChipRow`）与 `@/components/glass-host-button` 的 `GlassHostButton`（都基于 `expo-glass-effect`；`ContentGlass` 是 `expo-liquid-glass-view` 的封装，目前只有 playground 在渲染），**屏幕禁止直接 import `expo-liquid-glass-view` / `expo-glass-effect`**。sheet 一律用 `@lodev09/react-native-true-sheet`（2026-10 决策：真原生 sheet —— iOS `UISheetPresentationController` / Android `ModalBottomSheet`，视觉=系统；`@expo/ui` 的 `BottomSheet` 已弃用，它必须做 `FieldGroup` 子节点，社区替代品 `@expo/ui/community/bottom-sheet` 的 default export 是挂载即打开的 `BottomSheet` 易踩坑，`@gorhom/bottom-sheet` 是 JS 渲染视觉对不齐系统）。**不要在 RN 树里手写 `Host`** —— `ExpoUiIsland`（RN 树挂 `@expo/ui` 原生控件的边界封装）已随菜单 `Picker` 清零而删除；真需要原生控件时优先想有没有 RN 替代，确实绕不过再新建最小 `Host` 岛并写清理由。`@expo/ui` 在生产屏只剩两处合法残留：`onboarding.tsx` 的整屏 `TabView` pager（第 4 批「可选」，默认不迁）、孪生铝箔岛的 `nativeGradientBackground`（Q2 冻结）。**菜单 `Picker` 也已清掉** —— 它的 `appearance` 默认就是 `menu`（iOS 原生 Menu 胶囊，不吃 RN `style` 还必须住 `Host`），twin / plan-form / settings 的 5 处已全部换成 `@/components/rn-picker` 的 `RnPicker`（灰底胶囊触发器 + TrueSheet 选项列表）。日期选择：全部走 `@/components/rn-datetime-picker`（Expo UI 版 `native-date-picker*` 三件套已删）。
2. **平台隔离**：需要平台专属实现时放进 `.ios.tsx` / `.android.tsx`（放 `src/components/`，**不能放 `app/`**），或用 `process.env.EXPO_OS` 守卫。剩下的平台差异集中在三处：`toolbar-icons.{ts,android.ts}`（`Stack.Toolbar` 只认 SF Symbol / 图片源）、`symbol-icon.tsx`（`SymbolView` 双平台名字典）、`rn-datetime-picker.tsx`（iOS compact / Android 点按才弹对话框）。

   > 历史：`@expo/ui`（SwiftUI / Jetpack Compose 原生组件）曾是主力 UI 层，2026-10-16 全部迁走后从 `package.json` 移除。它的坑记录在 [ui-design.md](docs/conventions/ui-design.md) 与迁移计划里，**不要再引回来**。
3. **不要在 RN 内容树里写 `Host`**。`@expo/ui` 移除后生产代码已无 `Host`；`ExpoUiIsland`（RN 树挂原生控件的边界封装）也已删除（迁移计划 §6.8）。确实绕不过时新建最小岛，并写清「为什么 RN 做不到」。
4. 必须在 Expo UI 树里用 RN 视图时，用 `RNHostView` 包裹。**内容树已无此需求**（残留岛内的 RN 视图仍走它，如孪生格子的 `RNHostView` 历史写法已清）。
5. **从 `react-native` 导入的 UI 组件一律加 `RN` 前缀**：
   ```ts
   import { Text as RNText, View as RNView } from "react-native";
   ```
   非 UI 的 API（`Platform`、`AppState`、`Linking`、`useColorScheme`）不加前缀。
   **`@expo/ui` 移除后这条规则实际上已失效** —— 项目里不再有第二套 `Text`，所以两种写法都合法：既有屏混用（`screens/home` 直接 `View`/`Text`，`components/avatar.tsx` 仍是 `RNView` 前缀），新代码随便写，但**同一个文件内保持一致**。
6. **不要硬编码颜色、字号、间距**。一律走 `useTheme()` → `src/constants/theme.ts`。语义色：`primary` / `success`（已服）/ `warning`（即将到期）/ `danger`（漏服）；间距用 `Spacing`；底部 tab 遮挡用 `BottomTabInset`。
7. ~~**`useNativeState` 只能用 `.value`**~~ —— `@expo/ui` 移除后全仓零调用，此规则作废。表单状态一律 RN `useState`。
8. 图标禁止用 emoji。iOS 用 SF Symbol，Android 用 Material icon；`NativeTabs` 的图标必须同时给 `sf` 和 `md`。
9. 圆角配 `borderCurve: "continuous"`；阴影用 `boxShadow`，禁止 legacy `shadow*` / `elevation`。
10. 长列表用 `FlatList` / `FlashList`；短小固定的分组用 `SectionCard` / `SectionTitle` / `HairLine` 自己拼。⚠️ **任何「自己就是滚动容器」的原生组件都不要嵌进外层 `ScrollView`** —— 当年 `@expo/ui` 的 `FieldGroup`（SwiftUI `Form`）与 `List`（SwiftUI `List`）就这么塌成零高、区块内容直接消失（真机 bug，勿再犯）。该包已移除，这条坑留给以后新引的原生容器。

### 路由与结构

11. `src/app/` 下**只放路由**，禁止 colocate 组件、类型、工具函数。
12. 每个 stack 用 `_layout.tsx` 定义，`Stack` 从 `expo-router/stack` 导入。Tab 用 `expo-router/native-tabs` 的 `NativeTabs`（**不要**用 `unstable-native-tabs`），配置集中在 `src/components/app-tabs.tsx`。**生产环境的 tab 数量以 `design/` 设计稿为准**（当前 3 个：首页 / 药品 / 我的），调试页用 `__DEV__` 包 `Trigger`。**(tabs) 组里没声明 `Trigger` 的目录不会显示成 tab，但也会被 `router.replace` 弹回初始 tab** —— 想保留路由就得移出组外。详见 [routing-structure.md](docs/conventions/routing-structure.md#tab-导航)。
13. 标题一律 `Stack.Title`，不要在页面里自己写大标题。搜索用 `Stack.SearchBar`。
14. 跳转用 `<Link href>`；尽量配 `<Link.Preview>` 和 `<Link.Menu>`。模态用 `presentation` 选项，不要自己写 modal 组件。
15. **禁止直接 import `@react-navigation/*`**，用 `expo-router/react-navigation`（oxlint 已拦截）。
16. 路由文件**必须 kebab-case**，禁止特殊字符；移动/重命名后删掉旧文件。
17. `typedRoutes` 已开启，路由字符串由 TS 校验，不要用 `as any` 绕过。
18. 新组件放 `src/components/`（kebab-case）。只在单个屏幕用的大块 UI 先 colocate 在 `src/screens/<name>/`，满足"两个屏幕复用 + 有可命名的角色 + API 小于实现"才提升到 `src/components/`。**不要**为了对齐官方结构重构现有屏幕。

### 数据层

19. **屏幕永远不直接碰 SQLite**。所有状态和持久化集中在 `src/lib/store.ts`（编排）与 `src/db/repo.ts`（读写）。
20. 读取用按屏幕的查询 Hook（`useMedications` / `useRemindersForDate` / `useMedication(id)` …），屏幕在 `useFocusEffect` 里调 `reload()`。**不要图省事拉全集**：这一屏要什么读什么。
21. **日期/时间用字符串**：日期 `YYYY-MM-DD`，时间 `HH:MM`，时间戳 ISO。比较时间用 `localeCompare`，**不要引入日期库**。
22. `MedicationUsage` 的 `personName` / `medicationName` / `time` 是**快照**，删除药品或用药人不清除历史。新增字段保持这个不可变性。
23. **任何写操作后必须经 `setPostMutationHook` 触发 `syncNotificationsWithStore()` 重排通知**，不要绕过。
24. 提醒状态机 `pending → taken / skipped / missed`；**超过 1 小时宽限期**未处理才判 `missed`，漏服可补服（`late: true`）。
25. `entities.ts` 与 store 里的提醒生成、库存扣减、状态迁移是**纯函数**，新逻辑保持纯函数形态。
26. **持久化只走 `src/db` 仓储层**：按实体 / 按查询的 granular 函数（`getReminder` / `listPacksForMedication` / `updateReminder` …），SQL 与列名不出现在 `src/db` 以外；行 ↔ 实体映射也收敛在 `repo.ts`。**多表写入必须包在 `withTransaction` 里**（一个操作一个事务，失败整体回滚）。改表结构要同时改 `src/db/schema.ts`、`client.ts` 的 `CREATE_TABLES` 并 `SCHEMA_VERSION` +1（版本不符会删库重建；另外开库时还会逐表比对 schema.ts 的列名，缺列同样重建 —— 防的是「版本号改了但 CREATE_TABLES 没改」导致写库撞 `no such column`）。详见 [database.md](docs/conventions/database.md)。

### 多语言

27. **禁止在屏幕/组件里写死 UI 文案**，一律 `useTranslation()` 的 `t("分组.键")`。注释里的中文不算文案。
28. **禁止直接 import 词典文件**，只用 `@/i18n` 的 `useTranslation` / `useI18n`（组件）或 `getTranslator`（通知层等 React 之外）。
29. **加词条必须 zh + en 同时加**，键路径一致。**不能给 `zh.ts` 加 `: TranslationTree` 注解** —— 会把字面量类型拓宽成索引签名，`Path` 退化成 `never`，全仓库 `t()` 一起报错。
30. **通知栏文案在语言切换后必须重注册**（`registerLocalizedNotificationTexts()`），否则按钮标题停留在旧语言。
31. **日期/星期走 `Intl`**，不要硬编码语序（中文「9月5日」vs 英文「Sep 5」）。详见 [i18n.md](docs/conventions/i18n.md)。

### 代码

32. 注释、UI 文案、提交信息用**中文**，标识符用英文。注释只解释「为什么」（业务规则、非显然约束），不复述代码。
33. 文件名 **kebab-case**；组件 PascalCase；hook `use` 前缀；常量 UPPER_SNAKE_CASE。
34. **优先用路径别名 `@/*`**，不要写相对路径。
35. **不要手工调整导入顺序** —— oxfmt 的 `sortImports` 负责，跑 `bun run format`。
36. 函数组件 + hooks，不用 class 组件。屏幕默认导出，共享组件具名导出。
37. 优先内联样式；同一段样式复用两次以上才提到文件底部的 `StyleSheet.create`。
38. 用左边不用右边：`process.env.EXPO_OS` 而非 `Platform.OS`；`React.use` 而非 `React.useContext`；`Color` from `expo-router` 而非裸 `PlatformColor`；`expo-symbols` 而非 `@expo/vector-icons`；`react-native-safe-area-context` 而非 RN `SafeAreaView`；`useWindowDimensions()` 而非 `Dimensions.get()`。
39. **禁止 RN 已移除的模块**：`Picker`、`WebView`、`SafeAreaView`、`AsyncStorage`。oxlint 会拦截。
40. 安全区用 `contentInsetAdjustmentBehavior="automatic"`，不要用 `SafeAreaView`。`ScrollView` 的内边距写 `contentContainerStyle`。
41. 每个加载数据的屏幕要有 **loading / error / empty / content** 四态，**首屏加载没结束时不显示 empty 态**。
42. 可滚动表单加 `keyboardShouldPersistTaps="handled"`；表单主操作不能被键盘挡住。
43. **新增可交互控件（按钮、输入框、Picker、Switch、筛选 chip、可点列表行）必须加 `testID`**，格式 `<屏幕>-<角色后缀>` kebab-case，如 `medication-save-button`、`plan-dose-input`、`person-item-<id>`。文案会变的控件（二次确认删除、引导页下一步）尤其不能省。`@expo/ui` universal 组件都支持 `testID`（iOS → `accessibilityIdentifier`）；例外：`Stack.Toolbar.Button` 不支持，只能靠文案定位。详见 [data-state.md](docs/conventions/data-state.md#testid-命名规范)。
44. 提交前跑 `bun run check`（typecheck + lint + format:check）。当前基线为 0 errors / 0 warnings。
45. **不要主动进行 UI 自动化验证**：不启动模拟器 / 真机跑应用、不截图对比、不跑 Maestro 流来验证自己的改动。改动的正确性以 `bun run check` + 通读受影响代码为准，界面最终由开发者在真机 / 模拟器上亲自确认。Maestro 与 `expo run:*` 只在用户明确要求时才执行。

## 目录结构

```
src/
  app/                    # 只放路由
    _layout.tsx           ThemeProvider + 根 Stack（index / (tabs) / onboarding / records / playground）+ 通知初始化/同步
    index.tsx             分流：未看过引导页 → onboarding，否则 → 首页
    onboarding.tsx        首次启动引导页：放在 tab 组之外，全屏无 tab 栏
    records.tsx           服药记录：按日期查历史与当日服药率（界面待完善）；不占 tab 位，路径仍是 /records
    playground/           调试屏：tab 组之外，无 tab 入口，从代码 push /playground
    (tabs)/
      _layout.tsx         AppTabs（NativeTabs），trigger name 用组内相对路由名
      home/               今日：只有路由，实现见 src/screens/home（纯 RN）
      medica/             药品：index（只有路由）+ detail / form / twin
      profile/            我的：index（只有路由）+ persons / person-detail / plan-form / settings/（二级路由：index 三个入口 + general / notifications / about；目录下**没有 _layout.tsx**，见待办的 Stack 嵌套坑）
  screens/
    home/                 首页实现：index（纯 RN：大字日期 / 通知横幅 / 区块标题，成员筛选走系统工具栏右上角菜单）+ stock-panel（库存速览）
    medica/               药品库实现：index（纯 RN：FlatList + 分类筛选）+ filter-row（分类 chip 横滑）+ twin（外壳纯 RN，铝箔网格留 Expo UI 岛）
    profile/              我的实现：index（档案横排 / 本周概览 / 家庭成员 / 菜单）+ settings/（纯 RN：index 三个分区入口 + general / notifications / about 三个二级屏，共享 setting-row 与 huge-icon，见 design/settings.html）
  db/
    schema.ts             Drizzle 表定义（snake_case 列名、索引）
    client.ts             开库 + 版本不符即整库重建
    repo.ts               仓储层：按实体 / 按查询的 granular 读写 + withTransaction，行 ↔ 实体映射
  i18n/
    provider.tsx          I18nProvider + useTranslation / useI18n / getTranslator
    languages.ts          Language 类型、设备语言归一、字典 lookup
    dictionaries/         zh.ts（基准）/ en.ts，键必须一一对应
  lib/
    entities.ts           实体类型、常量与纯函数（日期 / 库存 / 孪生 / 统计）
    store.ts              数据层：写操作编排（读所需 → 纯函数决策 → 事务写差异）、
                          提醒同步、按屏幕的查询 Hook、通知调度数据；再导出 entities
    notifications.ts      通知层：权限、调度、操作按钮、响应处理、与 store 同步
    onboarding.ts         引导页"已看过"标记
    avatar-photo.ts       头像照片：选图 → 裁成正方形 → 缩到 256² → 存 document/avatars
  hooks/                  use-theme / use-color-scheme / use-onboarding-gate / use-medication-export
  components/             app-tabs、avatar、content-glass、glass-chip、glass-host-button、screen-scaffold、
                         rn-form / rn-input-shell / rn-section-card / rn-datetime-picker / rn-picker /
                         rn-round-icon-button、progress-bar、dose-timeline、reminder-card-stack、mini-archive、
                         symbol-icon、toolbar-icons(.android)、icons、observe-error-fallback、external-link
  screens/                每屏的实现（home / medica[含 twin-foil 铝箔药板] / profile）
  utils/color.ts          withAlpha / mixColor：半透明叠色与亮暗变体
  constants/theme.ts      颜色 / 字体 / 间距 / 圆角（唯一 token 来源）
docs/conventions/         本表指向的七份专题规范
design/                   HTML 设计稿（today、medications、add-medication、profile、settings）—— UI 的视觉基准
maestro/                  端到端测试流
ios/                      prebuild 产物；改 app.json 后需重新 prebuild
.oxlintrc.json / .oxfmtrc.json / .editorconfig   工具链配置
```

## 待办（改这些区域时留意）

- **Expo UI → RN 迁移已全部完成**（`docs/plans/迁移计划.md`）：第 0–3 批生产屏 + PR9.5 脚手架收拢 + PR10 孪生外壳 + PR11 双轨清扫 + PR13 设置页，`bun run check` 0 error / 0 warning；TrueSheet 已 prebuild（`ios/Podfile.lock` 有 `RNTrueSheet 4.0.0-beta.25`）。`@expo/ui` 已从项目彻底移除（`rg 'from "@expo/ui"' src` 零命中，`package.json` 依赖已删；引导页与孪生铝箔岛也于 2026-10-16 迁完）；5 处菜单 `Picker` 换成 `RnPicker`、`ExpoUiIsland` 与 `native-layout.*` 三件套已删除；`docs/conventions/ui-design.md` 的选型阶梯已按硬规则 1 重写。**剩余事项**：① 真机验证（计划文档 §6.4 + §6.6 + §6.7：TrueSheet 观感、设置页整屏、detail / person-detail / twin 三屏、`GlassHostButton`、`RnPicker`、修复后的 `RnDateTimePicker` 四个表单）；② `maestro/medica.yaml` 的断言已按新行结构改好（`1 种` 徽章一条已删，现存 `5/30` / `瓶装 · 慢性病` 两条），但 flow 未复跑。

- `records` 页：数据已采集，缺按日期的历史与依从率展示界面。它现在是 `src/app/records.tsx`（tab 组之外），**还没有进「我的」的入口**，要接上得在 `src/screens/profile/index.tsx` 的菜单列表里加一行 push `/records`。
- **`src/screens/medica/`（药品库）已按 design/medications.html 重做并在模拟器上跑通**（`maestro/medica.yaml` 全流程绿）：横滑分类筛选/搜索/详情/删除/空态都验过，`Stack.SearchBar` 在 `NativeTabs` 里的 tab 根屏上确实出了原生搜索框（项目里第一次用）。**形态是纯 RN `FlatList`**（迁移计划 PR3；中间试过 `@expo/ui` 的 universal `List` + `ListItem`，又改回 `FlatList`）：一行只剩药名 + `类型 · 分类` + 行尾 `剩余/总数`（偏低 / 告急只染文字色，没有底色与图标）；分类筛选行是 `src/screens/medica/filter-row.tsx`（`FlashList` 横滑 + `GlassChip` / `GlassChipRow`），作为不滚动的头排在列表上方；空态用 `SymbolIcon` + RN 居中。**踩过的坑（勿再犯）**：`FieldGroup` 与 universal `List` 自己就是滚动容器（iOS 是 SwiftUI `Form` / `List`），嵌进外层 `ScrollView` 会塌成零高、区块内容直接消失 —— 详情页已改成普通行拼的分组卡片（`src/components/rn-section-card.tsx` 的 `SectionCard` / `SectionTitle` / `HairLine`）。**真机未验证**：药名过长时的截断、Android 侧 `GlassChip` 选中态观感、`maestro/medica.yaml` 未复跑（`1 种` 徽章断言已随改版删掉，现存两条与新行结构一致）。仍待看：`MIGRATION_V3` 老库补列默认「慢性病」。
- **药品数字孪生（板装）已实施**（方案见 `docs/plans/medication-digital-twin.md`）：新增 `packs` / `blister_slots` 两张表，槽位逐格镜像实体泡罩；`takeReminder` 按「板序→格序」消耗槽位，孪生页点格子可手动记一次服用 / 标记损坏 / 撤销 / 恢复，`undoUsage` 连带回退提醒与库存；存量板装药在孪生页填规格开启（历史消耗补成无记录的 empty 格）。不变式：`remainingQuantity === Σfull 槽位`，板装补货改走 `appendBlisterPacks` 按板补（`restockMedication` 对已建孪生的药直接跳过）。视觉按实物药板做，铝箔部分已迁纯 RN（`src/screens/medica/twin-foil.tsx`，迁移计划 §6.9）：**linear 渐变**（铝箔纸两道金属高光、热压封边、胶囊套合）用 `expo-linear-gradient` 直接铺；**radial 渐变**（泡罩受光、凹坑暗心、药饼球面）没有现成 radialGradient 可用，用「以光源为圆心的同心圆分层」近似 —— 主题色标先 `mixColor` 插值成 8 段（`RADIAL_BANDS`），从大到小铺 8 颗实色圆，`endRadius` 之外先用边缘色铺满避免露底。这正是当年 Android 侧的退化路径，现在两端同构。**真径向已可行**：`react-native-svg` 已于 2026-10-17 为设置页图标引入（见 `src/screens/profile/settings/huge-icon.tsx`），孪生铝箔的径向渐变现在是可评估项，不必再绕同心圆近似。泡罩按「热压封边 → 透明塑料泡 → 药」三层叠，泡里按 `unit` 渲染双色胶囊（粒，含套合接缝与蛋壳光泽）或带压痕的药饼（片），配色按药品 id 稳定取色、明暗变体由 `mixColor` 现算；药有 0.94 不透明度读作「在塑料底下」并沉在泡底；服后的格子是顶破的凹坑；箔上还印着药名与规格（等宽小字 + 字距）。光源统一在左上（`LIGHT`），所有渐变中心都按它算。**真机未验证**：渐变的实际观感（尤其暗色档）、网格等分与 TrueSheet 交互、`maestro/twin.yaml` 未跑（另：全部 flow 的 appId 已从废弃的 `com.youngxhui.RememberYo` 修正为 `top.youngxhui.rememberyao.k3f9`，之前一直跑不起来）。
- **`src/screens/profile/` 已在模拟器上跑通**（`maestro/profile.yaml` 添加/详情/删除成员 + 菜单卡、`maestro/plan.yaml` 建配置全绿），迁移后全部是纯 RN：`index.tsx`（档案横排 `MiniArchive` 走 `FullBleed` 通栏 / 本周概览三等分统计卡 / 家庭成员卡 / 菜单卡）、`persons.tsx`、`person-detail.tsx`、`plan-form.tsx`、`settings.tsx`（2026-10-17 起是**二级结构**：`src/app/(tabs)/profile/settings/` 下 index + general / notifications / about 四个**平级路由**（该目录**不能放 `_layout.tsx`**，见下方 Stack 嵌套坑），根屏只剩「通用设置 / 通知设置 / 关于」三个入口行（只有图标 + 标题 + 右箭头，不带描述副标题；三个入口**各自一张白卡片**、卡片间距 24px，不再挤在一张卡片里用发丝线分），控件搬进 general / notifications / about 三个二级屏，每屏一个分组标题 + 若干「标题 + 操作」行；PR13 的 `SectionCard tone="outline"` 白卡片对齐 `design/settings.html`，行首图标与行尾箭头走 `HugeIcon`（Hugeicons SVG + `react-native-svg`，两端同一份 path）+ RN `Switch` + TrueSheet，见迁移计划 §6.6）。**踩过的坑（勿再犯）· Stack 里嵌 Stack = 双层导航栏**：2026-10-17 曾给 `settings/` 加过 `_layout.tsx`（想让四个屏自成一组），结果二级屏顶上出现两条导航栏 —— 外层 profile Stack 给 `settings` 这条路由渲染一条（标题还是未翻译的路由名 "settings"），内层 Stack 自己再渲染一条。已改成删掉 `_layout.tsx`、四个路由平级挂在 profile Stack 下（路径不变：`/profile/settings`、`/profile/settings/general` …），单 header + 系统返回 + 各屏自己的 `<Stack.Title>`。注意 `medica/`、`home/` 的目录级 `_layout.tsx` 是**合法**的：它们的外层是 `NativeTabs`（只有 tab 栏、没有导航栏），不会撞。判定规则：**外层是 Stack 就别再嵌 Stack**。**plan-form 的「人与药一对多」**：用药人单选与每日次数都用 `RnPicker`（`src/components/rn-picker.tsx`：灰底胶囊触发器 + **原生菜单** `@react-native-menu/menu`，2026-10-16 先替掉 5 处 `@expo/ui` 菜单 `Picker`、10-17 换成真原生菜单，见迁移计划 §6.7），药品**多选**（`Checkbox` 逐行列，不用 chip 行 —— `Row` 在 iOS 是 HStack 不折行，药一多就溢出屏外），勾中的每味药下方出一个剂量输入（单位逐味不同），服用时间与起止日期是这组药共用的；保存走 store 的 `applyPlanChanges` 一次落多笔配置（新增 / 更新 / 移除），只重排一次通知。编辑态取消勾选原来那味药 = 保存时移除该配置。表单基形是 `@/components/rn-form` + `rn-input-shell` + `rn-section-card`（画布底 + 分区卡片 + label 在上 + 圆角描边输入盒；`@/components/form` 那一版已删）。**踩过的坑（勿再犯）**：`FieldGroup` / universal `List` 嵌进外层 `ScrollView` 会塌成零高 —— 已按 `SectionCard` 普通行拼修复。**未复跑 `maestro/plan.yaml`**：flow 已按新结构改（药品改为点药名勾选、编辑态改用「药名 · 每次剂量（单位）」确认回填），testID 为 `plan-medication-<药id>` / `plan-dose-input-<药id>`（脚本拿不到药 id，靠文案定位），真机要重点看 checkbox 行在 iOS 上的呈现与多选保存后的提醒重排。**日期/时间选择**全部走 `@/components/rn-datetime-picker`（社区 `datetimepicker` 封装：Android「灰底胶囊 + 点按才弹对话框」，iOS compact；12/24 小时制与日期格式跟 App 语言，用 `pickerFormat()`）。仍需看：「我的」菜单里没有进 `records` 的入口（见本表 `records` 条）；**2026-10-17 双层导航栏的修法未真机复验** —— 四个设置路由已从「settings/ 自带嵌套 Stack」改平级挂在 profile Stack 下（`settings/_layout.tsx` 已删），按源码逻辑只剩一条导航栏、各屏 `<Stack.Title>` 各自生效、返回按钮由系统给，但这一步只过了 `bun run check`，要真机确认二级屏顶上确实只有一条、根屏标题是「设置」而不是路由名 "settings"；设置页整屏未真机验证（迁移计划 §6.6 有专项清单）；**2026-10-17 换上的 `HugeIcon` SVG 图标未真机验证** —— `react-native-svg` 要一次完整 `expo run:ios` 重建才注册上（否则报 `UnimplementedView: native component 'RNSVGPath' is not registered`，图标渲染成 `RCTUnimplementedViewComponentView` 的「U」形占位），重建后要看：18px 行首图标在 1.8 笔画下的粗细与居中、14px 行尾 chevron 是否发虚、暗色档、Android 端（`RNSVG` 已 prebuild 但从未跑过）。
- **Android**：日期/时间选择走 `@/components/rn-datetime-picker`（Android 侧包成「灰底胶囊显示当前值 + 点一下才挂载对话框」—— Material 的 `TimePickerDialog`/`DatePickerDialog` 是**挂载即弹**的 AlertDialog，直接渲染进表单会让快速添加第二步、plan-form、设置页免打扰一进界面就弹系统对话框；胶囊走 RN `Text`，`testID` 也因此能在 Maestro 里定位到），其余平台差异集中在 `toolbar-icons.{ts,android.ts}`、`symbol-icon.tsx`、`rn-datetime-picker.tsx` 三处（`native-layout.*` 已随 `@expo/ui` 移除而删除）。**`android/` 目录已生成**（prebuild 产物），但整个 Android 端从未在模拟器 / 真机上跑过，布局与交互待验证。**chip 双轨已删除**（迁移计划 PR11）：当年按平台拆过 `chip.{tsx,ios.tsx,android.tsx}`（iOS 液态玻璃，Android Material 3 官方 `FilterChip`），现在筛选 chip 统一走 `GlassChip`（iOS `expo-glass-effect` 的 `GlassView`，Android 退化为实心品牌色选中态）。**图标两套取值都已补齐**：内容树与孪生坑内标记走 `SymbolIcon`（`expo-symbols`，Android 是 Material Symbols **字形名**，语义键在 `icons.ts` 的 `SYMBOL_ICONS`，`{ ios, android }` 两端都有值）；**设置页例外**走 `HugeIcon`（Hugeicons SVG，两端同一份 path、无平台分歧）；工具栏图标走 `src/components/toolbar-icons.{ts,android.ts}`（iOS SF Symbol / Android `@expo/material-symbols` 矢量图，纯资源包、不需要 prebuild，重启 Metro 即可生效）。第三套 `@expo/ui` 的 `Icon` + `ICONS`（`Icon.select`）已随铝箔岛迁 RN 删除。**Android 仍未验证**：`GlassChip` 选中态观感与按压涟漪、系统大字号下的表现、`RnPicker` 的胶囊触发器与原生菜单弹层（iOS `UIMenu` / Android `PopupMenu`）、头像三个原生模块与 `avatar_uri` 读写、`react-native-svg` 渲染的设置页图标。
- **`src/screens/home/index.tsx` 是纯 RN**（迁移计划 PR4：拆掉整屏 `Host` 与 `useExpoUiContentWidth` 测宽）：巨型日期 / 通知横幅 / 区块标题 + `ScreenScaffold` + `Padded`，提醒卡堆叠（`ReminderCardStack`，Reanimated 手势换卡）与库存速览（`StockPanel`）直接长在 RN 树上，不再有 island 与喂宽。空态 `home-empty-add-button` → quick-add；Hero 圆形加号 `home-add-medication-button` → 手动表单（迁移计划 Q4 拍板恢复，`maestro/medica.yaml`、`plan.yaml` 依赖它）。**成员筛选在系统工具栏右上角**（`Stack.Toolbar.Menu`：选中成员时图标是他的头像照片，否则 `memberFilterIcon`；「全部」/成员名菜单项，选中项 `isOn` 打勾，只有一家以上成员才挂），不随内容滚动、也不占内容区高度。**未在真机上验证**：右上角在大标题屏上的实际位置与观感、菜单打勾样式、删成员后退回「全部」的收敛；Android 端菜单按钮从未验过。
- **`src/screens/home/dose-rail.tsx`（服药时间线导轨，约 950 行）已删除**（迁移计划 Q3 拍板、PR6 执行）：文件连同仅被它使用的 i18n 词条（`home.expand` / `collapse` / `expandGap` / `collapseGap` / `gap*` / `now` / `home.snoozeSet` / `home.snoozeIn`）一起清掉。保留 `home.noSchedule*`、`reminder.snooze`、`settings.snooze*`。要恢复时间线得重写（纯 RN 树，导轨连接线要 `flex: 1`），那是产品 PR，不是把文件捡回来。
- 桌面 Widget：`expo-widgets` 已配置（app.json plugins），尚未实现。
- 单元测试：`store.ts` 的提醒生成 / 库存扣减是纯函数，适合优先覆盖。
- **原生依赖已变更**：新增 `expo-sqlite` / `expo-localization`（app.json plugins 已自动登记）、`expo-haptics`（Mini Archive 开合 commit 触感，需 `pod install` 后重新 `npx expo run:ios` 才生效）。iOS 端必须重新 `npx expo run:ios` 才会生效，Expo Go 跑不起来。
- **头像照片已实施**：`persons.avatar_uri` 存本地文件 URI（null = 没照片，界面退回「底色 + 姓名首字」），新增 `expo-image-picker` / `expo-image-manipulator` / `expo-file-system` 三个原生模块与 `src/lib/avatar-photo.ts`（相册选图 → 缩到 256² → 居中裁方 → 存 `document/avatars/`）。picker 返回的 URI 在相册 / 临时目录里、系统会回收，必须自己落一份；`allowsEditing` 在部分平台被忽略，所以裁方放在缩放之后兜底。`SCHEMA_VERSION` 3 → 4（删库重建，本地数据清空）。入口是添加 / 编辑成员表单（`persons.tsx`）的「头像」行：选照片 / 更换 / 移除；移除靠 `updatePerson` 补丁显式传 `null`（`definedValues` 只丢 `undefined`，这就是「不改」与「清空」的分界），换图或移除成功后旧文件才删，删成员时沙盒照片一并清掉。选中某人时，首页工具栏右上角菜单的图标就是他的照片（工具栏图标槽只收「SF Symbol 或图片源」，照片正好是图片源；没照片才退回 `memberFilterIcon`）。**真机未验证**：① 相册权限弹窗与拒绝后的提示；② 照片在纯 RN 树各处（「我的」成员卡、plan-form、quick-add、个人信息页大头像）上的尺寸与居中；③ **iOS 工具栏里的照片是方的** —— `UIBarButtonItem` 的 image 不加圆角，而各处头像都是圆的，要圆角得在像素上预 masks（纯 JS 编 PNG 或加原生模块），当前先接受方形；④ Android 端三个新模块与 `avatar_uri` 读写；⑤ 换图后旧文件是否真的删掉。
- **i18n 漏翻检查**：新增界面文案后确认 `zh.ts` / `en.ts` 键名一致（`bun run check` 只能查出「用了不存在的键」，查不出「en 缺翻译」）。两侧键数应始终相等。
