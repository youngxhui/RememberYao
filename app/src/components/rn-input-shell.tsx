import { type ReactNode } from "react";
import { View } from "react-native";

import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * RN 版输入框外盒：圆角描边底 + 内边距。
 *
 * 外盒不能直接写在 TextInput 的 style 里（TextInput 在 Column 里按内容理想宽度收缩，
 * 宽度一塌右边框就被父容器裁掉），必须由一层布局容器持有。
 *
 * 添加/编辑药品表单（`src/app/(tabs)/medica/form.tsx`）与后续表单共用它。
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
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing,
        borderWidth: 1.5,
        borderColor: theme.border,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: theme.canvas,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.rowGap,
      }}
    >
      {children}
    </View>
  );
}
