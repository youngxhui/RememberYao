# RememberYao — Agent 指南

家庭用药提醒 App：记录家里每个人的用药配置，到点本地通知提醒，服用后自动扣减库存。
`CLAUDE.md` 仅引用本文件，所有约定以本文件为准。

## 文档地图

本文件只放**硬规则**（必须 / 禁止）。理由、示例、自查方法在：

| 文件 | 内容 |
| --- | --- |
| [docs/conventions/code-style.md](docs/conventions/code-style.md) | oxlint/oxfmt 工具链、TypeScript、命名、导入顺序、库选择偏好、样式写法 |
| [docs/conventions/ui-design.md](docs/conventions/ui-design.md) | `@expo/ui` 选型、平台专属组件隔离、RNHostView、主题 token、组件契约、native slop |
| [docs/conventions/expo-ui-layout.md](docs/conventions/expo-ui-layout.md) | `@expo/ui` 与 RN 混用的布局边界、尺寸测量、`matchContents`、折叠/展开适配 |
| [docs/conventions/routing-structure.md](docs/conventions/routing-structure.md) | `src/app` 规则、`_layout.tsx`、Stack/Link/NativeTabs、目录归属 |
| [docs/conventions/data-state.md](docs/conventions/data-state.md) | store.ts 单点持久化、按屏幕的查询 Hook、纯函数、日期字符串、提醒状态机、通知同步、Maestro |
| [docs/conventions/database.md](docs/conventions/database.md) | `src/db` 表结构、版本重建、按实体按需读写与事务、查询 Hook |
| [docs/conventions/i18n.md](docs/conventions/i18n.md) | `src/i18n` 运行时、`t()` 类型安全、词条维护、通知文案重注册 |

写代码前先读**精确版本**的 Expo 文档：https://docs.expo.dev/versions/v58.0.0/
任意文档 URL 后加 `.md` 可取 Markdown 版，完整目录见 https://docs.expo.dev/llms.txt。

本项目已安装 `.agents/skills/`（Claude 同步在 `.claude/skills/`）下的 Expo 官方 skills，涉及对应主题时优先加载，而不是凭记忆猜 API：
`expo-overview`（入口）、`expo-ui`、`expo-router`、`expo-native-ui`、`expo-animation`、`expo-project-structure`、`expo-design-system`、`expo-data-fetching`、`expo-module`、`expo-upgrade`、`eas-*`。

## 技术栈

| | |
| --- | --- |
| Expo SDK | 58（`^58.0.0-preview.4`，预览版，API 与稳定版有差异） |
| React Native | `0.88.0-rc.1` / React `19.3.0` |
| 路由 | `expo-router` ~58，文件式路由，根目录 `src/app` |
| UI | 内容树纯 RN（`View`/`Text`/`Pressable`/`FlatList` + `useTheme()`）+ `ScreenScaffold` / `ContentGlass` / `GlassChip`；系统 chrome 与三处残留岛仍走 `@expo/ui`（见硬规则 1）；Android 矢量图标 `@expo/material-symbols`；sheet 用 `@lodev09/react-native-true-sheet` |
| Lint / 格式 | **oxlint 1.85 + oxfmt 0.70**（Rust 实现，不用 ESLint/Prettier） |
| 数据 | `expo-sqlite` + `drizzle-orm`（本地 SQLite），`src/lib/store.ts` 单点持久化 |
| 头像照片 | `expo-image-picker` + `expo-image-manipulator` + `expo-file-system`（选图 → 裁方缩放 → 存沙盒） |
| 通知 | `expo-notifications`（本地调度 + 通知栏操作按钮） |
| 多语言 | `expo-localization` + 自建 `src/i18n`（zh/en 运行时切换，`t()` 路径类型安全） |
| 语言 | TypeScript strict，实验特性 `typedRoutes` + `reactCompiler` 已开启 |
| 测试 | Maestro（`maestro/*.yaml`），暂无单元测试 |
| 原生目录 | 只有 `ios/`（prebuild 产物），Android 目录未生成 |

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

包管理器：**bun**（`bun.lock` 是唯一权威 lockfile）。仓库里残留的 `pnpm-lock.yaml`、`package-lock.json` 已废弃，装依赖只用 bun，不要新增/更新其他 lockfile。

## 硬规则

### UI

1. **内容树默认纯 RN**（`View`/`Text`/`Pressable`/`ScrollView`/`FlatList` + `useTheme()` + `ScreenScaffold`），**不要再写整屏 `Host`+`Column`+`ScrollView`** —— 2026-10 迁移已完成，全部生产屏都是纯 RN（见 `docs/plans/迁移计划.md`）。系统 chrome（`NativeTabs` / `Stack.Title` / `Toolbar` / `SearchBar`）不动。内容玻璃走 `@/components/content-glass`（`ContentGlass`）与 `@/components/glass-chip`（`GlassChip` / `GlassChipRow`），**屏幕禁止直接 import `expo-liquid-glass-view` / `expo-glass-effect`**。sheet 一律用 `@lodev09/react-native-true-sheet`（2026-10 决策：真原生 sheet —— iOS `UISheetPresentationController` / Android `ModalBottomSheet`，视觉=系统；`@expo/ui` 的 `BottomSheet` 已弃用，它必须做 `FieldGroup` 子节点，社区替代品 `@expo/ui/community/bottom-sheet` 的 default export 是挂载即打开的 `BottomSheet` 易踩坑，`@gorhom/bottom-sheet` 是 JS 渲染视觉对不齐系统）。RN 父树里要挂 `@expo/ui` 原生控件（玻璃按钮、菜单 `Picker`）一律走 `@/components/expo-ui-island` 的 `ExpoUiIsland`（`Host matchContents` + `seedColor`），**不要各屏手写 `Host`**。`@expo/ui` 只剩三处合法残留：`settings.tsx` 的整屏 `FieldGroup`（Q1 冻结）、`onboarding.tsx` 的 `TabView` pager、孪生铝箔岛的 `nativeGradientBackground`（Q2 冻结）。日期选择：RN 表单页用 `@/components/rn-datetime-picker`，settings 仍用 `NativeDatePicker`。
2. **`@expo/ui/swift-ui` 是 iOS-only，`@expo/ui/jetpack-compose` 是 Android-only**。导入**原生视图组件**（`DatePicker`/`TabView`/`Switch`）到另一端会抛 `Unable to get view config` 崩溃；导入 **modifier 工厂**（`frame`/`buttonStyle`）不崩但会被静默忽略，导致布局失效。平台专属组件必须放进 `.ios.tsx` / `.android.tsx`（放 `src/components/`，**不能放 `app/`**），或用 `process.env.EXPO_OS` 守卫。已有 universal / community 组件时直接使用（如 `DateTimePicker`）；确需平台隔离的能力统一从 `@/components/native-layout` 导入，oxlint 会以 error 拦截直接跨平台导入。**但先确认 universal 层真的做不到**（读 `node_modules/@expo/ui/src/universal/<组件>/types.d.ts`）：同一件 UI 在两端可能根本不是同一个组件（分段筛选：iOS 是 `pickerStyle('segmented')`，Android 是 `SingleChoiceSegmentedButtonRow`），但拆平台文件无法静态验证、且两端控件承载能力不同（segmented 到 4 段以上就废了，menu 菜单不会）——**universal 能满足就用 universal**。详见 [ui-design.md](docs/conventions/ui-design.md#平台专属组件隔离最重要)。
3. **`Host` 永远从 `@expo/ui` 根导入**，不要从平台子包拿。生产内容树已无 `Host`，只剩 `ExpoUiIsland` / 铝箔岛 / settings / onboarding 四处。
4. 必须在 Expo UI 树里用 RN 视图时，用 `RNHostView` 包裹。**内容树已无此需求**（残留岛内的 RN 视图仍走它，如孪生格子的 `RNHostView` 历史写法已清）。
5. **从 `react-native` 导入的 UI 组件一律加 `RN` 前缀**：
   ```ts
   import { Text as RNText, View as RNView } from "react-native";
   import { Column, Host, Row, Text } from "@expo/ui";
   ```
   非 UI 的 API（`Platform`、`AppState`、`Linking`、`useColorScheme`）不加前缀。
   **纯 RN 屏可以不写 `as RNView`**（已迁屏混用两种风格：`screens/home` 直接 `View`/`Text`，`components/avatar.tsx` 仍是 `RNView` 前缀）—— 但只要文件里还 import `@expo/ui`，就必须加前缀，避免两种 `Text` 撞名。
6. **不要硬编码颜色、字号、间距**。一律走 `useTheme()` → `src/constants/theme.ts`。语义色：`primary` / `success`（已服）/ `warning`（即将到期）/ `danger`（漏服）；间距用 `Spacing`；底部 tab 遮挡用 `BottomTabInset`。
7. **`useNativeState` 从 `@expo/ui` 根导入时只能用 `.value`**，没有 `.get()`/`.set()`（那套只在 `@expo/ui/swift-ui` 的类型里）。写 `.value` 是可变原生状态对象的既定用法；oxlint 的 `react/immutability` 对此属误报，已在 `.oxlintrc.json` 按文件关闭。详见 [ui-design.md](docs/conventions/ui-design.md#usenativestateuniversal-导入下只能用-value)。
8. 图标禁止用 emoji。iOS 用 SF Symbol，Android 用 Material icon；`NativeTabs` 的图标必须同时给 `sf` 和 `md`。
9. 圆角配 `borderCurve: "continuous"`；阴影用 `boxShadow`，禁止 legacy `shadow*` / `elevation`。
10. 长列表用 `FlatList` / `FlashList`。`@expo/ui` 的 `List` 渲染的是**原生列表行**（iOS 设置页那种观感），universal 层没有分组头 / 滑动操作 / 多选等高阶列表能力，只适合短小固定的分组（设置页、详情面板行、家庭量级的药箱目录）；形态不定的长列表（feed、搜索结果）仍用 `FlatList` / `FlashList`。⚠️ `List` 与 `FieldGroup` 自己就是滚动容器，**嵌进外层 `ScrollView` 会塌成零高**（真机 bug，勿再犯）。

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
      profile/            我的：index（只有路由）+ persons / person-detail / plan-form / language / settings（已迁纯 RN）
  screens/
    home/                 首页实现：index（纯 RN：大字日期 / 通知横幅 / 区块标题，成员筛选走系统工具栏右上角菜单）+ stock-panel（库存速览）
    medica/               药品库实现：index（纯 RN：FlatList + 分类筛选）+ filter-row（分类 chip 横滑）+ twin（外壳纯 RN，铝箔网格留 Expo UI 岛）
    profile/              我的实现：index（档案横排 / 本周概览 / 家庭成员 / 菜单）+ settings（纯 RN：分组卡片，见 design/settings.html）
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
  hooks/                  use-theme / use-color-scheme / use-onboarding-gate
  components/             app-tabs、avatar、content-glass、glass-chip、screen-scaffold、expo-ui-island、rn-form / rn-input-shell / rn-section-card / rn-datetime-picker / rn-round-icon-button、progress-bar、dose-timeline、reminder-card-stack、mini-archive、symbol-icon、toolbar-icons(.android)、icons、rounded-box  utils/color.ts          withAlpha：#rrggbb → rgba()，半透明叠色
  constants/theme.ts      颜色 / 字体 / 间距 / 圆角（唯一 token 来源）
docs/conventions/         本表指向的六份专题规范
design/                   HTML 设计稿（today、medications、add-medication、profile、settings）—— UI 的视觉基准
maestro/                  端到端测试流
ios/                      prebuild 产物；改 app.json 后需重新 prebuild
.oxlintrc.json / .oxfmtrc.json / .editorconfig   工具链配置
```

## 待办（改这些区域时留意）

- **Expo UI → RN 迁移已全部完成**（`docs/plans/迁移计划.md`）：第 0–3 批生产屏 + PR9.5 脚手架收拢 + PR10 孪生外壳 + PR11 双轨清扫 + PR13 设置页，`bun run check` 0 error / 0 warning；TrueSheet 已 prebuild（`ios/Podfile.lock` 有 `RNTrueSheet 4.0.0-beta.25`）。`@expo/ui` 在生产内容树已全部退场，只剩用药人菜单 `Picker` 经 `ExpoUiIsland`（twin / plan-form / settings）与 `onboarding.tsx` 整屏；`docs/conventions/ui-design.md` 的选型阶梯已按硬规则 1 重写。**剩余事项**：① 真机验证（计划文档 §6.4 + §6.6：TrueSheet 观感、设置页整屏、detail / person-detail / twin 三屏、`GlassHostButton`）；② `AGENTS.md`「待办」区里 home / medica 两段仍写着「Expo UI 为主 + RN island」，与实况不符，待重写；③ `maestro/medica.yaml` 的 `1 种`徽章断言已随列表改版删掉（`5/30` / `瓶装 · 慢性病` 两条仍有效），未复跑。

- `records` 页：数据已采集，缺按日期的历史与依从率展示界面。它现在是 `src/app/records.tsx`（tab 组之外），**还没有进「我的」的入口**，要接上得在 `src/screens/profile/index.tsx` 的菜单列表里加一行 push `/records`。
- **`src/screens/medica/`（药品库）已按 design/medications.html 重做并在模拟器上跑通**（`maestro/medica.yaml` 全流程绿）：横滑分类筛选/搜索/详情/删除/空态都验过，`Stack.SearchBar` 在 `NativeTabs` 里的 tab 根屏上确实出了原生搜索框（项目里第一次用）。**列表已从自拼卡片改成原生列表展示**（universal `List` + `ListItem`：iOS 是 SwiftUI `List`、Android 是 Material 3 `LazyColumn`）：缩略图、左侧色条、库存胶囊、卡片描边全部去掉，一行只剩药名 + `类型 · 分类` + 行尾 `剩余/总数`（偏低 / 告急只染文字色，不再有底色与图标）；滚动整体交给 `List`（它自己就是滚动容器，再嵌进外层 `ScrollView` 会塌成零高），分类 chip 行作为不滚动的头部排在它上面。**真机未验证**：`Column` 里「筛选行 + List」的高度分配（List 若不吃剩余高度会塌成一小条）、原生 List 的系统底色与页面 canvas 的衔接、行尾库存数字在长药名下的截断、`maestro/medica.yaml` 未复跑（里面 `1 种` 徽章与 `5/30 · 偏低` 胶囊文案的断言已随本次改版失效，要按新行结构改）。**真机发现并修了一个布局 bug**：`FieldGroup`（iOS 是 SwiftUI `Form`，本身就是滚动容器）和 `List` 嵌进外层 `ScrollView` 会塌成零高、区块内容直接消失 —— 详情页已改成普通行拼的分组卡片（`SectionCard`/`HairLine`/`SectionTitle`，共享组件 `src/components/section-card.tsx`），**以后不要再往 `ScrollView` 里嵌 `FieldGroup`/`List`**。仍待看：药名过长时的截断、`MIGRATION_V3` 老库补列默认「慢性病」。
- **药品数字孪生（板装）已实施**（方案见 `docs/plans/medication-digital-twin.md`）：新增 `packs` / `blister_slots` 两张表，槽位逐格镜像实体泡罩；`takeReminder` 按「板序→格序」消耗槽位，孪生页点格子可手动记一次服用 / 标记损坏 / 撤销 / 恢复，`undoUsage` 连带回退提醒与库存；存量板装药在孪生页填规格开启（历史消耗补成无记录的 empty 格）。不变式：`remainingQuantity === Σfull 槽位`，板装补货改走 `appendBlisterPacks` 按板补（`restockMedication` 对已建孪生的药直接跳过）。视觉按实物药板做：整块是铝箔纸（iOS 走 `nativeGradientBackground` 铺真渐变：两道金属高光、泡罩径向受光、凹坑暗心、药饼球面 shading；Compose 的 modifiers 包没有 background，Android 退化平色 + 同心圆分层），泡罩按「热压封边 → 透明塑料泡 → 药」三层叠，泡里按 `unit` 渲染双色胶囊（粒，含套合接缝与蛋壳光泽）或带压痕的药饼（片），配色按药品 id 稳定取色、明暗变体由 `mixColor` 现算；药有 0.94 不透明度读作「在塑料底下」并沉在泡底；服后的格子是顶破的凹坑；箔上还印着药名与规格（等宽小字 + 字距）。光源统一在左上（`LIGHT`），所有渐变中心都按它算。**真机未验证**：渐变的实际观感（尤其暗色档）、网格等分与 `BottomSheet` 交互、`maestro/twin.yaml` 未跑（另：全部 flow 的 appId 已从废弃的 `com.youngxhui.RememberYo` 修正为 `top.youngxhui.rememberyao.k3f9`，之前一直跑不起来）。
- **`src/screens/profile/` 已在模拟器上跑通**（`maestro/profile.yaml` 添加/详情/删除成员 + 菜单卡、`maestro/plan.yaml` 建配置全绿）：`index.tsx` 是 **Expo UI 为主的整屏**（`Host` + 原生 `ScrollView`，Mini Archive 与头像是 RN island）—— `containerWidth` 喂宽、三等分统计卡、菜单卡发丝线/徽章、圆形加号按钮都正常。**`persons.tsx` / `person-detail.tsx` 的 `<List>` 嵌在 `ScrollView` 里（与药品详情页同源的塌陷 bug）已按 `SectionCard` 改法修复**，`SectionCard`/`SectionTitle`/`HairLine` 提升为共享组件 `src/components/section-card.tsx`（medica 详情页同源引用）。plan-form 的 Picker（iOS menu）、通知权限弹窗、编辑回填也验过。**plan-form 已按 `@/components/form` 的基元 + 「人与药一对多」重做**（与添加药品 / 添加成员同一套排版：画布底 + 分区卡片 + label 在上 + 圆角描边输入盒）：用药人单选（`Picker`），药品**多选**（universal `Checkbox` 逐行列，不用 chip 行 —— `Row` 在 iOS 是 HStack 不折行，药一多就溢出屏外），勾中的每味药下方出一个剂量输入（单位逐味不同），服用时间与起止日期是这组药共用的；保存走 store 新增的 `applyPlanChanges` 一次落多笔配置（新增 / 更新 / 移除），只重排一次通知。编辑态取消勾选原来那味药 = 保存时移除该配置。原生 `FieldGroup` 那一版已删除。**未复跑 `maestro/plan.yaml`**：flow 已按新结构改（药品改为点药名勾选、编辑态改用「药名 · 每次剂量（单位）」确认回填），testID 变为 `plan-medication-<药id>` / `plan-dose-input-<药id>`（脚本拿不到药 id，靠文案定位），真机要重点看 checkbox 行在 iOS 上的呈现（SwiftUI `Toggle` 默认是开关样式）与多选保存后的提醒重排。**用药时间/日期选择器已去掉 `InputShell` 外盒**（compact 日期选择器自己画一颗灰底胶囊，再套盒就是盒中盒）；更深一层的原因是真机发现社区 `datetime-picker` 把原生选择器包在 `Host`（matchContents）这块 RN island 里，在 `Column`/`Row` 中定位不稳（顶出内边距 / 纵向偏移，即「对不齐」），已改为平台隔离的 `src/components/native-date-picker.{ios,android}.tsx`：iOS 直接渲染 SwiftUI `DatePicker`（compact），Android/web 仍走社区组件；同时用 `pickerFormat()` 让 12/24 小时制与日期格式跟随 App 语言而非系统 locale —— 添加药品的有效期、设置页的免打扰时段同改。**三处都未在真机上复验**。仍需看：`settings.tsx`（自定义 `FieldGroup.SectionHeader` 与 `ListItem` leading 槽里的 `Icon`）整屏未跑；「我的」菜单里也没有进 `records` 的入口（见本表 `records` 条）。
- **Android**：日期/时间选择已使用通用 `DateTimePicker`（Android 侧包成「灰底胶囊显示当前值 + 点一下才挂载对话框」—— Material 的 `TimePickerDialog`/`DatePickerDialog` 是**挂载即弹**的 AlertDialog，直接渲染进表单会让快速添加第二步、plan-form、设置页免打扰一进界面就弹系统对话框；胶囊走 universal `Text`，`testID` 也因此能在 Maestro 里定位到），其余通用屏幕的平台能力已隔离到 `src/components/native-layout.{ios,android}.tsx`；`android/` 目录尚未生成，仍需模拟器验证布局与交互。**chip 已按平台拆分**（`src/components/chip.{tsx,ios.tsx,android.tsx}`）：iOS 是液态玻璃，Android 用 Material 3 **官方 `FilterChip`**（`@expo/ui/jetpack-compose`，58.0.14 起提供 `AssistChip`/`FilterChip`/`InputChip`/`SuggestionChip`）。曾经为此自造过 `Surface` + `Shape.Pill`，理由是「官方 FilterChip 只有文字点得动」—— 该结论已推翻：`FilterChip.Label` 的载体 `SlotView` 虽在 `ExpoComposeView.init` 里被设成 `GONE` + `setWillNotDraw(true)`，但这是**所有**非 hosting `ExpoComposeView` 的统一行为（`Surface` 自己也是），GONE 的 view 不进触摸分发、不可能吃掉点击；整颗 chip 的点击由 `androidx.compose.material3.FilterChip` 自己的 `Surface(onClick)` 处理。选中/按压动画、涟漪、无障碍、系统大字号全部由 Material 3 提供。取色走 theme token（`containerColor`/`labelColor`/`selectedContainerColor`/`selectedLabelColor`），`border` 只有单一颜色，选中态把描边染成品牌色（与底同色 = 视觉无边）对上设计稿 `.chip.active`；内边距与高度不自己叠，走 Material 默认（左右 16dp、高 32dp）。testID 走 `Modifier.applyTestTag`（官方 chip 不吃 universal 的 testID prop），`react/capitalized-calls` 的单文件豁免已随之移除。**Android 仍未验证**：官方 chip 的实际观感、按压涟漪、选中态联动与系统大字号下的表现（自造版当年也只在 iOS 模拟器上跑通，Android 从未验过）。universal `Icon` 目前只给了 iOS SF Symbol 名，Android 要补 Material 图标（`Icon.select`）；**工具栏图标已补齐**（`src/components/toolbar-icons.{ts,android.ts}`：iOS 给 SF Symbol、Android 给 `@expo/material-symbols` 的矢量图，`Stack.Toolbar.Button` / `Menu` 的 `icon` prop 只认这两种形态，只给 `sf` 时 Android 端整颗按钮不渲染；纯资源包、不含原生代码，不需要 prebuild，重启 Metro 即可生效）；导轨的虚线（`borderStyle: "dashed"`）在 Android 上也要实测。
- **`src/screens/home/index.tsx` 刚改成 Expo UI 为主的整屏**（`Host` + 原生 `ScrollView`），两块 RN island（提醒卡堆叠 / 库存速览）都靠 `useExpoUiContentWidth` 实测的 `containerWidth` 喂宽度。真机要重点看：牌堆是否满宽（宽度没喂对就直接塌）、`Row alignment="end"` 的巨型日期行是否与设计稿的 baseline 对齐、通知横幅的 `Row` 在长文案下会不会挤。**成员筛选已从内容区挪进系统工具栏右上角**（`Stack.Toolbar placement="right"` + `Stack.Toolbar.Menu`：`person.2.fill` + 「全部」/成员名菜单项，选中项 `isOn` 打勾，只有一家以上成员才挂），不再随内容滚动、也不占内容区高度 —— 与原生 iOS 版的导航栏右侧 `UIMenu` 对齐（那边图标用 `line.3.horizontal.decrease.circle`）。**未在真机上验证**：右上角在大标题屏上的实际位置与观感、菜单打勾样式、以及删成员后退回「全部」的收敛；Android 端菜单按钮（`group` 矢量图 + 成员名菜单项）也从未验过。
- **`src/screens/home/dose-rail.tsx`（服药时间线导轨，约 950 行）已删除**（迁移计划 Q3 拍板、PR6 执行）：文件连同仅被它使用的 i18n 词条（`home.expand` / `collapse` / `expandGap` / `collapseGap` / `gap*` / `now` / `home.snoozeSet` / `home.snoozeIn`）一起清掉。保留 `home.noSchedule*`、`reminder.snooze`、`settings.snooze*`。要恢复时间线得重写（纯 RN 树，导轨连接线要 `flex: 1`），那是产品 PR，不是把文件捡回来。
- 桌面 Widget：`expo-widgets` 已配置（app.json plugins），尚未实现。
- 单元测试：`store.ts` 的提醒生成 / 库存扣减是纯函数，适合优先覆盖。
- lockfile：`pnpm-lock.yaml` / `package-lock.json` 已废弃，确认后可删。
- **原生依赖已变更**：新增 `expo-sqlite` / `expo-localization`（app.json plugins 已自动登记）、`expo-haptics`（Mini Archive 开合 commit 触感，需 `pod install` 后重新 `npx expo run:ios` 才生效）。iOS 端必须重新 `npx expo run:ios` 才会生效，Expo Go 跑不起来。
- **头像照片已实施**：`persons.avatar_uri` 存本地文件 URI（null = 没照片，界面退回「底色 + 姓名首字」），新增 `expo-image-picker` / `expo-image-manipulator` / `expo-file-system` 三个原生模块与 `src/lib/avatar-photo.ts`（相册选图 → 缩到 256² → 居中裁方 → 存 `document/avatars/`）。picker 返回的 URI 在相册 / 临时目录里、系统会回收，必须自己落一份；`allowsEditing` 在部分平台被忽略，所以裁方放在缩放之后兜底。`SCHEMA_VERSION` 3 → 4（删库重建，本地数据清空）。入口是添加 / 编辑成员表单（`persons.tsx`）的「头像」行：选照片 / 更换 / 移除；移除靠 `updatePerson` 补丁显式传 `null`（`definedValues` 只丢 `undefined`，这就是「不改」与「清空」的分界），换图或移除成功后旧文件才删，删成员时沙盒照片一并清掉。选中某人时，首页工具栏右上角菜单的图标就是他的照片（工具栏图标槽只收「SF Symbol 或图片源」，照片正好是图片源；没照片才退回 `person.2.fill` / `group`）。**真机未验证**：① 相册权限弹窗与拒绝后的提示；② `RNHostView matchContents` 承载照片在「我的」成员卡（ListItem leading 槽）、plan-form、quick-add、个人信息页大头像（弹性 Spacer 里那颗）上的尺寸与居中；③ **iOS 工具栏里的照片是方的** —— `UIBarButtonItem` 的 image 不加圆角，而各处头像都是圆的，要圆角得在像素上预 masks（纯 JS 编 PNG 或加原生模块），当前先接受方形；④ Android 端三个新模块与 `avatar_uri` 读写；⑤ 换图后旧文件是否真的删掉。
- **i18n 漏翻检查**：新增界面文案后确认 `zh.ts` / `en.ts` 键名一致（`bun run check` 只能查出「用了不存在的键」，查不出「en 缺翻译」）。两侧键数应始终相等。
