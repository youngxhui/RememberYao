import { RNHostView } from "@expo/ui";
import { Text as RNText, View as RNView } from "react-native";

/**
 * 用药人头像：圆形底色 + 姓名首字。
 * 在 Expo UI（SwiftUI）树中通过 RNHostView 承载 RN 视图。
 */
export function Avatar({
  color,
  name,
  size = 32,
}: {
  color: string;
  name: string;
  size?: number;
}) {
  return (
    <RNHostView style={{ width: size, height: size }}>
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
    </RNHostView>
  );
}
