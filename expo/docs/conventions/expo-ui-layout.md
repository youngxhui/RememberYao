# `@expo/ui` 与 React Native 混合布局指南

本文记录 `@expo/ui` 原生视图和 React Native 视图混用时的布局边界、尺寸测量和尺寸同步规则。适用于 `Host`、`RNHostView`、原生滚动容器和 RN 动画组件组合使用的场景。

## 1. 先确定布局边界

`@expo/ui` 内部不使用 React Native 的 Yoga/Flexbox。不同层级由不同布局系统负责：

| 层级 | 负责布局的 API | 典型写法 |
| --- | --- | --- |
| RN 页面/外壳 | React Native `style` / Yoga | `<RNView style={{ flex: 1 }}>` |
| `Host` 本身 | React Native `style` | `<Host style={{ flex: 1 }}>` |
| `Host` 内部 | SwiftUI `HStack`/`VStack`/`frame`，或 Compose `Row`/`Column`/modifier | 原生组件的 `modifiers` |
| Expo UI 内的 RN 子树 | `RNHostView` + RN `style` | `<RNHostView matchContents><RNView /></RNHostView>` |

不要把 RN 的 `flex: 1`、`width: '100%'` 或 `alignSelf` 当成 SwiftUI 内部布局手段。它们只能作用于 RN 边界上的 View，不能穿过 `Host` 改变原生子树的布局。

## 2. 三种常见组合方式

### 2.1 纯 RN 页面

页面本身就是 RN 树，直接使用 RN 组件，不需要 `Host` 或 `RNHostView`：

```tsx
<RNView style={{ flex: 1 }}>
  <Animated.ScrollView>
    <RNView style={{ width: measuredWidth, height: shellHeight }}>
      ...
    </RNView>
  </Animated.ScrollView>
</RNView>
```

**什么时候整屏用纯 RN**（而不是默认 `Host` + 原生 ScrollView）：屏幕的核心视觉依赖 RN
布局上下文，硬桥接只会更脆。典型信号：

- 需要 `flex` 撑满的装饰（导轨连接线、进度条、分隔线）—— universal `style` 不支持 flex；
- 整屏是 Reanimated 手势 / `BlurView` / `expo-linear-gradient` 组合（提醒卡堆叠）；
- 需要横向嵌套滚动、按下反馈、`Pressable` 级别的 testID。

现状：`src/app/(tabs)/playground`（整屏 Reanimated 手势组件）。这类屏幕要在文件头注释
写清「为什么不是 Host」，避免后来者以为漏改了。图标走 `expo-symbols` 的
`src/components/symbol-icon.tsx`（Android 需另配 Material 图标）。

> `src/screens/home`（首页）**不是**这一类：它现在是 Expo UI 为主的整屏，
> 只有三块 island 依赖 RN 布局（见第 10 节）。只有「整屏核心视觉都在 RN 布局
> 上下文里」时才退回纯 RN 写法。

### 2.2 Expo UI 页面中嵌入一个 RN island

如果原生页面中有一个必须使用 RN/Reanimated/expo-* 的局部组件，用 `RNHostView` 建立边界：

```tsx
<Host style={{ flex: 1 }}>
  <Column>
    <RNHostView matchContents>
      <RNView style={{ width, height }}>
        ...
      </RNView>
    </RNHostView>
  </Column>
</Host>
```

`RNHostView` 内部又回到 RN 布局上下文。如果这个 island 里还要放 SwiftUI/Compose 组件，必须在 island 内重新放一个 `Host`，不能直接混入原生组件。

### 2.3 原生页面外层用 RN 测量

全屏原生页面需要根据实际容器计算内部卡片尺寸时，可以在 `Host` 外放一个 RN `View` 作为测量壳：

```tsx
<RNView style={{ flex: 1 }} onLayout={onOuterLayout}>
  <Host style={{ flex: 1 }}>
    <ZStack>
      ...
    </ZStack>
  </Host>
</RNView>
```

外层 RN `onLayout` 适合测量 RN 视图树的实际 frame；原生内容内部的精确尺寸则应由原生 geometry 回调补充。

## 3. `Host` 与 `RNHostView` 的尺寸规则

### `Host`

- 全屏页面通常使用 `style={{ flex: 1 }}`，让 `Host` 填满路由提供的区域。
- `Host` 内部用原生布局容器，不用 RN Flexbox。
- `Host.onLayout` 是 RN View 的布局事件，适合读取 Host 自身的 frame。
- `Host.onLayoutContent` 是原生内容完成布局后的尺寸，适合补充原生内容区域，但在 `matchContents`、折叠/展开和内容尺寸变化时可能晚于 RN frame，不能单独作为所有场景的唯一来源。

### `RNHostView`

- `RNHostView` 应只接收一个 RN 子元素；多个 RN 子元素先包进一个 `RNView`。
- 内容有明确固有尺寸时使用 `matchContents`，让原生父容器读取 RN 子树的实际尺寸。
- 内容要填满原生父容器时不要使用 `matchContents`，让 RN 子树接收父容器尺寸。
- 对滚动容器不要随意在滚动轴上使用 `matchContents`。全屏或滚动内容通常应使用明确的交叉轴尺寸和高度。
- `matchContents` 的尺寸来自 RN 子树本身，不能依赖子树的 `onLayout` 反推原生父容器宽度。

### SDK 58 当前注意事项

当前项目的 `@expo/ui@58.0.5` universal 适配层对 `RNHostView` 的 `style` 存在平台差异：

- iOS 适配层不会把 `RNHostView` 的 `style` 转发给底层 SwiftUI View。
- Android 适配层会把 style 转成 Compose modifier，百分比宽度不是一个可靠的跨平台数值。
- 因此不要把 `style={{ width: '100%' }}` 当作 `RNHostView` 的跨平台撑满方案。优先把已测量的数字宽度传给内部 RN 子树；需要平台原生撑满时，按平台拆 `.ios.tsx` / `.android.tsx` 并使用对应 modifier。

升级 SDK 后要重新检查这一行为，不要把当前版本的实现细节当成永久 API。

**固定尺寸的 RN 子树不要配「无 `matchContents` 的 `RNHostView` + 弹性 `Spacer` 居中」**：iOS 不转发 `style`，`matchContents` 又是 false，尺寸全靠父容器提议；两个弹性 `Spacer` 的 `.infinity` 理想宽会把外层 `Column` 带崩，表现为「头像贴左、后面的分区卡片整体右移并冲出屏幕右边缘」。两种正确写法：给 `RNHostView` 上 `matchContents`（内容有明确固有尺寸时，见 `src/components/avatar.tsx` 的 `AvatarMark`），或干脆改用纯 universal 组件（`src/components/avatar.tsx` 的 `MemberAvatar`，`style.width/height` 会真的变成 SwiftUI `frame`）。

## 4. 宽度测量：不要只信任一个来源

不同尺寸来源的含义不同：

| 来源 | 含义 | 常见问题 |
| --- | --- | --- |
| `useWindowDimensions()` | 整个窗口尺寸 | 不包含侧边栏、表单卡片、safe area 或其他父容器收缩 |
| RN `onLayout` | 被测 RN View 的 frame | 在 `matchContents` 下通常是被托管子树自己的尺寸，不一定是父容器宽度 |
| `Host.onLayout` | `Host` 这个 RN View 的实际 frame | 适合知道当前路由区域是否变窄 |
| `Host.onLayoutContent` | 原生内容完成布局后的尺寸 | 可能受固有内容影响，折叠切换时可能比窗口晚一帧 |
| safe-area insets | 系统安全区 | 不能替代父容器 padding、侧边栏或 split-view 收缩 |

### 推荐的宽度策略

1. 先计算窗口 fallback：`windowWidth - insets.left - insets.right`。
2. 读取 `Host.onLayout`，得到当前 Host 的 RN frame。
3. 读取 `Host.onLayoutContent`，得到原生内容区的精确宽度。
4. 对所有有效宽度取保守的最小值，避免旧的展开宽度在折叠后继续撑开父容器。
5. 把最终数字宽度显式传给 RN 子树，不要让 RN island 自行猜测父容器宽度。

可以抽成通用 hook（当前实现在 `src/hooks/use-expo-ui-content-width.ts`，首页与「我的」共用）：

```tsx
import { useCallback, useState } from "react";
import {
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function useExpoUiContentWidth() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [hostFrameWidth, setHostFrameWidth] = useState(0);
  const [nativeContentWidth, setNativeContentWidth] = useState(0);

  const onHostLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) {
      setHostFrameWidth((previous) =>
        previous === next ? previous : next,
      );
    }
  }, []);

  const onLayoutContent = useCallback(
    (event: { nativeEvent: { width: number } }) => {
      const next = Math.round(event.nativeEvent.width);
      if (next > 0) {
        setNativeContentWidth((previous) =>
          previous === next ? previous : next,
        );
      }
    },
    [],
  );

  const fallbackWidth = Math.max(
    0,
    windowWidth - insets.left - insets.right,
  );
  const measuredWidth =
    hostFrameWidth > 0 && nativeContentWidth > 0
      ? Math.min(hostFrameWidth, nativeContentWidth)
      : hostFrameWidth > 0
        ? hostFrameWidth
        : nativeContentWidth;
  const width =
    measuredWidth > 0 && fallbackWidth > 0
      ? Math.min(measuredWidth, fallbackWidth)
      : measuredWidth > 0
        ? measuredWidth
        : fallbackWidth;

  return { width, onHostLayout, onLayoutContent };
}
```

使用时把两个回调都挂到 `Host`，并把 `width` 传给 RN 子组件：

```tsx
const { width, onHostLayout, onLayoutContent } = useExpoUiContentWidth();

<Host
  style={{ flex: 1 }}
  onLayout={onHostLayout}
  onLayoutContent={onLayoutContent}
>
  <Column>
    <RNHostView matchContents>
      <RNView style={{ width, height: fixedHeight }}>
        ...
      </RNView>
    </RNHostView>
  </Column>
</Host>
```

如果内容有额外的水平 padding，测到的宽度可能是外层 frame 而不是内容列宽。此时应在测量值中扣除 padding，或直接测量承载内容的子容器；不要盲目把整个窗口宽度传进去。

## 5. 折叠、展开和旋转时如何避免旧宽度残留

宽度状态必须和产生它的布局条件绑定。常见错误是只缓存最后一次 `onLayoutContent`，窗口已经变小但状态仍保留展开宽度。

至少要做到：

- 监听 `Host.onLayout`，不要只监听 `onLayoutContent`。
- 监听 `useWindowDimensions` 和 safe-area inset；它们变化时使旧的纯 RN `onLayout` 测量失效。
- 对 `containerWidth` 做当前窗口宽度的上限约束：`min(旧测量值, 当前 fallbackWidth)`。
- 展开和折叠两个方向都要测试；不能只验证“窄 → 宽”。
- 宽度变化时重新计算依赖宽度的 padding、居中偏移和卡片节拍。
- 临时日志必须带来源和阶段，定位完成后删除。

一个可复用的缓存结构是：

```ts
type MeasuredWidth = {
  fallbackWidth: number;
  width: number;
};
```

只有当缓存里的 `fallbackWidth` 仍等于当前 fallback 时才使用旧测量值；否则先回到 fallback，等待新的布局回调。

## 6. 高度处理

- 使用 `RNHostView matchContents` 时，RN 子树必须有可靠的固有高度，通常给根 RN `View` 一个明确数字高度。
- 全屏 `Host`、纵向 `ScrollView` 和 `List` 不应依赖 `matchContents` 获得高度；由外层 `style={{ flex: 1 }}` 或原生 frame 提供。
- 删除某个子内容后，要同步删除为它预留的固定高度，避免出现无法解释的空白。
- 高度和宽度不要混用同一套判断：宽度需要跟随容器变化，高度通常由内容或明确的布局契约决定。
- 不要用 RN `style.height` 去限制 SwiftUI 内部原生视图的最终尺寸；原生内部应使用对应的 `frame` 或容器布局。

## 7. 平台拆分

- `@expo/ui/swift-ui` 和 `@expo/ui/swift-ui/modifiers` 只能放在 iOS 实现或 iOS 平台文件中。
- `@expo/ui/jetpack-compose` 和对应 modifiers 只能放在 Android 实现或 Android 平台文件中。
- `Host`、`RNHostView` 从 `@expo/ui` 根导入。
- 跨平台页面优先使用 universal 组件和 universal `style`；只有确实需要平台原生布局语义时才拆平台文件。
- 平台文件的 props 必须保持一致，调用方不应知道组件内部是 SwiftUI、Compose 还是 RN。

## 8. 常见反模式

- 用 `useWindowDimensions()` 直接当作内容列宽。
- 在 `RNHostView matchContents` 内期待子树的 `onLayout` 能测到父级宽度。
- 只监听 `Host.onLayoutContent`，忽略折叠时 RN Host frame 已经变窄的事实。
- 把 `style={{ width: '100%' }}` 写在当前 SDK 的 `RNHostView` 上，认为它一定跨平台撑满。
- `Host` 内部继续使用 RN `flex`、`alignItems` 或 `width: '100%'`。
- 给滚动容器使用 `matchContents`，导致内容没有可滚动的内容溢出区域。
- 内容已经删除，却保留旧的固定高度常量。
- 把调试用的 `console.log` 留在布局回调中。

## 9. 验证清单

每次新增或修改混合布局后，至少验证：

- 初次进入页面时没有横向溢出、居中偏移或高度塌陷。
- iPhone Duo 完全展开 → 折叠 → 再展开，两个方向都正确。
- iPad 侧边栏、分屏和普通窄屏下宽度正确。
- 旋转设备后，宽度缓存没有保留旧值。
- 内容为空、数据很多、系统大字号时，RN island 的高度仍稳定。
- RN island 内的点击、横向滚动和 Reanimated 手势没有落到原生兄弟节点上。
- Android 化时重新检查 `RNHostView` 的 style/modifier 转换，不把 iOS 行为直接推断到 Compose。

## 10. 当前项目参考实现

- `src/app/(tabs)/playground`：整屏纯 RN 的例子（Reanimated 提醒卡堆叠手势、横向 chip 滚动）。
- `src/screens/home`、`src/screens/profile`：Expo UI 为主的整屏（`Host` + 原生 `ScrollView`）。universal style 没有 flex，通栏行靠 `Spacer flexible` 撑开，宽度取值都是第 4 节的 `useExpoUiContentWidth` hook（`src/hooks/use-expo-ui-content-width.ts`）。
  - 首页有两块 island，都靠 `containerWidth` 喂实测宽度：`ReminderCardStackExpoUI`（Reanimated 绝对位移）与 `StockPanelExpoUI`（行内药名 `flex: 1`）。屏幕左右边距统一挂在外层 `Column` 的 `paddingHorizontal` 上，两块的 `islandWidth` 就等于同一个值。
  - 我的页的 island 是 Mini Archive（`MiniArchiveExpoUI`）与成员卡头像（`ListItem` 的 leading 槽自行 `RNHostView` 托管）；三等分统计卡按实测内容宽度算固定卡宽。
  - `src/components/round-icon-button.tsx`：原生 `Row` + `onPress` 做的圆形图标按钮 —— SwiftUI `Button` 的热区只包住 label，撑大 frame 后热区反而缩回图标。
- `src/components/mini-archive.tsx`：RN island 的固有尺寸、safe-area fallback、宽度缓存失效和 `matchContents`；`MiniArchiveSwiftUI` 是把它嵌进 `Host` 的写法。
- `src/components/avatar.tsx`、`src/components/progress-bar.tsx`：小型 RN island 的 `RNHostView` 边界示例（`Avatar` 只在原生树里用，纯 RN 屏用同文件的 `AvatarMark`）。
