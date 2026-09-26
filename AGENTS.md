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
| 数据 | `@react-native-async-storage/async-storage`，全量 JSON 存本地 |
| 通知 | `expo-notifications`（本地调度 + 通知栏操作按钮） |
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
maestro test maestro/mvp_flow.yaml     # 端到端主流程
maestro test maestro/main_layout.yaml  # Tab 布局
maestro test maestro/add_medica.yaml   # 添加药品
```

**必须使用 development build**（`expo run:ios` / `run:android`），Expo Go 跑不起来 —— 依赖 `expo-notifications`、`expo-widgets` 等原生模块。新增任何原生依赖后都要重新 prebuild + 构建。

包管理器：**bun**（`bun.lock` 是唯一权威 lockfile）。仓库里残留的 `pnpm-lock.yaml`、`package-lock.json` 已废弃，装依赖只用 bun，不要新增/更新其他 lockfile。

## 硬规则

### UI

1. **优先用 `@expo/ui`**，它渲染的是真原生视图（iOS SwiftUI / Android Jetpack Compose）。不要默认退回 RN 的 `View`/`Text`/`Switch`/`Picker`，不要用 `@gorhom/bottom-sheet` 或 Reanimated 手搓 sheet。
2. **`@expo/ui/swift-ui` 是 iOS-only，`@expo/ui/jetpack-compose` 是 Android-only**。导入**原生视图组件**（`DatePicker`/`TabView`/`Switch`）到另一端会抛 `Unable to get view config` 崩溃；导入 **modifier 工厂**（`frame`/`buttonStyle`）不崩但会被静默忽略，导致布局失效。平台专属组件必须放进 `.ios.tsx` / `.android.tsx`（放 `src/components/`，**不能放 `app/`**），或用 `process.env.EXPO_OS` 守卫。已有 universal / community 组件时直接使用（如 `DateTimePicker`）；确需平台隔离的能力统一从 `@/components/native-layout` 导入，oxlint 会以 error 拦截直接跨平台导入。详见 [ui-design.md](docs/conventions/ui-design.md#平台专属组件隔离最重要)。
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
12. 每个 stack 用 `_layout.tsx` 定义，`Stack` 从 `expo-router/stack` 导入。Tab 用 `expo-router/native-tabs` 的 `NativeTabs`（**不要**用 `unstable-native-tabs`），配置集中在 `src/components/app-tabs.tsx`。
13. 标题一律 `Stack.Title`，不要在页面里自己写大标题。搜索用 `Stack.SearchBar`。
14. 跳转用 `<Link href>`；尽量配 `<Link.Preview>` 和 `<Link.Menu>`。模态用 `presentation` 选项，不要自己写 modal 组件。
15. **禁止直接 import `@react-navigation/*`**，用 `expo-router/react-navigation`（oxlint 已拦截）。
16. 路由文件**必须 kebab-case**，禁止特殊字符；移动/重命名后删掉旧文件。
17. `typedRoutes` 已开启，路由字符串由 TS 校验，不要用 `as any` 绕过。
18. 新组件放 `src/components/`（kebab-case）。只在单个屏幕用的大块 UI 先 colocate 在 `src/screens/<name>/`，满足"两个屏幕复用 + 有可命名的角色 + API 小于实现"才提升到 `src/components/`。**不要**为了对齐官方结构重构现有屏幕。

### 数据层

19. **屏幕永远不直接碰 AsyncStorage**。所有状态和持久化集中在 `src/lib/store.ts`。
20. 读取用 `useAppData()`，屏幕在 `useFocusEffect` 里调 `reload()`。
21. **日期/时间用字符串**：日期 `YYYY-MM-DD`，时间 `HH:MM`，时间戳 ISO。比较时间用 `localeCompare`，**不要引入日期库**。
22. `MedicationUsage` 的 `personName` / `medicationName` / `time` 是**快照**，删除药品或用药人不清除历史。新增字段保持这个不可变性。
23. **任何写操作后必须经 `setPostMutationHook` 触发 `syncNotificationsWithStore()` 重排通知**，不要绕过。
24. 提醒状态机 `pending → taken / skipped / missed`；**超过 1 小时宽限期**未处理才判 `missed`，漏服可补服（`late: true`）。
25. `store.ts` 的提醒生成、库存扣减是**纯函数**，新逻辑保持纯函数形态。

### 代码

26. 注释、UI 文案、提交信息用**中文**，标识符用英文。注释只解释「为什么」（业务规则、非显然约束），不复述代码。
27. 文件名 **kebab-case**；组件 PascalCase；hook `use` 前缀；常量 UPPER_SNAKE_CASE。
28. **优先用路径别名 `@/*`**，不要写相对路径。
29. **不要手工调整导入顺序** —— oxfmt 的 `sortImports` 负责，跑 `bun run format`。
30. 函数组件 + hooks，不用 class 组件。屏幕默认导出，共享组件具名导出。
31. 优先内联样式；同一段样式复用两次以上才提到文件底部的 `StyleSheet.create`。
32. 用左边不用右边：`process.env.EXPO_OS` 而非 `Platform.OS`；`React.use` 而非 `React.useContext`；`Color` from `expo-router` 而非裸 `PlatformColor`；`expo-symbols` 而非 `@expo/vector-icons`；`react-native-safe-area-context` 而非 RN `SafeAreaView`；`useWindowDimensions()` 而非 `Dimensions.get()`。
33. **禁止 RN 已移除的模块**：`Picker`、`WebView`、`SafeAreaView`、`AsyncStorage`。oxlint 会拦截。
34. 安全区用 `contentInsetAdjustmentBehavior="automatic"`，不要用 `SafeAreaView`。`ScrollView` 的内边距写 `contentContainerStyle`。
35. 每个加载数据的屏幕要有 **loading / error / empty / content** 四态，**首屏加载没结束时不显示 empty 态**。
36. 可滚动表单加 `keyboardShouldPersistTaps="handled"`；表单主操作不能被键盘挡住。
37. 提交前跑 `bun run check`（typecheck + lint + format:check）。当前基线为 0 errors / 0 warnings。

## 目录结构

```
src/
  app/                    # 只放路由
    _layout.tsx           ThemeProvider + AppTabs + 通知初始化/同步
    index.tsx             分流：未看过引导页 → onboarding，否则 → 首页
    (tabs)/
      home/               今日：进度、用药时间线、库存速览；含 onboarding.tsx
      medica/             药品：列表 / detail / form / add-options
      records/            记录：按日期查看服药记录与当日服药率（界面待完善）
      profile/            我的：persons / plan-form / person-detail
  lib/
    store.ts              数据层：实体类型、AsyncStorage 持久化、提醒生成、状态机、库存计算
    notifications.ts      通知层：权限、调度、操作按钮、响应处理、与 store 同步
    onboarding.ts         引导页"已看过"标记
  hooks/                  use-theme / use-color-scheme / use-onboarding-gate
  components/             app-tabs、avatar、progress-bar、dose-timeline、external-link
  constants/theme.ts      颜色 / 字体 / 间距（唯一 token 来源）
docs/conventions/         本表指向的四份专题规范
design/                   HTML 设计稿（today、medications、add-medication、profile、settings）—— UI 的视觉基准
maestro/                  端到端测试流
ios/                      prebuild 产物；改 app.json 后需重新 prebuild
.oxlintrc.json / .oxfmtrc.json / .editorconfig   工具链配置
```

## 待办（改这些区域时留意）

- `records` 页：数据已采集，缺按日期的历史与依从率展示界面。
- **Android**：日期选择已使用通用 `DateTimePicker`，其余通用屏幕的平台能力已隔离到 `src/components/native-layout.{ios,android}.tsx`；`android/` 目录尚未生成，仍需模拟器验证布局与交互。
- 桌面 Widget：`expo-widgets` 已配置（app.json plugins），尚未实现。
- 单元测试：`store.ts` 的提醒生成 / 库存扣减是纯函数，适合优先覆盖。
- lockfile：`pnpm-lock.yaml` / `package-lock.json` 已废弃，确认后可删。
