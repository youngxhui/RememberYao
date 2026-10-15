import { View as RNView } from "react-native";

/**
 * 进度条：在 Expo UI（SwiftUI）树中通过 RNHostView 承载 RN 视图。
 * 用于库存、今日完成度等比例展示。
 *
 * 已迁到 RN 的页面请用 ProgressBarRn（纯 RN 版），
 * 仍住在 Expo UI 树里的页面继续走默认导出。
 */
export function ProgressBar({
  percent,
  color,
  track,
  height = 6,
}: {
  percent: number;
  color: string;
  track: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(1, percent));
  return (
    <RNView style={{ width: "100%", height }}>
      <RNView
        style={{
          flex: 1,
          borderRadius: height / 2,
          backgroundColor: track,
          overflow: "hidden",
        }}
      >
        <RNView
          style={{
            width: `${clamped * 100}%`,
            height,
            borderRadius: height / 2,
            backgroundColor: color,
          }}
        />
      </RNView>
    </RNView>
  );
}

/** 纯 RN 进度条：直接挂在 RN Yoga 树里，不需要 RNHostView。 */
export function ProgressBarRn({
  percent,
  color,
  track,
  height = 6,
}: {
  percent: number;
  color: string;
  track: string;
  height?: number;
}) {
  const clamped = Math.max(0, Math.min(1, percent));
  return (
    <RNView style={{ width: "100%", height }}>
      <RNView
        style={{
          flex: 1,
          borderRadius: height / 2,
          backgroundColor: track,
          overflow: "hidden",
        }}
      >
        <RNView
          style={{
            width: `${clamped * 100}%`,
            height,
            borderRadius: height / 2,
            backgroundColor: color,
          }}
        />
      </RNView>
    </RNView>
  );
}
