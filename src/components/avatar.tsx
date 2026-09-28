import { RNHostView } from "@expo/ui";
import { Text as RNText, View as RNView } from "react-native";

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
 */
export function Avatar({ color, name, size = 32 }: AvatarProps) {
  return (
    <RNHostView style={{ width: size, height: size }}>
      <AvatarMark color={color} name={name} size={size} />
    </RNHostView>
  );
}
