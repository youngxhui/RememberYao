import type { ReactNode } from "react";
import { XStack } from "tamagui";

/**
 * 输入框外盒：圆角描边底 + 内边距。
 *
 * 外盒不能直接写在 TextInput 的 style 里（TextInput 在 Column 里按内容理想宽度收缩，
 * 宽度一塌右边框就被父容器裁掉），必须由一层布局容器持有。
 *
 * 添加/编辑药品表单（`src/app/(tabs)/medica/form.tsx`）与后续表单共用它。
 * 里面的 TextInput 仍是 RN 原生输入框（自己带 chrome，不套第二层盒）。
 */
export function InputShell({
  spacing,
  children,
}: {
  /** 行内多控件（有效期行）才需要传 */
  spacing?: number;
  children: ReactNode;
}) {
  return (
    <XStack
      alignItems="center"
      gap={spacing}
      borderWidth={1.5}
      borderColor="$border"
      borderRadius={14}
      borderCurve="continuous"
      backgroundColor="$canvas"
      paddingInline="three"
      paddingBlock="rowGap"
    >
      {children}
    </XStack>
  );
}
