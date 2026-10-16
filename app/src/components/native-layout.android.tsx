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
  NativeLayoutOptions,
  NativeOnboardingPagerProps,
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
