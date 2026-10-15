import { View, Text } from "react-native";

import { GlassChip } from "@/components/glass-chip";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * RN 表单排版基元：视觉基准 = design/add-medication.html 的
 * `.form-section` / `.form-field` —— label 在控件**上方**、控件收在圆角描边盒子里、
 * 分区标题带左侧强调竖条。
 *
 * 与 iOS 原生 `FieldGroup`（SwiftUI Form：label 在左、整行分隔）是两套东西，
 * 不要混用 —— 原生 Form 那套只适合设置页。
 */

/** 卡片内边距，与 design/add-medication.html 的 .form-card padding 16px 一致 */
export const CARD_PADDING = Spacing.three;

/** 分区标题左侧强调竖条的宽高（design 的 .form-section-title border-left: 4px） */
const TITLE_BAR_WIDTH = 4;
const TITLE_BAR_HEIGHT = 16;

/** 标题下方的副标题（design 的 .hero-subtitle） */
export function Subtitle({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text style={{ fontSize: 13, color: theme.textSecondary }}>{text}</Text>
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
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.three }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.three,
        }}
      >
        <View
          style={{
            width: TITLE_BAR_WIDTH,
            height: TITLE_BAR_HEIGHT,
            backgroundColor: theme.primary,
            borderRadius: 2,
          }}
        />
        <Text style={{ fontSize: 15, fontWeight: "700", color: theme.text }}>
          {title}
        </Text>
      </View>
      <View
        style={{
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: Radius.card,
          borderCurve: "continuous",
          padding: CARD_PADDING,
          gap: Spacing.three,
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** 两列字段行（design 的 .form-row：grid 1fr 1fr）。 */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: Spacing.cardGap }}>
      {children}
    </View>
  );
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
  const theme = useTheme();
  return (
    <View style={[{ gap: Spacing.one }, style]}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "600",
          color: theme.textSecondary,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

/**
 * 枚举字段：label + 一行 chip。
 *
 * 不用 universal `Picker`（详见 medica/form.tsx 文件头说明）：iOS 上它是原生
 * `Menu` 胶囊，不吃 `style`，套进输入框盒子就是「盒子里再嵌一颗绿胶囊」，窄列里
 * 中文选项还会被折行。2~4 个取值用 chip 一次点选即选即得，也和药品库的分类筛选
 * 共用同一套控件。
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
      <View
        style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.two }}
      >
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
      </View>
    </Field>
  );
}

export function ErrorText({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text style={{ fontSize: 13, fontWeight: "500", color: theme.danger }}>
      {text}
    </Text>
  );
}

/** 提示文案：与 ErrorText 同排版，但不染危险色 —— 说明性信息用 */
export function HintText({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text style={{ fontSize: 13, color: theme.textSecondary }}>{text}</Text>
  );
}
