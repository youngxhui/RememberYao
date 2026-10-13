import {
  nativeContinuousShape,
  nativeLayout,
  nativeStrokeBorder,
} from "@/components/native-layout";

/**
 * 圆角描边外盒：返回可直接展开的 style 与 modifiers。
 *
 * ```tsx
 * const box = roundedBox({
 *   color: theme.border,
 *   background: theme.surface,
 *   radius: Radius.card,
 *   width: 1,
 * });
 * <Row style={{ ...box.style, padding: 16 }} modifiers={box.modifiers}>…</Row>
 * ```
 *
 * 为什么不能直接写 `style={{ borderRadius, borderWidth, borderColor }}`：
 * universal style 在 iOS 上会把 `borderWidth` 翻译成 `.border()` —— 一条**直角
 * 矩形**描边，圆角全靠后面的 `clipShape` 去裁。裁掉的只是直角多出的部分，描边
 * 路径本身仍是矩形，外侧一半被裁掉之后线条变细、四角发虚。
 * 正确做法是用 `strokeBorder` 让描边沿连续曲线圆角矩形的**内侧**走，语义等价
 * RN 的 `borderWidth` + `borderCurve: "continuous"`
 * （见 `reminder-card-stack.tsx` 的卡片）。
 *
 * 平台分工：
 * - iOS 走 `nativeStrokeBorder`，且 style 里**不能**再给 `borderWidth`，
 *   否则会额外画一道直角 `.border()`，两道描边叠在一起。
 * - Android / web 反过来：`transformStyle.android.ts` 会把 style 的
 *   `borderWidth + borderRadius` 用「分层背景」正确合成圆角描边，所以照旧写在
 *   style 里，`nativeStrokeBorder` 在那些平台是空实现。
 */
export function roundedBox({
  color,
  background,
  radius,
  width,
  fullWidth = true,
}: {
  /** 描边色 */
  color: string;
  /** 底色 */
  background: string;
  /** 圆角半径 */
  radius: number;
  /** 描边宽度 */
  width: number;
  /**
   * 是否撑满父容器。固定尺寸的小盒子（缩略图、圆形按钮）必须传 false：
   * `fullWidth` 生成的是 `frame(maxWidth: .infinity)`，会通过
   * `omitUserOverridden` 把 style 里的 `width` / `height` 顶掉。
   */
  fullWidth?: boolean;
}) {
  const strokeInModifiers = process.env.EXPO_OS === "ios";
  return {
    style: {
      borderRadius: radius,
      ...(strokeInModifiers
        ? null
        : { borderWidth: width, borderColor: color }),
      backgroundColor: background,
    },
    modifiers: [
      ...(fullWidth ? [nativeLayout({ fullWidth: true })] : []),
      ...(strokeInModifiers
        ? nativeStrokeBorder({ color, width, radius })
        : []),
      ...nativeContinuousShape(radius),
    ],
  };
}
