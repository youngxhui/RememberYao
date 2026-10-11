import { Column, Icon, Row, RNHostView, Text } from "@expo/ui";
import { Text as RNText, View as RNView } from "react-native";

import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

type AvatarProps = {
  color: string;
  name: string;
  size?: number;
};

/**
 * 头像本体：圆形底色 + 姓名首字。纯 RN 视图，
 * 整屏纯 RN 的地方（如「我的」的家庭成员卡）直接用它。
 */
export function AvatarMark({ color, name, size = 32 }: AvatarProps) {
  return (
    <RNView
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <RNText
        style={{
          color: "#fff",
          fontSize: size * 0.44,
          fontWeight: "600",
        }}
      >
        {name.slice(0, 1)}
      </RNText>
    </RNView>
  );
}

/**
 * 用药人头像：在 Expo UI（SwiftUI）树中通过 RNHostView 承载 RN 视图。
 * 纯 RN 页面不要用它，直接用 AvatarMark。
 *
 * ⚠️ 只在「父容器能给死尺寸」的地方用：iOS 适配层不转发 RNHostView 的 `style`
 * （见 docs/conventions/expo-ui-layout.md），`matchContents` 又是 false，尺寸
 * 全靠父容器提议 —— 放进「弹性 Spacer 居中」的栈里会把外层 Column 的理想宽度
 * 带崩（个人信息页实测：后面的分区卡片被顶出屏外）。固定尺寸的头像请用
 * `MemberAvatar`（纯原生实现，两屏共用同一颗头像）。
 */
export function Avatar({ color, name, size = 32 }: AvatarProps) {
  return (
    <RNHostView style={{ width: size, height: size }}>
      <AvatarMark color={color} name={name} size={size} />
    </RNHostView>
  );
}

/**
 * Expo UI 树里的圆形头像：底色 + 姓名首字，没有名字时给图标占位。
 *
 * 纯 universal 组件，不走 RNHostView —— universal `style` 的 width/height 会
 * 真的变成 SwiftUI `frame`，尺寸是确定的，塞进 `Row` + 弹性 `Spacer` 里居中
 * 也不会殃及外层布局（`Avatar` 那条坑见上）。
 *
 * 添加成员表单的头像预览与个人信息页的大头像是同一个组件：同一个人的头像在
 * 两屏必须长得一模一样。
 */
export function MemberAvatar({ color, name, size = 64 }: AvatarProps) {
  const theme = useTheme();
  const initial = name.trim().slice(0, 1);
  return (
    <Row
      alignment="center"
      style={{
        width: size,
        height: size,
        borderRadius: Radius.pill,
        backgroundColor: initial ? color : theme.primarySoft,
        borderWidth: initial ? 0 : 1,
        borderColor: theme.border,
      }}
    >
      {/* Row 只把内容压到纵轴中线，横轴中线靠这层 Column（同 RoundIconButton） */}
      <Column alignment="center" style={{ width: size }}>
        {initial ? (
          <Text
            textStyle={{
              fontSize: size * 0.44,
              fontWeight: "700",
              color: theme.onPrimary,
              textAlign: "center",
            }}
          >
            {initial}
          </Text>
        ) : (
          <Icon name="person" size={size * 0.5} color={theme.primary} />
        )}
      </Column>
    </Row>
  );
}
