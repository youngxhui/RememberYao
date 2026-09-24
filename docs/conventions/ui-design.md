# UI 与设计系统

硬规则清单见 [`AGENTS.md`](../../AGENTS.md)。视觉基准是 `design/` 下的 HTML 设计稿。

## @expo/ui 优先

`@expo/ui` 渲染的是真原生视图（iOS SwiftUI / Android Jetpack Compose）。**不要**默认退回 RN 的 `View`/`Text`/`Switch`/`Picker`，也不要碰 `@gorhom/bottom-sheet`、Reanimated 手搓的 sheet 这类社区库。

选型阶梯，从上往下，第一个满足需求就停：

1. **universal 组件** —— 从 `@expo/ui` 根导入。一份源码同时跑 iOS / Android / web。
2. **平台专属** —— 从 `@expo/ui/swift-ui` 或 `@expo/ui/jetpack-compose` 导入。仅当 universal 层缺组件或缺 modifier，或确实需要平台特有行为时用。
3. **RN 内建** —— 仅当 `@expo/ui` 真的没有对应组件。

常见需求对照：

| 需求 | 用 |
| --- | --- |
| 底部弹出面板 | `BottomSheet` from `@expo/ui` |
| 设置页分组行 | `List` + `ListItem` from `@expo/ui` |
| 开关 | `Switch` from `@expo/ui` |
| 滑杆 | `Slider` from `@expo/ui` |
| 日期时间选择 | `@expo/ui/community/datetimepicker` |
| 菜单 | `Menu` from `@expo/ui` |
| 带 label 的表单分组 | `FieldGroup` from `@expo/ui` |
| 可折叠分组 | `Collapsible` from `@expo/ui` |

`@expo/ui` 的 `List` **不是虚拟化列表**：它渲染的是原生分组表格行（iOS 设置页那种观感），每个 `ListItem` 都是原生节点，不回收。只适合短小、长度固定的分组（设置页、详情面板行、固定菜单）。数据量大或长度不确定的列表（feed、搜索结果、目录）用 `FlatList` / `FlashList`。

## 平台专属组件隔离（最重要）

> **`@expo/ui/swift-ui` 是 iOS-only，`@expo/ui/jetpack-compose` 是 Android-only。**

危险程度分两档，**不要混为一谈**：

| 导入内容 | 在另一端运行会怎样 | 本项目现状 |
| --- | --- | --- |
| **原生视图组件**（`DatePicker`、`TabView`、`Switch`…） | 直接抛 `Unable to get view config` **崩溃** | `plan-form.tsx` 的 `DatePicker`、`onboarding.tsx` 的 `TabView` |
| **modifier 工厂**（`frame`、`buttonStyle`、`controlSize`…） | **不崩**，但被静默忽略 | 10 个文件的 17 处 `frame(...)` |

modifier 工厂是纯 JS —— `frame(params)` 只是 `return { $type: "frame", ...params }`（见 `createModifier`），零原生依赖。所以在 Android 上 import 它不会崩，但传给 Compose 的是它不认识的 modifier，**布局会静默失效**（比如 `maxWidth: Infinity` 不再撑满宽度）。这比崩溃更隐蔽，同样必须隔离。

**本项目当前 12 处违规**：10 个文件导入 `@expo/ui/swift-ui/modifiers`，2 个文件导入原生组件。项目目前只构建 iOS（没有 `android/` 目录），所以还没暴露，但这是 Android 化的第一道坎。oxlint 的 `no-restricted-imports` 会给出 warn。

正确做法：

1. **优先改成 universal 组件**，直接消灭问题。universal 组件自带 `style`（`UniversalStyle`：padding / backgroundColor / borderRadius / width / height 等）和 `modifiers` prop，能覆盖大部分 `frame` 的用途。
2. 必须用平台专属能力时，拆成平台文件：
   ```
   src/components/
     bar-chart.tsx          # 默认文件，必须有；单平台时可做成 no-op
     bar-chart.ios.tsx      # @expo/ui/swift-ui
     bar-chart.android.tsx  # @expo/ui/jetpack-compose
   ```
   - 导入时不带扩展名，Metro 自动按目标平台挑选。
   - **props 在所有变体间必须完全一致。**
   - **平台文件不能放在 `app/` 里** —— Expo Router 不支持路由文件的平台扩展名。
   - `.ios.tsx` 里禁止 import `jetpack-compose`，反之亦然（oxlint 对这两类文件已设为 error）。
3. 或者在一个普通文件里用 `process.env.EXPO_OS` 守卫分支。

> **注意两端 modifier 名称完全不同**，没有一一对应：SwiftUI 用 `frame` / `listRowInsets` / `buttonStyle`，Compose 用 `fillMaxWidth` / `fillMaxSize` / `size` / `padding`。所以**不能**简单地把 `frame({ maxWidth: Infinity })` 换成 `fillMaxWidth()` 就收工 —— 要先想清楚语义意图（"撑满可用宽度"）再分别实现。这也是 modifier 隔离比看起来更费工的原因。

另外：**`Host` 永远从 `@expo/ui` 根导入**，不要从平台子包里拿。

## RN 视图进 Expo UI 树

必须在 Expo UI 树里用 RN 视图时，用 `RNHostView` 包裹；涉及固有尺寸、父容器宽度、折叠/展开或 `matchContents` 时，同时阅读 [`expo-ui-layout.md`](expo-ui-layout.md)。

```tsx
import { RNHostView } from "@expo/ui";
import { Text as RNText, View as RNView } from "react-native";
```

现有范例：`src/components/avatar.tsx`（圆形头像）、`src/components/progress-bar.tsx`（进度条）。

**从 `react-native` 导入的 UI 组件一律加 `RN` 前缀**，与 Expo UI 的同名组件区分。非 UI 的 API（`Platform`、`AppState`、`Linking`、`useColorScheme`）不加前缀。

## 屏幕骨架

```tsx
const theme = useTheme();
return (
  <>
    <Stack.Title large>标题</Stack.Title>
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button onPress={...}>
        <Stack.Toolbar.Icon sf="plus" />
        <Stack.Toolbar.Label>添加</Stack.Toolbar.Label>
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
    <Host seedColor={theme.primary} style={{ flex: 1 }}>
      <ScrollView>{/* Column / Row / Text … */}</ScrollView>
    </Host>
  </>
);
```

- 标题一律走 `Stack.Title`（`large` 尺寸），**不要在页面里自己写大标题 Text**。导航栈标题是屏幕的顶层 chrome。
- `Host` 的 `seedColor` 传 `theme.primary`，让原生组件跟随品牌色。

## 主题 token

`src/constants/theme.ts` 是**唯一**来源，`src/hooks/use-theme.ts` 的 `useTheme()` 是唯一入口。

```ts
const theme = useTheme();
```

- **禁止硬编码颜色、字号、间距**。出现两次以上的视觉值都必须进 theme。
- 语义色：`primary`（品牌/主按钮/激活 tab）、`success`（已服）、`warning`（即将到期）、`danger`（漏服），各自带 `*Soft` 底色变体。
- 间距用 `Spacing`，底部 tab 遮挡补偿用 `BottomTabInset`。
- 图标不要用 emoji。iOS 用 SF Symbol，Android 用 Material icon。

### 现状与官方建议的差异（待收敛）

当前 `theme.ts` 是手写的 light/dark 两张 hex 表，`Spacing` 用 `half/one/two/three...` 命名。Expo 官方现在的推荐是用 `Color` from `expo-router`（`Color.ios.label` / `Color.android.dynamic.onSurface`）拿平台语义色，语义色会在设备上自动适配明暗，省掉维护两张表。

**按「既有系统即事实标准」原则，不要另建第二套 token**，也不要为此重构现有颜色。收敛方向是渐进的：新增屏幕时，能用 `Color.ios.*` / `Color.android.dynamic.*` 表达的背景/文字/分隔线就改用语义色，品牌色（primary/success/warning/danger 及其 Soft 变体）保留现有 hex 表。

## 组件契约

`src/components/` 里的每个设计系统组件都显式定义四件事：

- **variants** —— 视觉意图：`primary` / `secondary` / `ghost` / `destructive`。只有真实屏幕需要时才加。
- **sizes** —— `sm` / `md` / `lg`，默认 `md`。尺寸映射到 token，不写新数字。
- **states** —— default、**pressed**（不是 hover）、disabled、loading。
- **style 覆盖** —— 接 `style` prop 且**最后合并**，让调用方能调布局而不必 fork 组件。调用方可以覆盖布局，不能覆盖身份 —— 如果一个调用方想改按钮颜色，说明 variant 集合缺了东西。

无障碍：自定义交互组件暴露 `accessibilityRole` 和 `accessibilityState`。纯图标控件和加载中替换文字为 spinner 的按钮必须有显式 `accessibilityLabel`，且 loading 期间标签仍然可用。

### 组合优于配置

当组件的 props 开始描述**内容**（`leftIcon`、`subtitle`、`footerText`、`badgeCount`），停止加 prop，改用 `children`。一个渲染 `children` + token padding 的 `Card` 比带 12 个内容 prop 的 `Card` 活得久。props 只留给上面那四件事。

## 什么时候抽公共组件

**三个条件全部满足**才提升到 `src/components/`：

1. 已经（或即将）出现在 **两个及以上屏幕**。
2. 有**可命名的角色**（"Card"、"EmptyState"、"Badge"），而不是"profile 页那个东西"。
3. 它的 API **小于实现** —— 如果 props 只是把内部样式重新暴露一遍，说明它是屏幕片段，不是可复用组件。

升级路径，一步一步来，触发条件满足才走：

> 内联 JSX → `src/screens/<name>/` 下的私有组件 → `src/components/`

不要提前抽象。错误的抽象比重复代价更高 —— 一份视图抄两遍，比一个 API 设计糟糕的 primitive 便宜。

**不要**把已经自带设计语言的原生组件（`Switch`、`DateTimePicker`、stack header、`@expo/ui` 的视图）再包一层接到系统里。对它们来说，原生样式就是设计系统。

## useNativeState：universal 导入下只能用 .value

`@expo/ui` 的 `useNativeState` 返回一个 native-backed 的可变对象（`ObservableState`），行为类似 ref。

**注意两种导入的类型面不同：**

| 导入 | 可用 API |
| --- | --- |
| `@expo/ui`（universal，本项目用法） | 只有 `.value` |
| `@expo/ui/swift-ui`（iOS-only） | `.value` + `.get()` / `.set(value)` |

官方对 `.get()`/`.set()` 的说明是"a React Compiler compliant alternative to reading/writing `.value`"—— 但那套方法**只存在于 swift-ui 包的类型里**。本项目从 `@expo/ui` 根导入（这正是规范要求的），所以**只能用 `.value`**：

```tsx
const restockAmount = useNativeState("");

// 正确（universal 导入的唯一 API）
restockAmount.value = "";

// 类型错误：Property 'get' does not exist on type 'ObservableState<string>'
restockAmount.set("");
```

### 为什么 oxlint 还报 react(immutability)

`react(immutability)` 规则会拦「修改 hook 返回值」。它在这里是**误报**：

- `useNativeState` 返回的就是可变原生状态对象，写 `.value` 是既定用法（等同于 ref）。
- 项目在 `app.json` 里开了 `reactCompiler`，该规则确实会让 React Compiler 放弃优化这些组件，但 universal 导入下没有合规替代写法。
- 已在 `.oxlintrc.json` 对 `persons.tsx` / `plan-form.tsx` / `medica/detail.tsx` / `medica/form.tsx` 关闭该规则，并注明原因。

**若将来把 `useNativeState` 改从平台包导入**（配合 `.ios.tsx`/`.android.tsx` 拆分），应同时改用 `.get()`/`.set()` 并移除对应 overrides。

另注意：从 JS 线程写 `.value` 是**异步**排到 UI 线程的，写完不会立刻读到新值；需要同步更新时从 worklet 里写。

## 界面四态

每个加载数据的屏幕都有四个状态：**loading / error / empty / content**。规则：

- **首屏加载还没结束时不显示 empty 态** —— 空列表闪一下再刷出内容是最常见的 AI 感。
- 每个可用的控件都必须真的做事：搜索要能过滤、保存要真的提交、开关要影响行为。空 handler 和"保存成功"提示不是实现。
- 异步保存要保留草稿、处理 pending/failure 态，**保存成功前不要关闭表单**。

## 原生感反模式（native slop）

| 名字 | 症状 | 改成 |
| --- | --- | --- |
| The Web Modal | 用自制定居中弹窗做选择/编辑 | 原生 sheet（`formSheet`、`@expo/ui` BottomSheet）；确认类动作用原生 alert |
| Everything's a Card | 每一行每一节都装进白底圆角阴影盒子 | 分组列表；用底色和发丝线分组，不用边框 |
| Emoji Iconography | 🔥⚙️✨ 当 tab/按钮图标 | SF Symbols / Material icon |
| The Purple-Gradient Hero | 装饰性渐变头图把任务推到首屏外 | 任务屏直接上有效内容 |
| The Spinner Blink | 每个状态之间全屏转圈，首屏加载时闪"No items yet" | 见上面「界面四态」 |

这些是检查提示，不是一刀切禁令 —— 卡片、字体、品牌色本身没问题，要修的是那个可观察的问题，同时尊重用户需求和既有设计稿。

## 完成前自查

改完一个屏幕，截图对照四条原则（每条对应一个系统级修法，不是局部微调）：

- **层级/对比** —— 最重要的元素是不是一眼第一？用 `type` 字阶修，不要现调字号。
- **邻近/留白** —— 相关项是否比不相关的更靠近？用 `gap` + spacing token 修。
- **重复/统一** —— 所有圆角、阴影、强调色是否一致？有值逃出了 theme 就收回去。
- **对齐** —— 边缘是否共享轴线？统一屏幕左右边距。

改完一个值要重新看渲染结果；把它挪进 theme 本身不会修好布局。同类缺陷在多个屏幕反复出现时，修共享 token 或组件，不要逐个屏幕打补丁。

另外要走一遍主任务流程（含一次失败与恢复），检查键盘唤出与返回/关闭行为，试长标题、缺图、无搜索结果、系统大字号 —— 必要操作必须仍然可达。报告你验证了什么、什么没跑。
