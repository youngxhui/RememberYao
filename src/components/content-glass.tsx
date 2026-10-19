import {
  GlassView,
  isLiquidGlassAvailable,
  type GlassStyle,
} from "expo-glass-effect";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  View as RNView,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * 编译期组件 + 运行时 API 都在。降透明是另一条状态，不进这个函数。
 * `isLiquidGlassAvailable()` 是 iOS 26+ 的 OS 判断，包内自带 module cache，
 * 同步可重入；非 iOS 平台走包的兜底实现，直接返回 false。
 */
export function canUseLiquidGlassSync(): boolean {
  return process.env.EXPO_OS === "ios" && isLiquidGlassAvailable();
}

/**
 * ContentGlass 与 GlassChip 共用：a11y 未 resolve 时必须是 false，
 * 这样首帧走实心 fallback，不会闪一帧玻璃。
 */
export function useLiquidGlassEnabled(): boolean {
  const [reduceTransparency, setReduceTransparency] = useState<boolean | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((v) => {
      if (alive) setReduceTransparency(!!v);
      return undefined;
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduceTransparency === false && canUseLiquidGlassSync();
}

/**
 * `GlassView` 继承 ViewProps，圆角与连续曲率走 RN style（`borderRadius` /
 * `borderCurve`）—— 原生侧 `GlassEffectModule` 为这两个 key 注册了 Prop，
 * 样式值最终喂给 `glassEffectView` 的 `cornerConfiguration`，玻璃层与视图层
 * 一起塑形。这里仍显式列 props 不做 `...rest`：fallback 分支是普通 View，
 * 两个分支的 props 集合要保持一致。
 */
export function ContentGlass({
  children,
  tint,
  variant = "regular",
  cornerRadius = 0,
  interactive = false,
  fallbackStyle,
  style,
}: {
  children?: React.ReactNode;
  /** 着色；alpha 控制强度 */
  tint?: string;
  /** 玻璃样式：regular / clear / none */
  variant?: GlassStyle;
  /** 玻璃圆角；与 fallback 分支共用同一个值 */
  cornerRadius?: number;
  interactive?: boolean;
  /** API 不可用 / 降透明 / Android / a11y 未 resolve：普通 View 的底 */
  fallbackStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const native = useLiquidGlassEnabled();

  if (!native) {
    return <RNView style={[fallbackStyle, style]}>{children}</RNView>;
  }
  return (
    <GlassView
      glassEffectStyle={variant}
      tintColor={tint}
      isInteractive={interactive}
      style={[style, { borderRadius: cornerRadius, borderCurve: "continuous" }]}
    >
      {children}
    </GlassView>
  );
}
