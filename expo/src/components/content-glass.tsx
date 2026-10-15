import {
  LiquidGlassView,
  supportsNativeGlass,
  type TGlassVariant,
} from "expo-liquid-glass-view";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  View as RNView,
  type StyleProp,
  type ViewStyle,
} from "react-native";

/**
 * 编译期组件 + 运行时 API 都在。降透明是另一条状态，不进这个函数。
 * `supportsNativeGlass` 是 import 时求值一次的常量（iOS 26+ OS 判断），
 * 不需要像 expo-glass-effect 那样再套 module cache。
 */
export function canUseLiquidGlassSync(): boolean {
  return process.env.EXPO_OS === "ios" && supportsNativeGlass;
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
 * 注意：`LiquidGlassViewProps` 只继承 `{ style, children }` + 玻璃 props，
 * **不继承 ViewProps** —— testID / pointerEvents / onLayout 不能透传给它，
 * 所以这里显式列 props，不做 `...rest` 转发。RN 语义（testID、手势）
 * 一律由调用方写在外层 Pressable / View 上。
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
  variant?: TGlassVariant;
  /** 玻璃圆角只认这个 prop，RN borderRadius 不塑形原生玻璃层 */
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
    <LiquidGlassView
      variant={variant}
      tint={tint}
      cornerRadius={cornerRadius}
      cornerStyle="continuous"
      interactive={interactive}
      style={style}
    >
      {children}
    </LiquidGlassView>
  );
}
