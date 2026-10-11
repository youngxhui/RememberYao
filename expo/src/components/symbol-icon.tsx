import { SymbolView } from "expo-symbols";

/**
 * 平台图标：iOS 走 SF Symbols。
 *
 * 为什么不用 `@expo/ui` 的 `Icon`：它要求整棵树包在 `Host` 里，而首页是纯 RN 滚动屏
 * （时间线导轨要 flex 连接线、提醒卡是 Reanimated 手势），塞进原生树要靠 RNHostView
 * 逐块桥接，触摸链路和测量都更难保证。`expo-symbols` 的原生视图可以直接挂在 RN 树上。
 *
 * Android：`name` 目前只给了 iOS 的 SF Symbol，Android 端要补 Material 图标
 * （`name={{ ios, android: import('@expo/material-symbols/xxx.xml') }}`）。
 * 本项目的 Android 目录尚未生成，先记在 AGENTS.md 的 Android 待办里。
 */
export function SymbolIcon({
  name,
  size = 16,
  color,
  weight = "semibold",
  style,
}: {
  /** SF Symbol 名称 */
  name: Parameters<typeof SymbolView>[0]["name"];
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
