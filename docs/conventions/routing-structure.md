# 路由与目录结构

## src/app 只放路由

`src/app/` 下的每个文件都是一条路由，**除此之外什么都不放**。不要在 `app/` 里 colocate 组件、类型定义或工具函数 —— 这是反模式。

- 必须有一条路由对应 `/`（可以放在 group 路由里）。
- 路由文件重命名/移动后，**删掉旧文件**，否则留下一个可访问的死路由。
- 平台变体文件（`.ios.tsx` / `.android.tsx`）**不能放 `app/`** —— Expo Router 不支持路由文件的平台扩展名。平台专属视图放 `src/components/`。

## 每个 stack 用 _layout.tsx 定义

- **永远**用 `_layout.tsx` 定义 stack，不要在每个屏幕里单独配。
- `Stack` 从 `expo-router/stack` 导入。

```tsx
import { Stack } from "expo-router/stack";

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="index" options={{ title: "今日" }} />
      <Stack.Screen name="detail" options={{ headerLargeTitleEnabled: false }} />
    </Stack>
  );
}
```

## 标题与工具栏

标题用 `Stack.Title`，不要用页面里的 `<Text>` 自建标题。

```tsx
<Stack.Title large>今日</Stack.Title>
<Stack.Toolbar placement="right">
  <Stack.Toolbar.Button onPress={() => router.push("/medica/add-options")}>
    <Stack.Toolbar.Icon sf="plus" />
    <Stack.Toolbar.Label>添加</Stack.Toolbar.Label>
  </Stack.Toolbar.Button>
</Stack.Toolbar>
```

搜索栏用 `Stack.SearchBar`，不要自己拼输入框 + 过滤状态。

## 导航

跳转用 `<Link href="..." />`。包装自定义组件时用 `asChild`：

```tsx
<Link href="/medica/detail" asChild>
  <Pressable>{/* ... */}</Pressable>
</Link>
```

**尽量加 `<Link.Preview>`** 和长按 context menu，这是 iOS 的既有习惯：

```tsx
<Link href="/medica/detail" asChild>
  <Link.Trigger>
    <Pressable><Card /></Pressable>
  </Link.Trigger>
  <Link.Menu>
    <Link.MenuAction title="补货" icon="plus" onPress={restock} />
    <Link.Menu title="更多" icon="ellipsis">
      <Link.MenuAction title="删除" icon="trash" destructive onPress={remove} />
    </Link.Menu>
  </Link.Menu>
</Link>
```

`Link.MenuAction` 上标 `destructive` 会走系统危险色。

## 模态与表单

用 `presentation` 选项，不要自己写 modal 组件：

```tsx
<Stack.Screen name="modal" options={{ presentation: "modal" }} />
```

动态高度表单：

```tsx
<Stack.Screen
  name="sheet"
  options={{
    presentation: "formSheet",
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.5, 1.0],
    contentStyle: { backgroundColor: "transparent" }, // iOS 26+ 液态玻璃背景
  }}
/>
```

## Tab 导航

- 用 `expo-router/native-tabs` 的 `NativeTabs`（SDK 58 的稳定名）。**不要**用 `expo-router/unstable-native-tabs` —— 那是旧别名。
- `NativeTabs` 是**根 Stack 的一个 screen**，由 `src/app/(tabs)/_layout.tsx` 渲染；tab 栏本体集中在 `src/components/app-tabs.tsx`，不要在别处再建。

```tsx
// src/app/_layout.tsx —— 根 Stack 只做分流，header 全部关掉
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Screen name="index" />
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="onboarding" />
</Stack>
```

```tsx
// src/components/app-tabs.tsx（由 src/app/(tabs)/_layout.tsx 渲染）
import { NativeTabs } from "expo-router/native-tabs";

<NativeTabs.Trigger name="home" testID="home-tab">
  <NativeTabs.Trigger.Label>首页</NativeTabs.Trigger.Label>
  <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
</NativeTabs.Trigger>
```

- **`name` 用组内相对路由名**（`home` 而不是 `(tabs)/home`）：名字对不上会报 `No route named "..." exists in nested children` + `No screens are declared in ./(tabs)/_layout.tsx`，整个 tab 栏渲染成空白。
- **图标必须同时给 `sf` 和 `md`**：SF Symbols 是 Apple-only，只给 `sf` 会让 Android 没有图标。
- 需要给 Maestro 用的 trigger 加 `testID`，命名规范 `<tab名>-tab`（见 [data-state.md](./data-state.md#maestro-测试)）。
- 主题色通过 `backgroundColor` / `tintColor` / `indicatorColor` 从 `Colors` 传入，不要在 tab 里硬编码。
- **只有 `_layout.tsx` 里声明了 `Trigger` 的路由才进 tab 栏**。expo-router 内部按 `descriptor.routeSource === "layout"` 过滤（`useVisibleTabsWithRedirect`），所以 `(tabs)/` 下没声明 Trigger 的目录不会变成 tab —— 但它同样**跳不过去**：一旦成为焦点路由，expo-router 会 `router.replace()` 回初始 tab。想让某个页面「不占 tab 位置但仍可 push」，必须把它移出 `(tabs)` 组（见下面的 `records`）。
- **生产环境的 tab 数量跟着设计稿走**（当前 3 个：首页 / 药品 / 我的，对齐 `design/*.html` 的 tabbar）。调试页用 `__DEV__` 包 `Trigger`：playground 只在 debug 构建出现。`__DEV__` 进程内恒定，所以不违反「tab 必须静态」；别改成运行时 state 控制，那会让 tab 栏重挂载、丢页面状态。

## 全屏页（引导页等）不要放进 tab 组

`tabBarHidden` 只能整体隐藏 tab 栏，无法按屏幕隐藏；把引导页这类全屏流程放在 `(tabs)` **之外**（`src/app/onboarding.tsx`），由根 Stack 直接承载，就没有 tab 栏。代价是它拿不到 tab 屏的 `tintColor`，原生控件要靠 `Host seedColor={theme.primary}` 跟随品牌色。

## 不许直接依赖 @react-navigation

SDK 56+ 不要 `import ... from "@react-navigation/*"`，统一从 `expo-router/react-navigation` 导入（覆盖 `/native`、`/core`、`/elements`、`/routers`）。oxlint 已配 `no-restricted-imports` 拦截。

## typedRoutes 已开启

`href` / `router.push()` 的路由字符串由 TypeScript 校验。写错路径会编译报错，这是好事 —— 不要用 `as any` 或 `@ts-expect-error` 绕过。

## 目录归属

| 内容 | 放哪 |
| --- | --- |
| 路由 | `src/app/` |
| 可复用 UI 组件 | `src/components/`（kebab-case 文件名） |
| 单屏私有的复杂子组件 | `src/screens/<name>/` |
| 服务端 API 路由（如有） | `src/app/api/*+api.ts`，共享服务端 helper 放 `src/server/` |
| 可复用 hooks | `src/hooks/` |
| 业务逻辑、数据层、纯函数 | `src/lib/` |
| 设计 token | `src/constants/theme.ts` |
| 独立工具函数 + 就近测试 | `src/utils/`（测试文件与被测文件同名 `.test.ts`，不用 `__tests__/`） |
| 配置与资源 | 仓库根：`app.json`、`assets/`、`scripts/`、`maestro/` |

### src/screens/ 的拆分时机

目前所有屏幕都直接写在路由文件里。当一个屏幕大到需要拆分、且拆分出的组件**只在它自己用**时，按官方结构拆到 `src/screens/<name>/`，路由文件只渲染屏幕：

```tsx
// src/app/(tabs)/home/index.tsx
import { Home } from "@/screens/home";

export default function HomeScreen() {
  return <Home />;
}
```

好处是同一个屏幕可以在多条路由下复用。只在屏幕上用的子组件 colocate 在 `src/screens/<name>/` 下，不要提到 `src/components/`。

> 本项目当前没有 `src/screens/` 目录。**不要**为了对齐官方结构去重构现有屏幕 —— 按「拆分时机」自然演进即可。

## 组件文件增长时

单个组件变复杂时，给它建一个文件夹，根放在 `index.tsx`，私有子组件 colocate 在旁边。导入路径不变：

```
src/components/table/
  index.tsx     # 导出 Table
  cell.tsx      # 私有子组件
```

导入时仍写 `@/components/table`。

## 现有路由

```
src/app/
  _layout.tsx            ThemeProvider + 根 Stack（index / (tabs) / onboarding / records）+ 通知初始化/同步
  index.tsx              分流：未看过引导页 → onboarding，否则 → 首页
  onboarding.tsx         首次启动引导页：tab 组之外，全屏无 tab 栏
  records.tsx            服药记录：按日期查历史与当日服药率（tab 组之外，从「我的」push）
  (tabs)/
    _layout.tsx          AppTabs（NativeTabs）
    home/                今日：进度、用药时间线、库存速览
    medica/              药品：列表 / detail / form / add-options（拍照·手动·扫码入口）
    profile/             我的：persons / plan-form / person-detail
    playground/          调试页：只有 __DEV__ 构建才在 tab 栏里出现
```

每个 tab 目录下都有自己的 `_layout.tsx` 定义该 tab 的 stack。
