import { Text, View, XStack, YStack } from "tamagui";

import { GlassChip } from "@/components/glass-chip";
import { Spacing } from "@/constants/theme";

/**
 * 表单排版基元：视觉基准 = design/add-medication.html 的
 * `.form-section` / `.form-field` —— label 在控件**上方**、控件收在圆角描边盒子里、
 * 分区标题带左侧强调竖条。
 *
 * 与 iOS 原生 `FieldGroup`（SwiftUI Form：label 在左、整行分隔）是两套东西，
 * 不要混用 —— 原生 Form 那套只适合设置页。
 *
 * 间距/圆角写 Tamagui 的 token 名（`gap="three"`、`borderRadius="card"`），
 * 取值见根目录 tamagui.config.ts —— 它把 Spacing / Radius 映射成了 token。
 */

/** 卡片内边距，与 design/add-medication.html 的 .form-card padding 16px 一致 */
export const CARD_PADDING = Spacing.three;

/** 分区标题左侧强调竖条的宽高（design 的 .form-section-title border-left: 4px） */
const TITLE_BAR_WIDTH = 4;
const TITLE_BAR_HEIGHT = 16;

/** 标题下方的副标题（design 的 .hero-subtitle） */
export function Subtitle({ text }: { text: string }) {
  return (
    <Text fontSize={13} color="textSecondary">
      {text}
    </Text>
  );
}

/** 表单分区：标题带左侧强调竖条（design 的 .form-section-title border-left） */
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <YStack gap="three">
      <XStack alignItems="center" gap="three">
        <View
          width={TITLE_BAR_WIDTH}
          height={TITLE_BAR_HEIGHT}
          backgroundColor="primary"
          borderRadius={2}
        />
        <Text fontSize={15} fontWeight="700" color="text">
          {title}
        </Text>
      </XStack>
      <YStack
        backgroundColor="surface"
        borderWidth={1}
        borderColor="border"
        borderRadius="card"
        borderCurve="continuous"
        padding={CARD_PADDING}
        gap="three"
      >
        {children}
      </YStack>
    </YStack>
  );
}

/** 两列字段行（design 的 .form-row：grid 1fr 1fr）。 */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return <XStack gap="cardGap">{children}</XStack>;
}

/**
 * 字段：label 在上、控件在下（design 的 .form-field 是 column 布局）。
 *
 * 标签用 `textSecondary` 而不是 `text` —— 六个纯黑 600 标签会把整页压得很重，
 * 设计稿这里用的是中间调的 --fg-2。
 */
export function Field({
  label,
  style,
  children,
}: {
  label: string;
  style?: object;
  children: React.ReactNode;
}) {
  return (
    <YStack style={[{ gap: Spacing.one }, style]} gap="one">
      <Text fontSize={13} fontWeight="600" color="textSecondary">
        {label}
      </Text>
      {children}
    </YStack>
  );
}

/**
 * 枚举字段：label + 一行 chip。
 *
 * 不用 universal `Picker`（详见 medica/form.tsx 文件头说明）：iOS 上它是原生
 * `Menu` 胶囊，不吃 `style`，套进输入框盒子就是「盒子里再嵌一颗绿胶囊」，窄列里
 * 中文选项还会被折行。2~4 个取值用 chip 一次点选即选即得，也和药品库的分类筛选
 * 共用同一控件。
 */
export function ChipField({
  label,
  testID,
  value,
  onChange,
  options,
}: {
  label: string;
  /** chip 的 testID 前缀，实际 id 为 `<testID>-<选项值>` */
  testID: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label={label}>
      <XStack flexWrap="wrap" gap="two">
        {options.map((option) => (
          <GlassChip
            key={option.value}
            testID={`${testID}-${option.value}`}
            label={option.label}
            active={option.value === value}
            onPress={() => {
              onChange(option.value);
            }}
          />
        ))}
      </XStack>
    </Field>
  );
}

export function ErrorText({ text }: { text: string }) {
  return (
    <Text fontSize={13} fontWeight="500" color="danger">
      {text}
    </Text>
  );
}

/** 提示文案：与 ErrorText 同排版，但不染危险色 —— 说明性信息用 */
export function HintText({ text }: { text: string }) {
  return (
    <Text fontSize={13} color="textSecondary">
      {text}
    </Text>
  );
}
