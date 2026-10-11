import { Column, Row, Spacer, Text } from "@expo/ui";
import type { ReactNode } from "react";

import { Chip } from "@/components/chip";
import { nativeLayout } from "@/components/native-layout";
import { roundedBox } from "@/components/rounded-box";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

/**
 * 表单排版基元：视觉基准 = design/add-medication.html 的
 * `.form-section` / `.form-field` —— label 在控件**上方**、控件收在圆角描边盒子里、
 * 分区标题带左侧强调竖条。
 *
 * 添加药品（`src/app/(tabs)/medica/form.tsx`）与添加家庭成员
 * （`src/app/(tabs)/profile/persons.tsx`）共用这一套：两个表单必须是同一个视觉，
 * 各写一份就会各自漂移。注意它与 iOS 原生 `FieldGroup`（SwiftUI Form：label 在左、
 * 整行分隔）是两套东西，别混用 —— 原生 Form 那套只适合设置页。
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
    <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>{text}</Text>
  );
}

/** 表单分区：标题带左侧强调竖条（design 的 .form-section-title border-left） */
export function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const card = roundedBox({
    color: theme.border,
    background: theme.surface,
    radius: Radius.card,
    width: 1,
  });
  return (
    <Column spacing={Spacing.three}>
      <Row alignment="center" spacing={Spacing.three}>
        <Row
          style={{
            width: TITLE_BAR_WIDTH,
            height: TITLE_BAR_HEIGHT,
            backgroundColor: theme.primary,
          }}
        >
          <Spacer flexible />
        </Row>
        <Text textStyle={{ fontSize: 15, fontWeight: "700" }}>{title}</Text>
      </Row>
      <Column
        spacing={Spacing.three}
        style={{ ...card.style, padding: CARD_PADDING }}
        // 撑满 + 连续曲线圆角描边。不用 nativeConcentricShape：
        // ContainerRelativeShape 依赖「最近的容器提供形状」，而这张卡在
        // ScrollView 里，解析不到屏幕圆角时会退化成直角（native-layout 里的
        // 既有结论），圆角就废了
        modifiers={card.modifiers}
      >
        {/* iOS 的 modifier 链是 padding → background → frame(maxWidth:.infinity)：
            background 只覆盖「内容 + 内边距」的宽度，frame 后续把外框撑宽时
            不会带着背景一起撑（个人信息页真机实测：值全是抱内容宽的只读 Text
            时，白底缩成内容列居中，卡片其余部分透出画布底）。子列显式撑满，
            卡片底色才能铺满。表单页没暴露是因为 InputShell 自带
            frame(maxWidth:.infinity)，替它们把宽度填上了 */}
        <Column
          spacing={Spacing.three}
          modifiers={[nativeLayout({ fullWidth: true })]}
        >
          {children}
        </Column>
      </Column>
    </Column>
  );
}

/** 两列字段行（design 的 .form-row：grid 1fr 1fr）。
 *  universal style 没有 flex，等宽只能靠外面算好的 `fieldWidth` 显式传下去。 */
export function FieldRow({ children }: { children: ReactNode }) {
  return <Row spacing={Spacing.cardGap}>{children}</Row>;
}

/**
 * 字段：label 在上、控件在下（design 的 .form-field 是 column 布局）。
 *
 * 标签用 `textSecondary` 而不是 `text` —— 六个纯黑 600 标签会把整页压得很重，
 * 设计稿这里用的是中间调的 --fg-2。
 */
export function Field({
  label,
  width,
  children,
}: {
  label: string;
  /** 两列字段的等宽，由 `fieldWidth` 传入；通栏字段不传 */
  width?: number;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Column spacing={Spacing.one} style={width ? { width } : undefined}>
      <Text
        textStyle={{
          fontSize: 13,
          fontWeight: "600",
          color: theme.textSecondary,
        }}
      >
        {label}
      </Text>
      {children}
    </Column>
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
      <Row spacing={Spacing.two}>
        {options.map((option) => (
          <Chip
            key={option.value}
            testID={`${testID}-${option.value}`}
            label={option.label}
            active={option.value === value}
            onPress={() => {
              onChange(option.value);
            }}
          />
        ))}
      </Row>
    </Field>
  );
}

export function ErrorText({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text textStyle={{ fontSize: 13, fontWeight: "500", color: theme.danger }}>
      {text}
    </Text>
  );
}

/** 提示文案：与 ErrorText 同排版，但不染危险色 —— 说明性信息用 */
export function HintText({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>{text}</Text>
  );
}
