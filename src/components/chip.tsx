import { Row, Text } from "@expo/ui";

import { nativeChipModifiers } from "@/components/native-layout";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 胶囊标签（design/*.html 的 .chip），iOS 26 液态玻璃。
 *
 * 磨砂底、高光描边、选中态的着色全部由 `glassEffect(.regular, in: .capsule)`
 * 绘制，JS 侧只留内边距 —— 再叠 backgroundColor / borderWidth 会把玻璃糊成
 * 一片，只剩一个药丸轮廓。选中态给 `.tint(theme.primary)`，与未激活的透明玻璃
 * 分层；品牌色本身仍只做着色、不抢内容。
 *
 * 玻璃要靠背后的内容起雾，落在页面底色上最出彩；贴在实心卡片里也剩得下一圈
 * 高光棱线，不会糊没。文字色不随明暗模式翻面 —— 玻璃的明暗由背后的页面底色
 * 决定，选中态底偏深配白字、未选中态底偏亮配黑字，两端都是这一组
 * （`onGlassChipActive` / `onGlassChipInactive`）。
 *
 * Android 的 Compose 没有液态玻璃，`nativeChipModifiers` 在那里返回 null ——
 * 见 native-layout.android.tsx 的说明（当前 Android 上 chip 暂无底色）。
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
      modifiers={
        nativeChipModifiers({ active, tint: theme.primary }) ?? undefined
      }
      style={{
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
      }}
    >
      <Text
        textStyle={{
          fontSize: 14,
          fontWeight: "600",
          color: active ? theme.onGlassChipActive : theme.onGlassChipInactive,
        }}
      >
        {label}
      </Text>
    </Row>
  );
}
