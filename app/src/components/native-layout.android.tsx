import {
  HorizontalPager,
  type HorizontalPagerHandle,
} from "@expo/ui/jetpack-compose";
import {
  fillMaxSize,
  fillMaxWidth,
  wrapContentWidth,
} from "@expo/ui/jetpack-compose/modifiers";
import { Children, isValidElement, useRef, type ReactElement } from "react";

import type {
  NativeButtonModifiers,
  NativeContinuousShape,
  NativeConcentricShape,
  NativeFieldModifiers,
  NativeGradientBackground,
  NativeLayoutOptions,
  NativeOnboardingPagerProps,
  NativeStrokeBorder,
} from "@/components/native-layout";

export function nativeLayout({
  fullWidth = false,
  fullHeight = false,
  unconstrainedWidth = false,
  idealWidth = false,
}: NativeLayoutOptions) {
  // Compose 没有 iOS fixedSize 那样「不参与压缩」的等价物：wrapContentWidth 只让自身
  // 不撑满，行内剩余空间不够时仍可能被压缩。Android 端要严格不折行，等 Android 实现
  // 落地后按那边的实际行为再调。
  if (idealWidth) return wrapContentWidth("end");
  return fullHeight
    ? fillMaxSize()
    : fullWidth || unconstrainedWidth
      ? fillMaxWidth()
      : undefined;
}

export const nativeButtonModifiers: NativeButtonModifiers = ({
  fullWidth = false,
} = {}) => (fullWidth ? [fillMaxWidth()] : []);

export const nativeFieldModifiers: NativeFieldModifiers = () => [];

// Android 没有同心圆角概念：Compose 的圆角就是写死值。返回空数组表示不加
// modifier —— style 里的 borderRadius 会照常生效（omitUserOverridden 对空数组
// 直接返回原样），视觉上退回统一的 18pt 圆角
export const nativeConcentricShape: NativeConcentricShape = () => [];

// 同上：Compose 原生就是所需圆角，不需要额外 modifier
export const nativeContinuousShape: NativeContinuousShape = () => [];

// Android 的 borderWidth + borderRadius 由 transformStyle.android.ts 的「分层背景」
// 合成出圆角描边，本来就对；这里不加 modifier，继续走 style
export const nativeStrokeBorder: NativeStrokeBorder = () => [];

// Compose 的 modifiers 包只有 animation 系列，没有 background / 渐变 / 阴影：
// 泡罩药板的光影在 Android 上暂时只能靠平色 + 同心圆分层近似（见 twin.tsx）
export const nativeGradientBackground: NativeGradientBackground = () => [];

function pageValue(child: React.ReactNode): string | undefined {
  if (!isValidElement(child)) return undefined;
  return (child.props as { value?: string }).value;
}

export function NativeOnboardingPager({
  // Android 侧暂不消费 selection（见下方 TODO），但 props 必须与 iOS 实现一字不差
  selection: _selection,
  onSelectionChange,
  children,
}: NativeOnboardingPagerProps) {
  const pages = Children.toArray(children).filter(
    isValidElement,
  ) as ReactElement[];
  const pagerRef = useRef<HorizontalPagerHandle>(null);
  // TODO: Expo UI Android 的 animateScrollToPage 当前会抛类型拒绝错误，
  // 程序化翻页（selection 变化时 pagerRef.current?.animateScrollToPage(index)）
  // 先不接，保证 onboarding 至少能渲染出来；后续再研究正确调用方式。
  // 接上之后 _selection 即可改回 selection 并参与计算。

  return (
    <HorizontalPager
      ref={pagerRef}
      initialPage={0}
      modifiers={[fillMaxSize()]}
      onSettledPageChange={(page) => {
        const value = pageValue(pages[page]);
        if (value) onSelectionChange(value);
      }}
    >
      {pages}
    </HorizontalPager>
  );
}

NativeOnboardingPager.Tab = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);
