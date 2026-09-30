import { Row, Text } from "@expo/ui";

import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 胶囊标签（design/*.html 的 .chip）。
 *
 * 激活态是「深墨实心 + 反色文字」而不是主色填充：筛选行常有 4~5 个 chip，
 * 全用主色会盖过内容本身；品牌色留给主按钮和激活 tab。
 *
 * `inset` 决定未激活时的底色 —— chip 落在页面底色（canvas）上时用 surface
 * 才有卡片感，落在卡片（surface）里时得反过来用 canvas，否则 chip 会和卡片
 * 同色、只剩一条描边。
 */
export function Chip({
  testID,
  label,
  active,
  inset = false,
  onPress,
}: {
  /** 只有可点的 chip 才是可交互控件，需要 testID 供端到端测试定位 */
  testID?: string;
  label: string;
  active: boolean;
  /** chip 是否落在卡片内部 */
  inset?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Row
      testID={testID}
      onPress={onPress}
      style={{
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderRadius: Radius.pill,
        // 1.5 是设计稿 chip 的描边宽度
        borderWidth: 1.5,
        borderColor: active ? theme.text : theme.border,
        backgroundColor: active
          ? theme.text
          : inset
            ? theme.canvas
            : theme.surface,
      }}
    >
      <Text
        textStyle={{
          fontSize: 14,
          fontWeight: "600",
          color: active ? theme.surface : theme.textSecondary,
        }}
      >
        {label}
      </Text>
    </Row>
  );
}
