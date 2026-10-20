import { View } from "tamagui";

/**
 * 进度条：在 Tamagui 树里直接用。
 * 用于库存、今日完成度等比例展示。
 *
 * 历史：双轨期还有一份 `ProgressBar`（RNHostView 包装）给仍住在 Expo UI 树里的
 * 详情 / 孪生页用；两屏迁完后包装已零调用，PR11 一并删除。
 *
 * `color` / `track` 由调用方给真实色值（屏里常是 `withAlpha(theme.danger, 0.06)`
 * 这类算出来的半透明色，不是设计 token，所以不进 tamagui.config.ts）。
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
    <View width="100%" height={height}>
      <View
        flex={1}
        borderRadius={height / 2}
        backgroundColor={track}
        overflow="hidden"
      >
        <View
          width={`${clamped * 100}%`}
          height={height}
          borderRadius={height / 2}
          backgroundColor={color}
        />
      </View>
    </View>
  );
}
