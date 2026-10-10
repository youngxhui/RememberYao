import {
  createElement,
  Fragment,
  type ReactElement,
  type ReactNode,
} from "react";

export type NativeModifier = {
  $type: string;
  [key: string]: unknown;
};

export type NativeLayoutOptions = {
  fullWidth?: boolean;
  fullHeight?: boolean;
  unconstrainedWidth?: boolean;
  /**
   * 按内容固有宽度排布，且不参与压缩（iOS `fixedSize(horizontal:)`、
   * Compose `wrapContentWidth`）。给「宽度不能被挤、内容不能折行」的胶囊类控件用：
   * 不加的话行内文字会先折行或截断，而不是让同行的可压缩列让位。
   */
  idealWidth?: boolean;
};

export type NativeButtonOptions =
  | "glass"
  | "glassProminent"
  | "borderedProminent";

export type NativeButtonModifiers = (options?: {
  style?: NativeButtonOptions;
  fullWidth?: boolean;
}) => NativeModifier[];

export type NativeFieldModifiers = (options?: {
  flush?: boolean;
}) => NativeModifier[];

/**
 * 同心圆角（iOS 26 Liquid Glass）。
 *
 * 让内嵌卡片的外角半径跟随外层容器：卡片离屏幕边缘越近，圆角越大、与屏幕
 * 弧线同心，而不是所有卡片统一一个写死的圆角值。
 *
 * `fallbackRadius` 必须传「改造前 `borderRadius` 的同一个值」——
 * `ContainerRelativeShape` 依赖「最近的容器提供形状」才能算出半径，
 * 在 `ScrollView` 里未必能解析到屏幕圆角，解析失败时会退化成直角。
 * 带上兜底值，最坏情况也只是回到改造前的圆角，不会变成方角。
 */
export type NativeConcentricShape = (
  fallbackRadius: number,
) => NativeModifier[];

/**
 * 连续曲线圆角：iOS `RoundedRectangle(cornerRadius:, style: .continuous)`，
 * 等价 RN 的 `borderCurve: "continuous"`（AGENTS.md UI 规则 9）。
 *
 * universal style 的 `borderRadius` 只会生成 `.circular` 的
 * RoundedRectangle，圆弧角在 iOS 上比系统卡片「硬」，这就是「圆角不自然」的来源。
 * 这里显式指定半径：`nativeConcentricShape` 的半径由「最近的容器」算出，卡片
 * 处在宽度由 Spacer / Row 决定的容器里时解析不到有限尺寸，会退化成胶囊形
 * （真机实测：三等分统计卡直接变药丸），所以卡片一律用本函数指定死半径。
 */
export type NativeContinuousShape = (radius: number) => NativeModifier[];

/**
 * 连续曲线圆角描边（iOS）。
 *
 * universal style 的 `borderWidth` 在 iOS 上只会生成 `.border()` —— 一条**直角**
 * 描边，圆角全靠后面的 `clipShape` 去裁。裁掉的只是直角多出的部分，描边本身仍按
 * 矩形路径走，外侧一半被裁掉之后线条变细、四角发虚，这就是「圆角处理有问题」的
 * 来源。
 *
 * 本 helper 直接拼 `strokeBorder` 的 modifier 配置（JS 侧 factory 没暴露
 * `roundedCornerStyle`，与 `nativeContinuousShape` 同一套写法），让描边沿
 * `RoundedRectangle(style: .continuous)` 的**内侧**走 —— 等价 RN 的
 * `borderWidth` + `borderCurve: "continuous"`（见 reminder-card-stack 的卡片）。
 *
 * Android / web 返回空数组：`transformStyle.android.ts` 对
 * `borderWidth + borderRadius` 有专门的「分层背景」合成，圆角描边本来就是对的，
 * 继续用 style 里的 `borderWidth` / `borderColor` 即可。
 */
export type NativeStrokeBorder = (options: {
  color: string;
  width: number;
  radius: number;
}) => NativeModifier[];

/**
 * 液态玻璃 chip 的 modifier（iOS 26 Liquid Glass）。
 *
 * iOS 用 `glassEffect(.regular, in: .capsule)`：磨砂底与高光描边由系统绘制，JS 侧
 * 不能再叠 `backgroundColor` / `borderWidth` —— 实色会把玻璃糊成一片，只剩一个
 * 药丸轮廓。激活态加 `.tint()` 上品牌色，与未激活的透明玻璃分层，替代老写法
 * 「深墨实心」；品牌色本身仍只做着色、不抢内容。
 *
 * 返回 `null` 表示当前平台没有液态玻璃能力。Compose 没有对应物，web 也没有 ——
 * 见各平台文件里的说明。
 */
export type NativeChipModifiers = (options: {
  active: boolean;
  /** 激活态玻璃着色，传 `theme.primary` */
  tint: string;
}) => NativeModifier[] | null;

/** 渐变底的形状：整张药板 / 圆（泡罩、坑、药饼）/ 胶囊（胶囊剂） */
export type NativeGradientShape = "sheet" | "circle" | "capsule";

/**
 * 渐变底色（iOS）。
 *
 * universal style 只有 `backgroundColor` 一个平色，画不出铝箔的金属光泽和
 * 泡罩的塑料体积 —— 泡罩药板「逼真」与否全在光影，不在形状。iOS 用 SwiftUI 的
 * `background(_:in:)` 直接铺 linear / radial 渐变；Compose 的 modifiers 包没有
 * background，Android 走空实现退回平色（层次靠 twin.tsx 的同心圆分层保留）。
 *
 * 传入的 modifier 会顶掉 style 里同类型的 background —— 所以调用方**仍然要**
 * 在 style 里给平色兜底，Android 才不至于变透明。
 */
export type NativeGradientOptions = {
  shape: NativeGradientShape;
  /** sheet 的圆角半径（其它形状由自身几何决定） */
  radius?: number;
  /** 色标。linear 沿方向排布；radial 是 中心 → 边缘。
   *  收 readonly：theme.ts 是 `as const`，色标是只读元组 */
  colors: readonly string[];
  /** radial：中心（单位坐标，默认 0.5,0.5）与起止半径（pt） */
  center?: { x: number; y: number };
  startRadius?: number;
  endRadius?: number;
  /** linear：方向（默认左上 0,0 → 右下 1,1） */
  start?: { x: number; y: number };
  end?: { x: number; y: number };
};

export type NativeGradientBackground = (
  options: NativeGradientOptions,
) => NativeModifier[];

export type NativeOnboardingPagerTabProps = {
  value: string;
  children: ReactNode;
};

export type NativeOnboardingPagerProps = {
  selection: string;
  onSelectionChange: (selection: string) => void;
  children: ReactNode;
};

export type NativeOnboardingPagerComponent = ((
  props: NativeOnboardingPagerProps,
) => ReactElement) & {
  Tab: (props: NativeOnboardingPagerTabProps) => ReactElement;
};

export function nativeLayout(_options: NativeLayoutOptions): NativeModifier {
  return { $type: "nativeLayoutFallback" };
}

export const nativeButtonModifiers: NativeButtonModifiers = () => [];

export const nativeFieldModifiers: NativeFieldModifiers = () => [];

export const nativeConcentricShape: NativeConcentricShape = () => [];

// web / 兜底实现：不加 modifier，style 里的 borderRadius 照常生效
export const nativeContinuousShape: NativeContinuousShape = () => [];

// web 没有液态玻璃：chip 目前只剩文字，等 web 端要真机呈现时再补实底回退
export const nativeChipModifiers: NativeChipModifiers = () => null;

// web 的 CSS border 本身就是贴圆角的，style 的 borderWidth 已足够
export const nativeStrokeBorder: NativeStrokeBorder = () => [];

// web 兜底：不加渐变 modifier，style 里的 backgroundColor 照常生效
export const nativeGradientBackground: NativeGradientBackground = () => [];

function OnboardingPager({ children }: NativeOnboardingPagerProps) {
  return createElement(Fragment, null, children);
}

export const NativeOnboardingPager = Object.assign(OnboardingPager, {
  Tab: ({ children }: NativeOnboardingPagerTabProps) =>
    createElement(Fragment, null, children),
}) satisfies NativeOnboardingPagerComponent;
