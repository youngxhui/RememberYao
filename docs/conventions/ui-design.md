# UI 与设计系统

硬规则清单见 [`AGENTS.md`](../../AGENTS.md)。视觉基准是 `design/` 下的 HTML 设计稿。

## 选型阶梯：内容树默认 Tamagui

> **2026-10 起 `@expo/ui` 不再是默认画布。** 生产内容树先迁到 RN Yoga + `useTheme()`，2026-10-19 再迁到 Tamagui，
> 见 `docs/plans/迁移计划.md`。`@expo/ui` 在生产屏只剩两处合法残留：`onboarding.tsx` 的整屏
> `TabView` pager、孪生铝箔岛的 `nativeGradientBackground`（菜单 `Picker` 已于 2026-10-16
> 换成 `RnPicker`，`ExpoUiIsland` 生产零调用）。
> **新屏一律用 RN 写**，不要再写整屏 `Host`+`Column`+`ScrollView`。

选型阶梯，从上往下，第一个满足需求就停：

1. **系统 chrome** —— `NativeTabs` / `Stack.Title` / `Toolbar` / `SearchBar`。系统自带 iOS 26 液态玻璃，不拆。
2. **内容树** —— Tamagui 的 `View`/`Text`/`XStack`/`YStack`/`Button` + token 名；骨架用 `ScreenScaffold`（+ `Padded` / `FullBleed`），分组用 `SectionCard` / `SectionTitle` / `HairLine`。写法见下面 [Tamagui 用法](#tamagui-是默认-ui-层)。
3. **内容玻璃** —— `@/components/glass-chip` 的 `GlassChip` / `GlassChipRow`，`@/components/glass-host-button` 的 `GlassHostButton`。**屏幕禁止直接 import `expo-glass-effect`**。
4. **原生控件小岛** —— 菜单 `Picker` 已清零：`@expo/ui` 的 universal `Picker` 的 `appearance` 默认就是 `'menu'`（iOS 落成 SwiftUI `.pickerStyle(.menu)` 原生 Menu 胶囊，**不吃 RN `style`** 还必须住在 `Host` 里），twin / plan-form / settings 的 5 处已全部换成 `@/components/rn-picker` 的 `RnPicker`。`ExpoUiIsland`（RN 父树挂 `@expo/ui` 原生控件的边界封装）已随之删除 —— 它生产零调用，留着只会诱使新屏往 RN 树里塞 `Host`。真绕不过时再新建最小 `Host matchContents` 岛，并写清为什么 RN 做不到。
5. **sheet** —— `@lodev09/react-native-true-sheet`（真原生 sheet：iOS `UISheetPresentationController` / Android `ModalBottomSheet`）。**不要**用 `@expo/ui` 的 `BottomSheet`（已弃用）、`@expo/ui/community/bottom-sheet`（default export 挂载即打开）、`@gorhom/bottom-sheet`（JS 渲染，视觉对不齐系统）。

`flex` 是当年 `@expo/ui` 唯一的硬缺口（universal `style` 只映射 SwiftUI/Compose 固定属性），
迁到纯 RN 后这个缺口不存在了 —— 导轨连接线、行内 `flex: 1` 的文字、Reanimated 绝对定位的
牌堆现在都直接长在 RN 树上。

常见需求对照：

| 需求 | 用 |
| --- | --- |
| 底部弹出面板 | `@lodev09/react-native-true-sheet` |
| 设置页 / 详情分组行 | `SectionCard` + 自排行（`tone="fill"` 灰卡片 / `tone="outline"` 灰底上的白卡片） |
| 开关 | RN `Switch`（`trackColor` / `thumbColor` 走 theme token；oxlint 的禁用规则面向 Expo UI 屏，纯 RN 屏单行豁免并注明原因） |
| 日期时间选择 | `@/components/rn-datetime-picker` |
| 菜单（选项 ≤ 6） | `@/components/rn-picker` 的 `RnPicker`（胶囊触发器 + **原生菜单**：`@react-native-menu/menu`，iOS `UIMenu` / Android `PopupMenu`） |
| 玻璃按钮 | `@/components/glass-host-button` 的 `GlassHostButton` |
| 普通按钮 | Tamagui `Button`（直接 import，没有项目封装），配色抄 [Tamagui 用法](#tamagui-是默认-ui-层) 里的四档表 |
| 真原生菜单 | `@react-native-menu/menu` —— 已装，但**只经 `RnPicker` 用**，不要在别处直接 import |
| 表单输入 | `InputShell`（只有文字输入套盒，原生自绘控件裸放） |
| 长列表 | `FlatList` / `FlashList` |

`@expo/ui` 的 `List` 渲染的是**原生列表行**（iOS 是 SwiftUI `List`，Android 是 Compose `LazyColumn`，两端都是懒加载容器），行内排版受原生行的槽位约束，且 universal 层没有分组头 / 滑动操作 / 多选等高阶列表能力。适合短小、长度固定的分组；数据量大或形态不确定的列表仍用 `FlatList` / `FlashList`。⚠️ 它和 `FieldGroup` 自己都是滚动容器，**嵌进外层 `ScrollView` 会塌成零高**（真机 bug，勿再犯）。

## 平台专属组件隔离

> **2026-10-16 起 `@expo/ui` 已从项目移除**（迁移计划 §6.9），下面整套「swift-ui / jetpack-compose
> 不能跨平台混用」的约束随之失效。保留它是为了记住**为什么不再引回来**，以及给以后新引的
> 平台专属依赖当反面教材。

历史约束（`@expo/ui` 时代）：`@expo/ui/swift-ui` 是 iOS-only、`@expo/ui/jetpack-compose` 是
Android-only，危险程度分两档，不能混为一谈：

| 导入内容 | 在另一端运行会怎样 |
| --- | --- |
| **原生视图组件**（`DatePicker`、`TabView`、`Switch`…） | 直接抛 `Unable to get view config` **崩溃** |
| **modifier 工厂**（`frame`、`buttonStyle`、`controlSize`…） | **不崩**，但被静默忽略 |

modifier 工厂是纯 JS —— `frame(params)` 只是 `return { $type: "frame", ...params }`，零原生依赖。
所以在 Android 上 import 它不会崩，但传给 Compose 的是它不认识的 modifier，**布局会静默失效**
（比如 `maxWidth: Infinity` 不再撑满宽度）。这比崩溃更隐蔽。

当年承接隔离的 `src/components/native-layout.{ios,android}.tsx` 适配层已随 `@expo/ui` 一并删除。

**现存的平台差异只有三处**，都在 `src/components/`：

| 文件 | 差异 |
| --- | --- |
| `toolbar-icons.{ts,android.ts}` | `Stack.Toolbar` 的 `icon` prop 只认 SF Symbol / 图片源，Android 要 `@expo/material-symbols` 的 `.xml` |
| `symbol-icon.tsx` | `SymbolView` 的 `name` 收 `{ ios, android }` 双平台名，Android 是 Material Symbols 字形名 |
| `rn-datetime-picker.tsx` | iOS compact 直接渲染；Android 挂载即弹，必须「点按才挂载对话框」 |

### universal 层覆盖不到时，先想清楚值不值得拆

除了 modifier 名称不通约，**同一件 UI 在两端的原生组件也可能完全不是同一个东西**（分段筛选：iOS 是 `Picker` + `pickerStyle('segmented')`，Android 是 `SingleChoiceSegmentedButtonRow` + `SegmentedButton`，props 也要自己抹平）。拆之前先问一句值不值得：

- **universal 层的选项枚举可能本来就够用。** 成员筛选试过拆平台分段控件，最终退回 universal `Picker appearance="menu"` —— segmented 到 4 段以上每段被压成细条，而成员数量不可控；菜单只占一行、选项还能纵向滚动。（首页的成员筛选后来挪进了系统工具栏右上角的 `Stack.Toolbar.Menu`，「选项多、每项有名字就用菜单而不是分段控件」的结论不变；但 **2026-10-16 起菜单也不再直接用 `@expo/ui` 的 `Picker`** —— 它不吃 RN `style` 还必须住 `Host`，plan-form / twin / settings 的 5 处已换成 `RnPicker`，见迁移计划 §6.7。）
- **平台专属路径无法用静态检查验证。** `android/` 目录生成后，拆出去的 Android 实现仍只能在真机上验。

所以定位是：**universal 能满足就用 universal，实在满足不了（比如 `TabView`、SwiftUI 独有的 `.insetGrouped`）才拆**。拆之前读 `node_modules/@expo/ui/src/universal/<组件>/types.d.ts` 确认选项真的没有 —— 包里的类型比文档更权威。

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
// addIcon 来自 @/components/toolbar-icons（iOS SF Symbol / Android 矢量图，见「主题 token」图标一节）
return (
  <>
    <Stack.Title large>标题</Stack.Title>
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button icon={addIcon} accessibilityLabel="添加" onPress={...}>
        <Stack.Toolbar.Label>添加</Stack.Toolbar.Label>
      </Stack.Toolbar.Button>
    </Stack.Toolbar>

    <ScreenScaffold>
      <Padded>{/* View / Text / Pressable / FlatList … */}</Padded>
    </ScreenScaffold>
  </>
);
```

- 标题一律走 `Stack.Title`（`large` 尺寸），**不要在页面里自己写大标题 Text**。导航栈标题是屏幕的顶层 chrome。
- 骨架用 `ScreenScaffold`：需要通栏（顶到屏幕左右缘）的内容包 `FullBleed`，其余包 `Padded`（`ScreenScaffold` 默认无水平 padding）。
- **不要再写整屏 `Host` + `Column` + `ScrollView`** —— 生产屏已全部迁到 Tamagui，`Host` 再无合法残留（见硬规则 1）。

## 内容玻璃：GlassChip / GlassHostButton

筛选 chip、胶囊按钮一律用共享组件，**屏幕禁止直接 import `expo-glass-effect`**（allowlist 只允许 `glass-chip.tsx` / `glass-host-button.tsx` / `content-glass.tsx` 引玻璃包；playground 是调试屏，可直连做对照演示）：

- **chip** —— `@/components/glass-chip` 的 `GlassChip`；横滑一排 chip 用 `GlassChipRow`（内含 `GlassContainer spacing={2}`，chip 间距 8pt、2pt 阈值下谁也融不到谁，容器只是分组边界）。
- **玻璃按钮** —— `@/components/glass-host-button` 的 `GlassHostButton`（详情页补货那一类）。

两条硬约束：

- **Android 没有液态玻璃兜底**：`GlassChip` 在 Android 退化为实心品牌色选中态，选中态必须是实心、不能变透明空壳（迁移计划 §4.D 把「Android chip 选中态变透明空壳」列为 P0 回滚信号）。
- **玻璃祖先链上禁止改 `opacity`**（含外层 `Pressable`）—— opacity 过低玻璃会直接变淡；只有 Android 实心分支能用 opacity 做按压反馈。iOS 玻璃路径的胶囊圆角来自 `GlassView` 的 `borderRadius: 999`（RN `borderRadius` 不塑形原生玻璃层）。

Compose `FilterChip` 不能进 Yoga：当年按平台拆过 `chip.{tsx,ios.tsx,android.tsx}`（Android 用 `@expo/ui/jetpack-compose` 的官方 `FilterChip`），双轨已在迁移计划 PR11 删除，**不要再按平台拆 chip**。

## 主题 token

`src/constants/theme.ts` 是**唯一**来源，`src/hooks/use-theme.ts` 的 `useTheme()` 是唯一入口。

```ts
const theme = useTheme();
```

- **禁止硬编码颜色、字号、间距**。出现两次以上的视觉值都必须进 theme。
- 语义色：`primary`（品牌/主按钮/激活 tab）、`success`（已服）、`warning`（即将到期）、`danger`（漏服），各自带 `*Soft` 底色变体。
- 间距用 `Spacing`，底部 tab 遮挡补偿用 `BottomTabInset`。
- 图标不要用 emoji。iOS 用 SF Symbol，Android 用 Material icon。
  - **内容树**走 `@/components/symbol-icon` 的 `SymbolIcon`（`expo-symbols` 的 `SymbolView`，Android 用 Material Symbols 字形名渲染）；语义键在 `src/components/icons.ts` 的 `SYMBOL_ICONS`（`{ ios, android }` 双平台名字典）。
  - **tab 栏图标**（`src/components/app-tabs.tsx`）走 `src` 位图：几何与配色由 `scripts/generate-tab-icons.js` 从 Hugeicons SVG 栅成 24/48/72 三倍率，改 `theme.ts` 的 primary / canvas 后重跑。**不要给 `md`** —— expo-router 在 Android 上的优先级是 `drawable` > `md` > `src`，留着 `md` 就永远渲染旧 Material Symbols；去掉后两端共用同一套 PNG。**双色（选中描边 primary + 封闭区淡色）两端都要保住**：iOS 靠 `renderingMode="original"`；Android 的 `imageSource` 默认被 tab 栏的 `itemIconTintList` 染成单色（expo-router 的转换器丢掉 `renderingMode`、也不透出 react-native-screens 的 `tinting`），所以另走 `Trigger` 的 `unstable_nativeProps.android`，把 `{ type: "imageSource", imageSource, tinting: "original" }` 直接递给原生侧 —— 原生会用 `NoTintDrawable` 包一层屏蔽 tint，观感与 iOS 一致。`nativeProps.android` 在 `NativeTabsView.android` 里后展开、优先级高于 `Icon` 的 `src`；iOS 侧整个 `android` 键被忽略（`NativeTabsView.ios` 只读 `nativeProps.ios`）。⚠️ `unstable_` 是逃生口 API，升级 Expo SDK 后要复验这条链路。**点按波纹同理**：不传 `rippleColor` 时 expo-router 用 `Color.android.dynamic.primary` —— Material You 的壁纸取色，换张壁纸波纹就变色，要显式传 `withAlpha(theme.primary, 0.25)`（与 playground 的 `android_ripple` 同口径）。
  - ~~残留 Expo UI 岛里才用 `@expo/ui` 的 `Icon` + `Icon.select`~~ —— 铝箔岛迁 RN 后 `ICONS` 整份已删。
  - **工具栏图标**（`Stack.Toolbar.Button` / `Stack.Toolbar.Menu` 的 `icon` prop）没有跨平台双槽，只接受「SF Symbol 字符串 或 图片源」，只给 `sf` 时 Android 端整颗按钮不渲染 —— 两端取值收敛在 `src/components/toolbar-icons.{ts,android.ts}`（Android 侧是 `@expo/material-symbols` 的 `.xml` 矢量图）。
  - **设置页例外：Hugeicons SVG**（`src/screens/profile/settings/huge-icon.tsx`，2026-10-17）。行首图标与行尾箭头用 Hugeicons 的 path 数据 + `react-native-svg` 渲染，两端**同一份 path**。走这条要同时满足三条：① `design/` 里这屏的基准就是 Hugeicons（`hgi-stroke` 细描边）；② 需要两端像素级一致 —— `expo-symbols` 在 iOS 是 SF Symbol、Android 是 Material Symbols 字形名，两端字形不同源，iOS 的 `.fill` 实心变体在 Android 没有对应物；③ 能接受 `react-native-svg` 这个原生依赖带来的一次 prebuild + 重新构建。注意它**不是**平台分歧的第四处（见上面平台文件清单）—— 单文件双端同源，恰恰是消灭分歧。数据是 MIT（`@hugeicons/core-free-icons`），许可声明在文件末。`strokeWidth` 默认 1.8（源数据是 1.5，在 18px 上偏细，2026-10-17 按开发者要求粗一档）—— 这是**故意偏离**设计稿比例，改前先想清楚。

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

## Tamagui 是默认 UI 层

2026-10-19 起内容树全面迁到 Tamagui 3（`tamagui` + `@tamagui/config`）。它**不是原生控件** —— 底层是 RN 自带的 `View`/`Text`/`Pressable`（Yoga/Fabric 宿主视图），样式由 JS 算好后塞成 RN style。所以它和项目的内容树同一层：不需要 `Host` 岛、不需要拆平台文件、两端行为天然一致，也不需要 prebuild（纯 JS，装完重启 Metro 即可）。

### 写法速查

```tsx
import { Button, Text, View, XStack, YStack } from "tamagui";

// 颜色：token 名带 $
<View backgroundColor="$surface" borderColor="$border" borderRadius="card" />
<Text color="$textSecondary" fontSize={13} />

// 间距 / 圆角：token 名不带 $
<YStack gap="three" paddingInline="screen" paddingBlock="two" />
<View borderRadius="pill" />          // 999
<View borderRadius="tile" />          // 10

// 按压反馈：press: 子句（Tamagui 自己接线，不要 RN Pressable 的 style 函数）
<View onPress={...} accessibilityRole="button"
      backgroundColor="$surface press:$backgroundSelected" />
<View onPress={...} opacity="1 press:0.85" />   // 压暗，仅实心路径可用

// 按钮四档配色（屏里照抄，别另写一套）
primary     backgroundColor="$primary"    color="$onPrimary"
secondary   backgroundColor="$surface"    color="$text"   borderWidth={1} borderColor="$border"
ghost       backgroundColor="transparent" color="$primary"
destructive backgroundColor="$danger"     color="$onDanger"
```

可用 token：颜色 `text` `textSecondary` `canvas` `surface` `border` `primary` `onPrimary` `primarySoft` `onFilled` `backgroundElement` `backgroundSelected` `success` `successSoft` `successStrong` `warning` `warningSoft` `warningStrong` `danger` `dangerSoft` `dangerStrong`；间距 `half` `one` `two` `three` `four` `five` `screen` `cardGap` `rowGap`；圆角 `tile` `card` `promo` `pill`。全部定义在根目录 `tamagui.config.ts`，值来自 `constants/theme.ts`。

### 五条硬边界

1. **token 只有一份**。颜色/间距/圆角只从 `tamagui.config.ts` 出，屏里不许写裸 hex/rgba。半透明色（`withAlpha(theme.danger, 0.06)` 那类）是算出来的值，继续走 `@/utils/color` + `useTheme()`，不进配置。
2. **RN 专有 prop 要换名**：`paddingHorizontal` → `paddingInline`、`paddingVertical` → `paddingBlock`（`paddingTop`/`marginLeft` 这类单边的合法）。`px`/`py`/`p`/`m` 这些简写没进类型，用长拼。
3. **这些原生组件只吃真实色值，传 `$token` 会静默失效**：`SymbolIcon` 的 `color`（SymbolView 的 tintColor）、`HugeIcon` 的 `color`（SVG stroke）、`GlassView` 的 `tintColor`、`RnDateTimePicker` 的 `accentColor`、`LinearGradient` 的 `colors`、RN `TextInput` 的 `style.color`、`ProgressBarRn` 之外的任何 RN `style`。这些地方保留 `useTheme()`。
4. **玻璃外壳留 RN，玻璃内容用 Tamagui**。Tamagui 没有液态玻璃能力（iOS 26 的 UIGlassEffect 是 Expo 原生模块），模式固定为 `GlassView` 铺原生玻璃 + Tamagui 内容。⚠️ 玻璃祖先链上**不能改 opacity**（含按压反馈）—— opacity 过低玻璃会整层变淡，所以玻璃按钮不用 Tamagui `Button`（它的基类自带 `opacity: press:0.7`），用 Tamagui `View` + GlassView。
5. **运行时零 bundler 配置**。`metro.config.js` / `babel.config.js` 都不需要动。要上 Tamagui 编译器（抽样式、更小的包）是另一个决定，别顺手加 `@tamagui/metro-plugin` —— 它换掉 Metro 的 babelTransformer，与项目的 reactCompiler 实验叠在一起风险大于收益。

### 不迁的清单（及原因）

| 东西 | 为什么留着 |
| --- | --- |
| `ScrollView` / `FlatList` / `FlashList` | 要 `contentInsetAdjustmentBehavior`、`keyboardShouldPersistTaps`、虚拟化，Tamagui 那套不透传 |
| `TextInput` / `Switch` / `Checkbox` | 系统自绘控件，原生样式就是设计系统，不套第二层盒 |
| `RnPicker` / `RnDateTimePicker` / `SymbolIcon` / `HugeIcon` / `toolbar-icons` / `app-tabs` | 原生菜单、原生选择器、图标、系统 chrome |
| `ReminderCardStack` / `MiniArchive` | Reanimated 手势/动画岛，`Animated.View` 替不了 |
| `ObserveErrorFallback` | 错误边界兜底：崩溃可能就发生在 Tamagui 层，兜底必须还能画出来 |
| `dose-timeline.tsx` | 死代码（零调用），没动 |

## 原生自绘控件不要套外盒

有一类控件**自己就带 chrome**：`RnPicker`（`@/components/rn-picker`）的灰底胶囊触发器、
`RnDateTimePicker`（`@/components/rn-datetime-picker`）的灰底胶囊。把它们再塞进
`InputShell` 就是「盒子里嵌盒子」—— 双重描边、双重内边距，控件读起来还是不可点的标签。

规则：**只有文字输入套 `InputShell`**；这两个胶囊触发器一律裸放（`plan-form.tsx` 的头注释记着这条）。

> 历史：2026-10 之前这条规则面向 `@expo/ui` 的菜单 `Picker`（`appearance="menu"`，约 34pt
> 品牌色胶囊）与社区 compact 日期选择器；两者都已退场（Picker → `RnPicker`，日期 →
> `RnDateTimePicker`，见迁移计划 §6.7），规则本身不变。

### 日期/时间选择器走 `RnDateTimePicker`

**2026-10 起统一走 `src/components/rn-datetime-picker.tsx`**（`@react-native-community/datetimepicker`）。
`src/components/native-date-picker.{tsx,ios.tsx,android.tsx}`（Expo UI 版）**已删除** ——
RN 表单页与设置页都迁走后它就零调用了。

仍要记住的两条历史教训：

- **社区的 `@expo/ui/community/datetime-picker` 把原生 `DatePicker` 包在一个 `Host`（`matchContents`）里** —— 那是在 Expo UI 的原生树里嵌了一块 RN island，而 RN island 在 SwiftUI 栈里的定位不可靠：放进 `Column` 会顶出父容器的内边距，放进 `Row` 会纵向偏移（plan-form 真机实测，表现为「选择器和标签对不齐」）。这也是 Expo UI 版 iOS 实现当初要绕开社区组件的原因。
- **Android 的对话框是「挂载即弹」**：社区组件默认 `presentation="dialog"`，而 Material 3 的
  `TimePickerDialog` / `DatePickerDialog` 整个 content 就是一个 AlertDialog（`expo-ui` 的
  `DatePickerView.kt`）。把选择器直接渲染进表单 = 进页面就弹系统对话框 —— 快速添加第二步
  一进来「吃药时间」扑面而来，plan-form 把每日次数从 1 调到 3 还会连弹三层。所以封装按
  iOS compact 的语义改写：先画一颗灰底胶囊显示当前值，**点一下才挂载对话框**，选完
  （`onValueChange`）或取消（`onDismiss`）立即卸载。

日期/时间选择器的**格式跟随 App 语言**，不跟随系统 locale —— 中文界面里弹
「8:00 AM」很违和。用 `@/i18n` 的 `pickerFormat(language)`：iOS 走 `locale`，Android 的
12/24 小时制没有 locale 可依，只能显式给 `is24Hour`（`locale` 仍用来格式化胶囊上显示的值）。

## 什么时候抽公共组件

**三个条件全部满足**才提升到 `src/components/`：

1. 已经（或即将）出现在 **两个及以上屏幕**。
2. 有**可命名的角色**（"Card"、"EmptyState"、"Badge"），而不是"profile 页那个东西"。
3. 它的 API **小于实现** —— 如果 props 只是把内部样式重新暴露一遍，说明它是屏幕片段，不是可复用组件。

升级路径，一步一步来，触发条件满足才走：

> 内联 JSX → `src/screens/<name>/` 下的私有组件 → `src/components/`

不要提前抽象。错误的抽象比重复代价更高 —— 一份视图抄两遍，比一个 API 设计糟糕的 primitive 便宜。

**不要**把已经自带设计语言的原生组件（`Switch`、`DateTimePicker`、stack header）再包一层接到系统里。对它们来说，原生样式就是设计系统。

## useNativeState：已作废

`@expo/ui` 移除后全仓零调用，此节保留只为记录「当年为什么不能用 `.get()`/`.set()`」——
若将来再引 `useNativeState`，注意从 `@expo/ui` 根导入时**只有 `.value`**（`.get()`/`.set()`
只存在于 `@expo/ui/swift-ui` 的类型里），且 oxlint 的 `react(immutability)` 会误报。

表单状态现在一律 RN `useState`。

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
