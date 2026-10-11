import { Row, Text } from "@expo/ui";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 胶囊标签（design/*.html 的 .chip）的跨平台入口。
 *
 * 平台分工（同 `native-date-picker`：base 是兜底，两端各自覆盖）：
 * - iOS：`chip.ios.tsx`，iOS 26 液态玻璃 `glassEffect(.regular, in: .capsule)`。
 * - Android：`chip.android.tsx`，Material 3 官方 `FilterChip`（选中/按压动画、涟漪、
 *   大字号都是原生的）。
 * - web / 兜底（本文件）：universal `Row` + `style` 拼一颗静态药丸。
 *
 * 为什么两端都要覆盖：universal style 画不出液态玻璃，也拿不到 Compose chip 的
 * 那套状态动画 —— 但 web 没有这两个原生材质，只能退到「看得见的一颗药丸」。
 * 之前这里是「只剩文字」（无底色无描边），本文件补上 surface 底 + border 描边，
 * 与 design 的 .chip 取色一致。
 */
export function Chip({
  testID,
  label,
  active,
  onPress,
}: {
  /** 只有可点的 chip 才是可交互控件，需要 testID 供端到端测试定位 */
  testID?: string;
  label: string;
  active: boolean;
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
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? theme.primary : theme.border,
        backgroundColor: active ? theme.primary : theme.surface,
      }}
    >
      <Text
        textStyle={{
          fontSize: 14,
          fontWeight: "600",
          color: active ? theme.onPrimary : theme.textSecondary,
        }}
      >
        {label}
      </Text>
    </Row>
  );
}
