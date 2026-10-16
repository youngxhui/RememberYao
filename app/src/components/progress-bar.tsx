import { View as RNView } from "react-native";

/**
 * 进度条：在 RN Yoga 树里直接用，不需要 RNHostView。
 * 用于库存、今日完成度等比例展示。
 *
 * 历史：双轨期还有一份 `ProgressBar`（RNHostView 包装）给仍住在 Expo UI 树里的
 * 详情 / 孪生页用；两屏迁完后包装已零调用，PR11 一并删除。
 */
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
