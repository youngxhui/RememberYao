import { Column, Row, Spacer, Text } from "@expo/ui";
import type { ReactNode } from "react";

import { nativeLayout } from "@/components/native-layout";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 分组卡片：替代嵌在 ScrollView 里的 FieldGroup / List —— 两者在 iOS 上分别是
 * SwiftUI Form / List，本身都是滚动容器，嵌进外层 ScrollView 会塌成零高、
 * 内容直接消失（真机实测），不能这么用。样式对齐各页已有的卡片（同
 * backgroundElement + 14 圆角）。
 */
export function SectionCard({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Column
      style={{
        backgroundColor: theme.backgroundElement,
        borderRadius: 14,
      }}
    >
      {children}
    </Column>
  );
}

/** 区块标题：替代 FieldGroup.Section 的 title（分组卡片不嵌 SwiftUI Form） */
export function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      style={{ paddingTop: 20, paddingBottom: 8, paddingLeft: 4 }}
      textStyle={{ fontSize: 13, color: theme.textSecondary }}
    >
      {children}
    </Text>
  );
}

/** 分组行之间的发丝线 */
export function HairLine() {
  const theme = useTheme();
  return (
    <Row style={{ height: 1, backgroundColor: theme.backgroundSelected }}>
      <Spacer flexible />
    </Row>
  );
}

/**
 * 分组卡片里的「标签 / 值」行（详情页的基础信息、用药人的基本信息共用）。
 *
 * 行高对齐 iOS 分组列表：12pt 上下内边距 + 15pt 文字 ≈ 44pt。值列允许压缩折行
 * （`unconstrainedWidth`）—— 长规格名、过敏原列表会把整行撑爆，让标签列先让位。
 */
export function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  /** 值需要警示时传语义色（过期日期、处方药） */
  valueColor?: string;
}) {
  const theme = useTheme();
  return (
    <Row
      alignment="center"
      style={{
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.rowGap,
      }}
    >
      <Text textStyle={{ fontSize: 15, color: theme.text }}>{label}</Text>
      <Spacer flexible />
      <Column modifiers={[nativeLayout({ unconstrainedWidth: true })]}>
        <Text
          numberOfLines={2}
          textStyle={{
            fontSize: 15,
            color: valueColor ?? theme.textSecondary,
            textAlign: "right",
          }}
        >
          {value}
        </Text>
      </Column>
    </Row>
  );
}
