import type { ReactNode } from "react";
import { Text, View, XStack, YStack } from "tamagui";

import {
  HUGI_ICONS,
  HugeIcon,
  type HugeIconName,
} from "@/components/huge-icon";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/** 分组行内边距（design/settings.html 的 .setting-item padding 16px） */
export const ROW_PADDING = Spacing.three;
/** 行首图标尺寸（24px 画布按 strokeWidth 1.8 渲染，实际笔画约 1.35px） */
export const ICON_SIZE = 18;

/**
 * 一行设置：图标 + 标题 / 副标题在左，控件在右。
 *
 * 2026-10-19 从 `src/screens/profile/settings/setting-row.tsx` 提升到
 * `src/components/`：第二个屏幕（「我的 → RememberYao Pro」）开始复用，
 * 够上了 docs/conventions/ui-design.md 的提升门槛。设置页一族与 Pro 屏
 * 共用同一套行度量，观感不会裂。
 *
 * `onPress` 只给「导航行」：整行点击进下一层 / 开 sheet，右端是箭头或数值这类
 * 非交互内容。**控制行**（有 Switch / Picker）不给 `onPress` —— 否则外层手势会
 * 吞掉尾控件的点击，开关就点不动；控件自身接收点击即可。
 *
 * `icon` 可省略：2026-10-17 开发者要求二级屏不要行首图标（一级的三个分区入口仍带），
 * 所以图标是选修件而不是必填。
 *
 * 行壳用 Tamagui `View` 而不是 `Button`：设置行不是按钮，套 Button 会带一圈
 * 按钮基类样式（内边距、圆角、按压透明度）。按压底色走 `press:` 子句，
 * 由 Tamagui 自己接线，不需要 RN `Pressable` 的 style 函数。
 */
export function SettingRow({
  icon,
  label,
  sub,
  trailing,
  onPress,
  disabled,
  showChevron,
  testID,
}: {
  icon?: HugeIconName;
  label: string;
  sub?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  /** 不可用：置灰且不响应点击。控件本身也各自 disabled */
  disabled?: boolean;
  /** 行尾画「可进入下一层」的箭头 */
  showChevron?: boolean;
  testID?: string;
}) {
  // HugeIcon 的 color 直接喂给 SVG 的 stroke，收不了 Tamagui 的 token 名，
  // 仍走 useTheme() 取真实色值
  const theme = useTheme();
  const labelColor = disabled ? "textSecondary" : "text";

  const body = (
    <>
      {icon ? (
        <HugeIcon name={icon} size={ICON_SIZE} color={theme.primary} />
      ) : null}
      {/* 文本列让位（flex + minWidth 0）：长文案截断而不是把右端控件挤出屏幕 */}
      <YStack flex={1} minWidth={0} gap="half">
        <Text
          numberOfLines={1}
          fontSize={17}
          fontWeight="600"
          color={labelColor}
        >
          {label}
        </Text>
        {sub ? (
          <Text fontSize={13} color="textSecondary">
            {sub}
          </Text>
        ) : null}
      </YStack>
      {trailing}
      {showChevron ? (
        <HugeIcon
          name={HUGI_ICONS.chevronRight}
          size={14}
          color={theme.textSecondary}
        />
      ) : null}
    </>
  );

  const rowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: Spacing.rowGap,
    paddingInline: ROW_PADDING,
    paddingBlock: ROW_PADDING,
    minHeight: 44,
  };

  if (!onPress || disabled) {
    return (
      <View testID={testID} style={rowStyle}>
        {body}
      </View>
    );
  }
  return (
    <View
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      style={rowStyle}
      backgroundColor="background press:backgroundSelected"
    >
      {body}
    </View>
  );
}

/**
 * 分组行之间的发丝线。
 *
 * 缩进 = 行内边距，与文本列左缘齐 —— 设置页的行首没有图标（二级屏按开发者要求去掉），
 * 所以发丝线从文本起点开始，和 iOS 的无图标分组列表一致。
 */
export function RowDivider() {
  return <View height={1} marginLeft={ROW_PADDING} backgroundColor="border" />;
}

/** 行尾的等宽数值 + 展开箭头（design/settings.html 的 .setting-action） */
export function ValueAndChevron({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <XStack alignItems="center" gap="two">
      <Text fontSize={13} fontFamily="mono" color="textSecondary">
        {text}
      </Text>
      <HugeIcon
        name={HUGI_ICONS.chevronRight}
        size={14}
        color={theme.textSecondary}
      />
    </XStack>
  );
}
