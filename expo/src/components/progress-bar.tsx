import { RNHostView } from "@expo/ui";
import { View as RNView } from "react-native";

/**
 * 进度条：在 Expo UI（SwiftUI）树中通过 RNHostView 承载 RN 视图。
 * 用于库存、今日完成度等比例展示。
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
    <RNHostView style={{ width: "100%", height }}>
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
    </RNHostView>
  );
}
