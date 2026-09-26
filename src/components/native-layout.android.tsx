import {
  HorizontalPager,
  type HorizontalPagerHandle,
} from "@expo/ui/jetpack-compose";
import { fillMaxSize, fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  type ReactElement,
} from "react";

import type {
  NativeButtonModifiers,
  NativeFieldModifiers,
  NativeLayoutOptions,
  NativeOnboardingPagerProps,
} from "@/components/native-layout";

export function nativeLayout({
  fullWidth = false,
  fullHeight = false,
  unconstrainedWidth = false,
}: NativeLayoutOptions) {
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

function pageValue(child: React.ReactNode): string | undefined {
  if (!isValidElement(child)) return undefined;
  return (child.props as { value?: string }).value;
}

export function NativeOnboardingPager({
  selection,
  onSelectionChange,
  children,
}: NativeOnboardingPagerProps) {
  const pages = Children.toArray(children).filter(
    isValidElement,
  ) as ReactElement[];
  const selectedIndex = Math.max(
    0,
    pages.findIndex((child) => pageValue(child) === selection),
  );
  const pagerRef = useRef<HorizontalPagerHandle>(null);

  useEffect(() => {
    void pagerRef.current?.animateScrollToPage(selectedIndex);
  }, [selectedIndex]);

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
