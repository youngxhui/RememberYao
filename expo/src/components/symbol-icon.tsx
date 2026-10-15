import { SymbolView } from "expo-symbols";
import type { SymbolViewProps } from "expo-symbols";

/**
 * 平台图标封装：底层走 expo-symbols 的 SymbolView，两端各给一份图标名。
 *
 * - iOS：SF Symbol 字符串。
 * - Android：Material Symbols 字形名（expo-symbols 内置 symbols.json 的 key），
 *   不是 @expo/material-symbols 的矢量图资源——SymbolView 在 Android 上是
 *   用 font glyph 渲染的，不走矢量图路径。
 *
 * `name` 可直接传 `{ ios, android }` 对象（同 SymbolView 原生 API），
 * 也可以从 SYMBOL_ICONS 取语义键。
 *
 * 为什么不用 @expo/ui 的 Icon：首页 / 剂量导轨是纯 RN 滚动屏（时间线导轨要
 * flex 连接线、提醒卡是 Reanimated 手势），塞进 Host 要靠 RNHostView 逐块桥接，
 * 触摸链路和测量都更难保证。SymbolView 可以直接挂在 RN 树上。
 */
type SymbolIconName = SymbolViewProps["name"];

export function SymbolIcon({
  name,
  size = 16,
  color,
  weight = "semibold",
  style,
}: {
  name: SymbolIconName;
  size?: number;
  color: string;
  weight?: "regular" | "medium" | "semibold" | "bold";
  style?: object;
}) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={style}
    />
  );
}
