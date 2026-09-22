# 代码风格与命名

规范来源：Expo 官方 skills（`.agents/skills/expo-native-ui`、`expo-project-structure`）+ 本项目实际约定。
硬规则清单见 [`AGENTS.md`](../../AGENTS.md)。

## 工具链：oxlint + oxfmt

本项目**不使用 ESLint / Prettier**，改用 Rust 实现的 [oxlint](https://oxc.rs/) 与 oxfmt。

选型理由（2026-09 实测）：

- ESLint 10.11 与 `eslint-config-expo@57` 依赖的 `eslint-plugin-react@7.37.5` 不兼容（后者 peer 上限 `^9.7`），`expo lint` 直接崩在 `react/display-name`。留在 ESLint 就得把版本钉死在 9.x。
- 速度差异让「保存时检查 / 提交前检查」变得可行：本项目 30 个源文件，**oxlint 14ms**、**oxfmt 6ms**、`tsc --noEmit` 1.1s。

配置文件：

| 文件 | 作用 |
| --- | --- |
| `.oxlintrc.json` | 规则、插件、overrides、ignorePatterns（JSONC，可写注释） |
| `.oxfmtrc.json` | 格式化参数 + `sortImports` + ignorePatterns |
| `.editorconfig` | 编辑器级兜底（UTF-8、LF、2 空格、末尾换行） |

命令：

```bash
bun run lint          # oxlint
bun run lint:fix      # oxlint --fix
bun run format        # oxfmt --write .
bun run format:check  # oxfmt --check .
bun run typecheck     # tsc --noEmit
bun run check         # 三者串跑，提交前必过
```

### 格式化参数

双引号、`trailingComma: all`、`printWidth: 80`、`tabWidth: 2`、`arrowParens: always`、`endOfLine: lf`。
与原 Prettier 配置一致（`oxfmt --migrate=prettier` 迁移而来），因此历史代码无需重排。

`sortImports: true` —— oxlint **没有实现 `import/order`**，导入排序统一交给 oxfmt。分组顺序为：外部包 → 内部别名（`@/*`）→ 相对路径，组内按字母序。**不要手工调整导入顺序**，跑 `bun run format` 即可。

### 不参与格式化的路径

`*.md`、`ios/`、`android/`、`assets/`、`design/`、`maestro/`、`.agents/`、`.claude/`、各 lockfile。

`*.md` 被排除是有意的：oxfmt 按 ASCII 单宽字符补齐 Markdown 表格列宽，中文是双宽字符，格式化后表格对齐会错乱。

### oxlint 已启用的插件

`import`、`oxc`、`promise`、`react`、`react-perf`、`typescript`、`unicorn`。
分类：`correctness` = error，`suspicious` = warn。

两处刻意的调整：

- `react/react-in-jsx-scope` **关闭** —— React 17+ 自动 JSX runtime 不需要 `React` 在作用域内，开着会产生 300+ 误报。
- `react/immutability` **保持 error** —— 项目在 `app.json` 里开了 `reactCompiler`，这条规则能抓到 React Compiler 无法优化的写法（详见 [ui-design.md](./ui-design.md#usenativestate-必须用-getset)）。

### 从 ESLint 换过来丢掉的规则

`eslint-plugin-expo` 只有 4 条规则，oxlint 没有对应实现。其中与本项目相关的用 grep 自查：

```bash
# prefer-box-shadow：禁止 legacy shadow* / elevation，统一用 boxShadow
grep -rn "shadowColor\|shadowOffset\|shadowOpacity\|shadowRadius\|elevation:" src/

# no-dynamic-env-var / no-env-var-destructuring：EXPO_PUBLIC_* 必须静态访问
grep -rn "process\.env\[" src/ ; grep -rn "const {.*} = process\.env" src/
```

另外两条（`use-dom-exports`）与本项目无关（无 web-only 代码）。

## TypeScript

- `strict: true`，继承 `expo/tsconfig.base`。不要放宽。
- **优先用路径别名而非相对路径**：`@/*` → `./src/*`，`@/assets/*` → `./assets/*`。别名在重构时不会失效。
- `typedRoutes` 已开启：`<Link href>` / `router.push()` 的路由字符串由 TS 校验，不要写 `as any` 绕过。
- 类型导入用 `import { type Foo }` 或 `import type { Foo }`。

## 命名

| 对象 | 规则 | 例 |
| --- | --- | --- |
| 文件名 | **kebab-case** | `dose-timeline.tsx`、`use-theme.ts` |
| 组件 | PascalCase | `DoseTimeline`、`ProgressBar` |
| Hook | `use` 前缀 camelCase | `useAppData`、`useOnboardingGate` |
| 常量 | UPPER_SNAKE_CASE | `GRACE_MINUTES`、`LEGACY_MEDICINES_KEY` |
| 类型 | PascalCase，不加 `I` 前缀 | `MedicationPlan`、`ReminderStatus` |
| 平台变体文件 | 同名 + 平台后缀 | `bar-chart.tsx` / `bar-chart.ios.tsx` / `bar-chart.android.tsx` |

文件名禁止特殊字符。路由文件重命名或移动后**必须删掉旧文件**，否则会残留一个可访问的死路由。

## 语言约定

- **注释、UI 文案、提交信息用中文**；标识符用英文。
- 注释只解释「为什么」：业务规则、隐藏约束、非显然的坑。不复述代码在做什么。
- 提交信息风格参考 `git log`（如「基本骨架」「项目初始化」）。

## 组件与样式写法

- 函数组件 + hooks，不用 class 组件。
- 屏幕默认导出（`export default function XxxScreen()`），共享组件具名导出。
- **优先内联样式**；同一段样式被复用两次以上时才提取到文件底部的 `StyleSheet.create({})`。不要建独立的 `.styles.ts` 文件。
- 圆角配 `borderCurve: "continuous"`（胶囊形除外）。
- 阴影用 CSS `boxShadow` 字符串，**禁止** legacy 的 `shadowColor/shadowOffset/shadowOpacity/shadowRadius/elevation`。
- 布局优先 flex `gap`，其次 `padding`，最后才是 `margin`。
- `ScrollView` 的内边距写在 `contentContainerStyle` 上，不要写在 `ScrollView` 自身（会被裁切）。

## 库选择偏好

用左边，不用右边：

| 用 | 不用 |
| --- | --- |
| `process.env.EXPO_OS` | `Platform.OS` |
| `React.use(Ctx)` | `React.useContext(Ctx)` |
| `Color` from `expo-router` | 裸 `PlatformColor` |
| `expo-symbols` 的 `SymbolView` | `@expo/vector-icons` |
| `expo-image` 的 `Image` | 内建 `<img>` |
| `react-native-safe-area-context` | RN `SafeAreaView` |
| `expo-audio` / `expo-video` | `expo-av` |
| `@react-native-async-storage/async-storage` | RN `AsyncStorage`（已移除） |
| `expo-router/react-navigation` | `@react-navigation/*`（oxlint 已拦截） |
| `FlatList` / `FlashList`（长列表） | `@expo/ui` 的 `List`（不虚拟化） |
| `useWindowDimensions()` | `Dimensions.get()` |

`Platform.OS` → `process.env.EXPO_OS` 的原因：后者是编译期常量，Metro 会直接做死代码消除，平台专属分支不会被打进另一端的包里。

RN 已移除的模块一律不许用：`Picker`、`WebView`、`SafeAreaView`、`AsyncStorage`。oxlint 的 `no-restricted-imports` 会拦截。

## 响应式与安全区

- 有滚动内容的屏幕包在 `ScrollView` 里；根节点是 `FlatList`/`FlashList` 的屏幕**不要**再套一层 `ScrollView`（列表自己就是滚动容器）；全屏铺满的（相机、地图、canvas）两者都不需要。
- 用 `contentInsetAdjustmentBehavior="automatic"` 而不是 `SafeAreaView`。`FlatList` / `SectionList` 同样要加。
- Stack 路由里有滚动内容时，`ScrollView` 必须是路由内的第一个组件，并带 `contentInsetAdjustmentBehavior="automatic"`。
- 上下安全区都要考虑到；底部被 tab 栏遮挡时用 `BottomTabInset`（`src/constants/theme.ts`）。

## 无障碍与交互细节

- 可点击元素必须有 pressed 反馈（`Pressable` 的 style 函数），**不是 hover** —— 这是触屏。
- 自定义交互组件要暴露 `accessibilityRole` 和 `accessibilityState`（disabled / busy / selected）。纯图标控件必须有显式 `accessibilityLabel`。
- 展示数据或错误信息的 `<Text>` 加 `selectable`。
- 计数器类数字用 `fontVariant: "tabular-nums"` 对齐。
- 不要全局关 `allowFontScaling`。文本要能跟随系统字号放大，行高用 `padding` / `minHeight` 而不是固定高度。
- 可滚动表单和搜索结果加 `keyboardShouldPersistTaps="handled"`。
- 表单主操作按钮不能被键盘挡住。需要跟随键盘真实位置时加载 `expo-animation` skill 的 keyboard recipe（用 `react-native-keyboard-controller`），**不要**用 `Keyboard.addListener` + 定时动画。
