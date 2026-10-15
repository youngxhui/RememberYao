import { Row, Text } from "@expo/ui";
import { glassEffect } from "@expo/ui/swift-ui/modifiers";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 胶囊标签（design/*.html 的 .chip）的 iOS 实现：iOS 26 液态玻璃。
 * Android 走 Material 3 的官方 `FilterChip`，见 chip.android.tsx。
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
      // 不套 GlassEffectContainer：容器是用来让多个玻璃效果「融合」的，而筛选行的
      // chip 之间有 8pt 间距，本来也融不到一起；单个 glassEffect 在容器外同样正常
      // 渲染。也不给 interactive：它会让玻璃在按压时放大 / 回弹，而筛选 chip 是
      // 「看一眼就点一下」的低调控件，那个形变太抢戏。
      // 激活态才给 tint：未激活保持透明玻璃，选中那颗被品牌色染出层次
      modifiers={[
        glassEffect({
          glass: active
            ? { variant: "regular", tint: theme.primary }
            : { variant: "regular" },
          shape: "capsule",
        }),
      ]}
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
