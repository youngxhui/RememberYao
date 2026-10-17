import { View, Text } from "react-native";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 分组卡片：替代嵌在 ScrollView 里的 FieldGroup / List —— 两者在 iOS 上分别是
 * SwiftUI Form / List，本身都是滚动容器，嵌进外层 ScrollView 会塌成零高、
 * 内容直接消失（真机实测），不能这么用。
 *
 * 两种底色：
 * - `fill`（默认）：`backgroundElement` —— 详情 / 成员详情 / 孪生的既有观感，改了默认值会动到那三屏。
 * - `outline`：`surface` + 1px `border` —— 设置页用的「灰底页面上的白卡片」
 *   （design/settings.html 的 .settings-card）。
 *
 * ⚠️ `outline` 档同样带 `overflow: "hidden"`（用来把行按压底色裁进圆角）。iOS 的菜单
 * `Picker` 弹出的是系统级 popover，按说不受祖先 clipsToBounds 影响，但这条**未经真机
 * 确认** —— 若设置页的语言 / 稍后提醒菜单被卡片裁掉，就把 `outline` 档的 overflow
 * 去掉、改成在行自身上裁。
 */
export function SectionCard({
  children,
  tone = "fill",
}: {
  children: React.ReactNode;
  tone?: "fill" | "outline";
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor:
          tone === "outline" ? theme.surface : theme.backgroundElement,
        borderRadius: Radius.card,
        borderCurve: "continuous",
        ...(tone === "outline"
          ? { borderWidth: 1, borderColor: theme.border }
          : null),
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

/**
 * 区块标题：替代 FieldGroup.Section 的 title（分组卡片不嵌 SwiftUI Form）。
 *
 * 间距语义：`paddingTop` 只管标题与屏幕/上一区块之间的「呼吸位」，区块之间
 * 的分隔由外层容器的 `gap` 承担 —— 两者是相加关系，不要再把 paddingTop 当
 * 主间距用（detail / settings 的 gap 24 + 这里 8 = 标题距上一区块 32，
 * 标题距自己的卡 8，贴近 iOS 分组列表「header 贴组、离组有距」的观感）。
 */
export function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        paddingTop: Spacing.two,
        paddingBottom: Spacing.two,
        paddingLeft: 4,
        fontSize: 13,
        color: theme.textSecondary,
        fontWeight: "500",
      }}
    >
      {children}
    </Text>
  );
}

/** 分组行之间的发丝线 */
export function HairLine() {
  const theme = useTheme();
  return (
    <View style={{ height: 1, backgroundColor: theme.backgroundSelected }} />
  );
}

/**
 * 分组卡片里的「标签 / 值」行（详情页的基础信息、用药人的基本信息共用）。
 *
 * 行高对齐 iOS 分组列表：12pt 上下内边距 + 15pt 文字 ≈ 44pt。值列允许压缩折行
 * —— 长规格名、过敏原列表会把整行撑爆，让标签列先让位。
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
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.rowGap,
        gap: Spacing.three,
      }}
    >
      <Text style={{ fontSize: 15, color: theme.text, flex: 1 }}>{label}</Text>
      <Text
        numberOfLines={2}
        style={{
          fontSize: 15,
          color: valueColor ?? theme.textSecondary,
          textAlign: "right",
          flex: 1,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
