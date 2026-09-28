import { Column, Icon, Row, type IconName } from "@expo/ui";

import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 通栏行右端的圆形图标按钮（design 的 .icon-btn：首页添加药品、我的页设置与「+」）。
 *
 * 不用 `Button`：SwiftUI Button 的点击热区只包住 label，frame 撑到 44pt 之后
 * 热区反而缩回图标本身；Row + onPress 的手势挂在外层 frame 上，热区就是整圆。
 * universal 层没有按压态，按下时只有系统高亮（原生行同款），底色描边靠 style。
 */
export function RoundIconButton({
  testID,
  label,
  icon,
  size,
  iconSize,
  onPress,
}: {
  testID: string;
  /** 无障碍朗读名（Android 映射 contentDescription） */
  label: string;
  icon: IconName;
  /** 按钮外框，圆形 */
  size: number;
  /** 图标边长，小于外框留出内边距 */
  iconSize: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Row
      testID={testID}
      alignment="center"
      onPress={onPress}
      style={{
        width: size,
        height: size,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
      }}
    >
      {/* Row 的 frame 只把内容压到纵轴中线（alignment=center → .leading），
          横轴中线要靠这层 Column（alignment=center → frame 横向居中） */}
      <Column alignment="center" style={{ width: size }}>
        <Icon
          name={icon}
          size={iconSize}
          color={theme.text}
          accessibilityLabel={label}
        />
      </Column>
    </Row>
  );
}
