import { Image } from "expo-image";
import { Text, View } from "tamagui";

import { useTheme } from "@/hooks/use-theme";

type AvatarProps = {
  color: string;
  name: string;
  /** 头像照片的本地文件 URI；给了就用照片，没给退回「底色 + 姓名首字」 */
  uri?: string;
  size?: number;
};

/**
 * 头像本体：圆形底色 + 姓名首字，或圆形照片。Tamagui 视图，
 * 整屏 Tamagui 的地方直接用它。
 *
 * 照片仍是 `expo-image` 的 `Image`（项目规则：用 expo-image 不用 RN Image），
 * 它自带解码与占位，圆角由外层容器裁。
 *
 * 历史：双轨期还有 `Avatar`（RNHostView 包装）与 `MemberAvatar`（Expo UI 树里的
 * universal 实现）两份，给仍住在 Expo UI 树里的页面用；表单 / 详情 / 成员页全部
 * 迁完后已零调用，PR11 一并删除。
 */
export function AvatarMark({ color, name, uri, size = 32 }: AvatarProps) {
  const theme = useTheme();
  if (uri) {
    return (
      // 圆角必须由这层容器裁（overflow: "hidden" + borderRadius），不能只指望
      // expo-image 的 Image 自带圆角 —— 真机上见过方图。
      // 顺带用头像底色当加载中的占位，免得照片解码前露个空洞
      <View
        width={size}
        height={size}
        borderRadius={size / 2}
        backgroundColor={color}
        overflow="hidden"
      >
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          accessibilityLabel={name}
        />
      </View>
    );
  }

  return (
    <View
      width={size}
      height={size}
      borderRadius={size / 2}
      backgroundColor={color}
      alignItems="center"
      justifyContent="center"
    >
      <Text color={theme.onPrimary} fontSize={size * 0.44} fontWeight="600">
        {name.slice(0, 1)}
      </Text>
    </View>
  );
}
