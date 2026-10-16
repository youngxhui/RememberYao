import { Image } from "expo-image";
import { Text as RNText, View as RNView } from "react-native";

type AvatarProps = {
  color: string;
  name: string;
  /** 头像照片的本地文件 URI；给了就用照片，没给退回「底色 + 姓名首字」 */
  uri?: string;
  size?: number;
};

/**
 * 头像本体：圆形底色 + 姓名首字，或圆形照片。纯 RN 视图，
 * 整屏纯 RN的地方直接用它。
 *
 * 历史：双轨期还有 `Avatar`（RNHostView 包装）与 `MemberAvatar`（Expo UI 树里的
 * universal 实现）两份，给仍住在 Expo UI 树里的页面用；表单 / 详情 / 成员页全部
 * 迁完后已零调用，PR11 一并删除。
 */
export function AvatarMark({ color, name, uri, size = 32 }: AvatarProps) {
  if (uri) {
    return (
      // 圆角必须由这层 RN 容器裁（overflow: "hidden" + borderRadius），不能只指望
      // expo-image 的 Image 自带圆角 —— 塞进 RNHostView 时不保险，真机上见过方图。
      // 顺带用头像底色当加载中的占位，免得照片解码前露个空洞
      <RNView
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          overflow: "hidden",
        }}
      >
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          accessibilityLabel={name}
        />
      </RNView>
    );
  }

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
