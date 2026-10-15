import { Host } from "@expo/ui";

import { useTheme } from "@/hooks/use-theme";

/**
 * RN Yoga 树里的最小 Expo UI 岛。只收 Expo UI 子树，不要往里塞 RN 组件。
 */
export function ExpoUiIsland({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Host seedColor={theme.primary} matchContents>
      {children}
    </Host>
  );
}
