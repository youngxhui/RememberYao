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
| [docs/conventions/data-state.md](docs/conventions/data-state.md) | store.ts 单点持久化、纯函数、日期字符串、提醒状态机、通知同步、Maestro |
| [docs/conventions/database.md](docs/conventions/database.md) | `src/db` 表结构、迁移、全量快照语义、从 AsyncStorage 迁移 |
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
| UI | `@expo/ui`（SwiftUI / Jetpack Compose 原生组件） |
| Lint / 格式 | **oxlint 1.85 + oxfmt 0.70**（Rust 实现，不用 ESLint/Prettier） |
| 数据 | `expo-sqlite` + `drizzle-orm`（本地 SQLite），`src/lib/store.ts` 单点持久化 |
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

1. **优先用 `@expo/ui`**，它渲染的是真原生视图（iOS SwiftUI / Android Jetpack Compose）。不要默认退回 RN 的 `View`/`Text`/`Switch`/`Picker`，不要用 `@gorhom/bottom-sheet` 或 Reanimated 手搓 sheet。**唯一稳定的例外是 `flex`** —— universal `style` 没有 flex 语义，依赖 `flex: 1` 撑开/伸缩的子树（导轨连接线、行内文字、Reanimated 绝对定位的牌堆）整块留成 `RNHostView` island，不要逐块桥接。**例外**：整屏核心视觉都在 RN 布局上下文里时（整屏 Reanimated 手势组件、BlurView 组合）才用纯 RN 写整屏并在文件头注释说明理由 —— 现状见 `src/app/(tabs)/playground`。混合写法（Expo UI 为主、RN 只留 island）见 `src/screens/home`、`src/screens/profile`。
2. **`@expo/ui/swift-ui` 是 iOS-only，`@expo/ui/jetpack-compose` 是 Android-only**。导入**原生视图组件**（`DatePicker`/`TabView`/`Switch`）到另一端会抛 `Unable to get view config` 崩溃；导入 **modifier 工厂**（`frame`/`buttonStyle`）不崩但会被静默忽略，导致布局失效。平台专属组件必须放进 `.ios.tsx` / `.android.tsx`（放 `src/components/`，**不能放 `app/`**），或用 `process.env.EXPO_OS` 守卫。已有 universal / community 组件时直接使用（如 `DateTimePicker`）；确需平台隔离的能力统一从 `@/components/native-layout` 导入，oxlint 会以 error 拦截直接跨平台导入。**但先确认 universal 层真的做不到**（读 `node_modules/@expo/ui/src/universal/<组件>/types.d.ts`）：同一件 UI 在两端可能根本不是同一个组件（分段筛选：iOS 是 `pickerStyle('segmented')`，Android 是 `SingleChoiceSegmentedButtonRow`），但拆平台文件无法静态验证、且两端控件承载能力不同（segmented 到 4 段以上就废了，menu 菜单不会）——**universal 能满足就用 universal**。详见 [ui-design.md](docs/conventions/ui-design.md#平台专属组件隔离最重要)。
3. **`Host` 永远从 `@expo/ui` 根导入**，不要从平台子包拿。
4. 必须在 Expo UI 树里用 RN 视图时，用 `RNHostView` 包裹。
5. **从 `react-native` 导入的 UI 组件一律加 `RN` 前缀**：
   ```ts
   import { Text as RNText, View as RNView } from "react-native";
   import { Column, Host, Row, Text } from "@expo/ui";
   ```
   非 UI 的 API（`Platform`、`AppState`、`Linking`、`useColorScheme`）不加前缀。
6. **不要硬编码颜色、字号、间距**。一律走 `useTheme()` → `src/constants/theme.ts`。语义色：`primary` / `success`（已服）/ `warning`（即将到期）/ `danger`（漏服）；间距用 `Spacing`；底部 tab 遮挡用 `BottomTabInset`。
7. **`useNativeState` 从 `@expo/ui` 根导入时只能用 `.value`**，没有 `.get()`/`.set()`（那套只在 `@expo/ui/swift-ui` 的类型里）。写 `.value` 是可变原生状态对象的既定用法；oxlint 的 `react/immutability` 对此属误报，已在 `.oxlintrc.json` 按文件关闭。详见 [ui-design.md](docs/conventions/ui-design.md#usenativestateuniversal-导入下只能用-value)。
8. 图标禁止用 emoji。iOS 用 SF Symbol，Android 用 Material icon；`NativeTabs` 的图标必须同时给 `sf` 和 `md`。
9. 圆角配 `borderCurve: "continuous"`；阴影用 `boxShadow`，禁止 legacy `shadow*` / `elevation`。
10. 长列表用 `FlatList` / `FlashList`。`@expo/ui` 的 `List` **不是虚拟化列表**，只适合短小固定的分组。

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

19. **屏幕永远不直接碰 AsyncStorage 或 SQLite**。所有状态和持久化集中在 `src/lib/store.ts`。
20. 读取用 `useAppData()`，屏幕在 `useFocusEffect` 里调 `reload()`。
21. **日期/时间用字符串**：日期 `YYYY-MM-DD`，时间 `HH:MM`，时间戳 ISO。比较时间用 `localeCompare`，**不要引入日期库**。
22. `MedicationUsage` 的 `personName` / `medicationName` / `time` 是**快照**，删除药品或用药人不清除历史。新增字段保持这个不可变性。
23. **任何写操作后必须经 `setPostMutationHook` 触发 `syncNotificationsWithStore()` 重排通知**，不要绕过。
24. 提醒状态机 `pending → taken / skipped / missed`；**超过 1 小时宽限期**未处理才判 `missed`，漏服可补服（`late: true`）。
25. `store.ts` 的提醒生成、库存扣减是**纯函数**，新逻辑保持纯函数形态。
26. **持久化只走 `src/db` 仓储层**（`selectAll` / `replaceAll`），SQL 与列名不出现在 `store.ts` 以外。改表结构要同时改 `src/db/schema.ts` 和 `src/db/client.ts` 的迁移 SQL。详见 [database.md](docs/conventions/database.md)。

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

## 目录结构

```
src/
  app/                    # 只放路由
    _layout.tsx           ThemeProvider + 根 Stack（index / (tabs) / onboarding / records）+ 通知初始化/同步
    index.tsx             分流：未看过引导页 → onboarding，否则 → 首页
    onboarding.tsx        首次启动引导页：放在 tab 组之外，全屏无 tab 栏
    records.tsx           服药记录：按日期查历史与当日服药率（界面待完善）；不占 tab 位，路径仍是 /records
    (tabs)/
      _layout.tsx         AppTabs（NativeTabs），trigger name 用组内相对路由名
      home/               今日：只有路由，实现见 src/screens/home（Expo UI 为主 + 三块 RN island）
      medica/             药品：index（只有路由）+ detail / form / add-options
      profile/            我的：index（只有路由）+ persons / person-detail / plan-form / language / settings
      playground/         调试屏：只有 __DEV__ 构建才在 tab 栏里出现
  screens/
    home/                 首页实现：index（Expo UI 为主：大字日期 / 成员筛选 Picker / 通知横幅 / 区块标题）+ stock-panel（库存速览，RN island）
    medica/               药品库实现：index（Expo UI 为主：副标题 + 数量徽章 / 药品卡）+ filter-row（分类 chip 横滑，RN island）
    profile/              我的实现：index（档案横排 / 本周概览 / 家庭成员 / 菜单）+ settings（设置页）
  db/
    schema.ts             Drizzle 表定义（snake_case 列名、索引）
    client.ts             开库 + 按 user_version 跑迁移
    repo.ts               仓储层：selectAll / replaceAll（全量快照，先插后删）
  i18n/
    provider.tsx          I18nProvider + useTranslation / useI18n / getTranslator
    languages.ts          Language 类型、设备语言归一、字典 lookup
    dictionaries/         zh.ts（基准）/ en.ts，键必须一一对应
  lib/
    store.ts              数据层：实体类型、SQLite 持久化、提醒生成、状态机、库存计算
    notifications.ts      通知层：权限、调度、操作按钮、响应处理、与 store 同步
    onboarding.ts         引导页"已看过"标记
  hooks/                  use-theme / use-color-scheme / use-onboarding-gate / use-expo-ui-content-width
  components/             app-tabs、avatar、progress-bar、dose-timeline、reminder-card-stack、round-icon-button、symbol-icon
  utils/color.ts          withAlpha：#rrggbb → rgba()，半透明叠色
  constants/theme.ts      颜色 / 字体 / 间距 / 圆角（唯一 token 来源）
docs/conventions/         本表指向的六份专题规范
design/                   HTML 设计稿（today、medications、add-medication、profile、settings）—— UI 的视觉基准
maestro/                  端到端测试流
ios/                      prebuild 产物；改 app.json 后需重新 prebuild
.oxlintrc.json / .oxfmtrc.json / .editorconfig   工具链配置
```

## 待办（改这些区域时留意）

- `records` 页：数据已采集，缺按日期的历史与依从率展示界面。它现在是 `src/app/records.tsx`（tab 组之外），**还没有进「我的」的入口**，要接上得在 `src/screens/profile/index.tsx` 的菜单列表里加一行 push `/records`。
- **`src/screens/medica/`（药品库）已按 design/medications.html 重做并在模拟器上跑通**（`maestro/medica.yaml` 全流程绿）：列表卡片/横滑分类筛选/搜索/详情/删除/空态都验过，`Stack.SearchBar` 在 `NativeTabs` 里的 tab 根屏上确实出了原生搜索框（项目里第一次用）。**真机发现并修了一个布局 bug**：`FieldGroup`（iOS 是 SwiftUI `Form`，本身就是滚动容器）和 `List` 嵌进外层 `ScrollView` 会塌成零高、区块内容直接消失 —— 详情页已改成普通行拼的分组卡片（`SectionCard`/`HairLine`，见 `detail.tsx`），**以后不要再往 `ScrollView` 里嵌 `FieldGroup`/`List`**。仍待看：系统大字号下卡片色条（`SPINE_HEIGHT` 写死）的居中表现、药名过长时 `numberOfLines={1}` 的截断、`MIGRATION_V3` 老库补列默认「慢性病」。
- **`src/screens/profile/` 已在模拟器上跑通**（`maestro/profile.yaml` 添加/详情/删除成员 + 菜单卡、`maestro/plan.yaml` 建配置全绿）：`index.tsx` 是 **Expo UI 为主的整屏**（`Host` + 原生 `ScrollView`，Mini Archive 与头像是 RN island）—— `containerWidth` 喂宽、三等分统计卡、菜单卡发丝线/徽章、圆形加号按钮都正常。**`persons.tsx` / `person-detail.tsx` 的 `<List>` 嵌在 `ScrollView` 里（与药品详情页同源的塌陷 bug）已按 `SectionCard` 改法修复**，`SectionCard`/`SectionTitle`/`HairLine` 提升为共享组件 `src/components/section-card.tsx`（medica 详情页同源引用）。plan-form 的 Picker（iOS menu）、通知权限弹窗、编辑回填也验过。仍需看：`settings.tsx`（自定义 `FieldGroup.SectionHeader` 与 `ListItem` leading 槽里的 `Icon`）整屏未跑；**plan 编辑页底部「删除该配置」按钮对 Maestro 合成 tap 不响应（SwiftUI Form 末行紧贴 tab 栏，同构造的保存键正常，属自动化怪癖）**，删除配置留手工验证、别为测试改 app；「我的」菜单里也没有进 `records` 的入口（见本表 `records` 条）。
- **Android**：日期选择已使用通用 `DateTimePicker`，其余通用屏幕的平台能力已隔离到 `src/components/native-layout.{ios,android}.tsx`；`android/` 目录尚未生成，仍需模拟器验证布局与交互。universal `Icon` 目前只给了 iOS SF Symbol 名，Android 要补 Material 图标（`Icon.select`）；导轨的虚线（`borderStyle: "dashed"`）在 Android 上也要实测。
- **`src/screens/home/index.tsx` 刚改成 Expo UI 为主的整屏**（`Host` + 原生 `ScrollView`），两块 RN island（提醒卡堆叠 / 库存速览）都靠 `useExpoUiContentWidth` 实测的 `containerWidth` 喂宽度。真机要重点看：牌堆是否满宽（宽度没喂对就直接塌）、`Row alignment="end"` 的巨型日期行是否与设计稿的 baseline 对齐、成员筛选的 `Picker`（`appearance="menu"`）在 iOS 上是否真的出原生菜单、通知横幅的 `Row` 在长文案下会不会挤。
- **`src/screens/home/dose-rail.tsx`（服药时间线导轨，约 950 行）已从首页摘掉、当前无人引用**，`src/screens/home/index.tsx` 不再导入它。它是纯 RN 树（导轨连接线要 `flex: 1`），里面的 `buildRail` 是纯函数适合单元测试。要恢复时间线就把 `DoseRailExpoUI` 接回首页；确认不要了就连文件带一批 i18n 词条（`home.timeline` / `home.doneCount` / `home.noSchedule*` / `home.gap*` / `home.snooze*` / `home.now` / `home.expand*`）一起删。
- 桌面 Widget：`expo-widgets` 已配置（app.json plugins），尚未实现。
- 单元测试：`store.ts` 的提醒生成 / 库存扣减是纯函数，适合优先覆盖。
- lockfile：`pnpm-lock.yaml` / `package-lock.json` 已废弃，确认后可删。
- **原生依赖已变更**：新增 `expo-sqlite` / `expo-localization`（app.json plugins 已自动登记）。iOS 端必须重新 `npx expo run:ios` 才会生效，Expo Go 跑不起来。
- **i18n 漏翻检查**：新增界面文案后确认 `zh.ts` / `en.ts` 键名一致（`bun run check` 只能查出「用了不存在的键」，查不出「en 缺翻译」）。两侧键数应始终相等。
