import { useCallback, useState } from "react";
import { useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * 屏幕内容区宽度：窗口 fallback + Host 的 RN frame + 原生内容区三方取保守最小值。
 *
 * 用途是把一个明确的数字宽度传给 Expo UI 树里的 RN island（导轨、提醒卡堆叠、
 * 三等分统计卡…）—— matchContents 下 RN 自测拿不到父级宽度，猜测会在折叠 /
 * 旋转后卡在旧值上。取值规则见 docs/conventions/expo-ui-layout.md 第 4 节。
 */
export function useExpoUiContentWidth() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [hostFrameWidth, setHostFrameWidth] = useState(0);
  const [nativeContentWidth, setNativeContentWidth] = useState(0);

  const onHostLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) {
      setHostFrameWidth((previous) => (previous === next ? previous : next));
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

  const fallbackWidth = Math.max(0, windowWidth - insets.left - insets.right);
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
