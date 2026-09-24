import { MiniArchiveSwiftUI as MiniArchiveFallback } from "@/components/mini-archive";
import type { MiniArchiveExpoUIProps } from "@/components/swiftui/mini-archive-types";

/**
 * MiniArchive 的跨平台兜底：iOS 走 mini-archive.ios.tsx 的纯 SwiftUI 实现，
 * 这里（Android / web）退回 RN 版。两者入参同构，调用方无需分支。
 */
export default function MiniArchiveExpoUI(props: MiniArchiveExpoUIProps) {
  return <MiniArchiveFallback {...props} />;
}
