import { Row } from "@expo/ui";
import type { ReactNode } from "react";

import { roundedBox } from "@/components/rounded-box";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** 卡片内边距，与 design/add-medication.html 的 .form-card padding 16px 一致 */
const CARD_PADDING = Spacing.three;

/**
 * 输入框外盒的半径与描边（design 的 .form-field input：border-radius 14px、
 * border 1.5px solid var(--border)）。
 *
 * 描边用 1.5 而非 1 —— 1px 在浅色底上几乎看不见。
 */
const INPUT_BOX_RADIUS = 14;
const INPUT_BOX_BORDER = 1.5;

/**
 * 带外盒的输入控件：chrome 全在 `Row` 上，`TextInput` 本身不写 style。
 *
 * 外盒不能直接写在 `TextInput` 的 style 里（`.border()` 画在 TextField 框沿上，
 * TextField 在 Column 里按内容理想宽度收缩，宽度一塌右边框就被父容器裁掉），
 * 必须由一层布局容器持有 —— 和药品库药品卡、profile 统计卡是同一个写法。
 *
 * 添加/编辑药品表单（`src/app/(tabs)/medica/form.tsx`）与药品详情页的补货输入
 * 共用它，避免两处各写一份圆角描边。
 */
export function InputShell({
  spacing,
  children,
}: {
  /** 行内多控件（有效期行）才需要传 */
  spacing?: number;
  children: ReactNode;
}) {
  const theme = useTheme();
  const box = roundedBox({
    color: theme.border,
    background: theme.canvas,
    radius: INPUT_BOX_RADIUS,
    width: INPUT_BOX_BORDER,
  });
  return (
    <Row
      alignment="center"
      spacing={spacing}
      style={{
        ...box.style,
        paddingHorizontal: CARD_PADDING,
        paddingVertical: Spacing.rowGap,
      }}
      modifiers={box.modifiers}
    >
      {children}
    </Row>
  );
}
