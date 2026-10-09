import {
  Button,
  Column,
  Host,
  Icon,
  Picker,
  Row,
  ScrollView,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from "@expo/ui";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { Chip } from "@/components/chip";
import {
  nativeButtonModifiers,
  nativeConcentricShape,
} from "@/components/native-layout";
import { BottomTabInset, Radius, Spacing } from "@/constants/theme";
import { useExpoUiContentWidth } from "@/hooks/use-expo-ui-content-width";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  DEFAULT_MEDICATION_CATEGORY,
  MEDICATION_CATEGORIES,
  MEDICATION_TYPES,
  MEDICATION_UNITS,
  addMedication,
  dateFromKey,
  dateKey,
  medicationCategoryLabel,
  medicationTypeLabel,
  medicationUnitLabel,
  updateMedication,
  useAppData,
  type MedicationCategory,
  type MedicationType,
  type MedicationUnit,
} from "@/lib/store";

/** 卡片内边距，与 design 的 .form-card padding 16px 一致 */
const CARD_PADDING = Spacing.three;

/** 分区标题左侧强调竖条的宽高（design 的 border-left: 4px） */
const TITLE_BAR_WIDTH = 4;
const TITLE_BAR_HEIGHT = 16;

/**
 * 添加 / 编辑药品。视觉基准 = design/add-medication.html。
 *
 * 设计稿是「hero 标题 + 拍照区 + 三段表单卡片 + 底部操作栏」的自定义布局，
 * label 在输入框上方、输入框是圆角描边底 —— 与 iOS 原生 `FieldGroup`（Form，
 * label 在左、整行分隔）不是一回事，所以这里按 detail.tsx 的做法用
 * `ScrollView` + 卡片拼，不要再把 `FieldGroup` 塞进 ScrollView（SwiftUI Form
 * 本身是滚动容器，嵌进去会塌成零高）。
 *
 * 三个 Picker 在 iOS 上是原生 `Menu` 胶囊且不接受 `style`，直接摆在输入框旁边
 * 会一个带框一个裸着，所以统一由 `SelectField` 套一层和输入框相同的盒子 ——
 * 两类控件在视觉上才是一套。
 *
 * 「剂型 / 用途」两栏在设计稿里是自由下拉（片·胶囊·液体·注射剂 / 自由文本），
 * 与本项目的 `type`（包装形式：板装·瓶装·散装）、`category`（用途分类枚举）
 * 语义不同 —— 这里保留项目既有的两个枚举，不新造一套会和药品库筛选打架的取值。
 */
export default function MedicationFormScreen() {
  const router = useRouter();
  const t = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const { medications, persons, loading } = useAppData();

  // 两列字段的固定宽度：卡片内可用宽减去列间距再对半。universal style 没有
  // flex，等分只能按实测内容宽算（同 profile 的三等分统计卡）
  const {
    width: contentWidth,
    onHostLayout,
    onLayoutContent,
  } = useExpoUiContentWidth();
  // 内容区宽减去两侧屏幕边距，就是这一页所有通栏块的实际可用宽度
  const fullWidth = Math.max(0, contentWidth - Spacing.screen * 2);
  // 两列字段宽 = 卡片内可用宽减去列间距再对半。必须夹到 0：实测宽还没回来时
  // fullWidth 是 0，直减会算出负数，而下游用 `width ? ...` 判断，负数是真值，
  // 会把一个负宽度传给原生 frame
  const fieldWidth = Math.max(
    0,
    Math.floor((fullWidth - CARD_PADDING * 2 - Spacing.cardGap) / 2),
  );
  // 拍照区在卡片之外，直接吃满通栏宽
  const photoWidth = fullWidth;

  const [loaded, setLoaded] = useState(!isEditing);
  const [type, setType] = useState<MedicationType>("bottle");
  const [category, setCategory] = useState<MedicationCategory>(
    DEFAULT_MEDICATION_CATEGORY,
  );
  const [unit, setUnit] = useState<MedicationUnit>("tablet");
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [prescription, setPrescription] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [quantityError, setQuantityError] = useState(false);

  const name = useNativeState("");
  const specification = useNativeState("");
  const totalQuantity = useNativeState("");
  const remainingQuantity = useNativeState("");
  const notes = useNativeState("");

  // 编辑模式下只填充一次：等数据加载完再填，避免把用户已输入的内容覆盖掉
  const filledRef = useRef(false);
  useEffect(() => {
    if (!id) return;
    if (filledRef.current || loading) return;
    filledRef.current = true;
    const existing = medications.find((m) => m.id === id);
    if (existing) {
      name.value = existing.name;
      specification.value = existing.specification;
      setType(existing.type);
      setCategory(existing.category);
      setUnit(existing.unit);
      totalQuantity.value = String(existing.totalQuantity);
      remainingQuantity.value = String(existing.remainingQuantity);
      setExpiryDate(existing.expiryDate);
      setPrescription(existing.prescription);
      notes.value = existing.notes;
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, medications, loading]);

  const save = async () => {
    if (!name.value.trim()) {
      setNameError(true);
      return;
    }
    const total = Number.parseInt(totalQuantity.value, 10);
    if (!Number.isFinite(total) || total < 0) {
      setQuantityError(true);
      return;
    }
    const remainingRaw = Number.parseInt(remainingQuantity.value, 10);
    const remaining = Number.isFinite(remainingRaw)
      ? Math.min(Math.max(remainingRaw, 0), total)
      : total;

    const input = {
      name: name.value.trim(),
      type,
      category,
      specification: specification.value.trim(),
      unit,
      totalQuantity: total,
      remainingQuantity: remaining,
      expiryDate,
      prescription,
      notes: notes.value.trim(),
    };
    if (id) {
      await updateMedication(id, input);
    } else {
      await addMedication(input);
    }
    router.back();
  };

  if (!loaded) return null;

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>
        {isEditing ? t("medication.editTitle") : t("medication.formTitle")}
      </Stack.Title>
      <Host
        seedColor={theme.primary}
        style={{ flex: 1 }}
        onLayout={onHostLayout}
        onLayoutContent={onLayoutContent}
      >
        <ScrollView
          showsIndicators={false}
          style={{ backgroundColor: theme.canvas }}
        >
          <Column
            spacing={Spacing.four}
            style={{
              paddingHorizontal: Spacing.screen,
              paddingVertical: Spacing.three,
              // 表单在 (tabs) 组内，尾部必须让开原生 tab 栏的高度，
              // 否则「保存药品」会被压在 tab 栏底下点不到
              paddingBottom: BottomTabInset + Spacing.four,
            }}
          >
            <Subtitle text={t("medication.formSubtitle")} />

            <PhotoScanArea width={photoWidth} />

            <FormSection title={t("medication.sectionBasic")}>
              {/* 药名是这一页的主字段，单独通栏并给更大的字号，其余字段缩到
                  两列 —— 全竖排五个全宽盒子会让页面又长又平 */}
              <Field label={t("medication.name")}>
                <TextInput
                  testID="medication-name-input"
                  placeholder={t("medication.namePlaceholder")}
                  autoFocus={!isEditing}
                  onChangeText={() => {
                    setNameError(false);
                  }}
                  value={name}
                  style={inputBox(theme)}
                  // 只放大字号，不加粗：textStyle 会连 placeholder 一起作用，
                  // 600 会让「例如：维生素 C」这个灰色提示也跟着变粗，很重
                  textStyle={{ fontSize: 17 }}
                />
              </Field>
              {nameError ? (
                <ErrorText text={t("medication.nameRequired")} />
              ) : null}

              <FieldRow>
                <Field label={t("medication.specification")} width={fieldWidth}>
                  <TextInput
                    testID="medication-specification-input"
                    placeholder={t("medication.specificationPlaceholder")}
                    value={specification}
                    style={inputBox(theme)}
                  />
                </Field>
                <SelectField
                  label={t("medication.type")}
                  width={fieldWidth}
                  testID="medication-type-picker"
                  selectedValue={type}
                  onValueChange={(value) => {
                    setType(value as MedicationType);
                  }}
                  items={MEDICATION_TYPES.map((tp) => ({
                    value: tp,
                    label: medicationTypeLabel(tp, t),
                  }))}
                />
              </FieldRow>

              <FieldRow>
                <SelectField
                  label={t("medication.unit")}
                  width={fieldWidth}
                  testID="medication-unit-picker"
                  selectedValue={unit}
                  onValueChange={(value) => {
                    setUnit(value as MedicationUnit);
                  }}
                  items={MEDICATION_UNITS.map((u) => ({
                    value: u,
                    label: medicationUnitLabel(u, t),
                  }))}
                />
                <SelectField
                  label={t("medication.categoryField")}
                  width={fieldWidth}
                  testID="medication-category-picker"
                  selectedValue={category}
                  onValueChange={(value) => {
                    setCategory(value as MedicationCategory);
                  }}
                  items={MEDICATION_CATEGORIES.map((c) => ({
                    value: c,
                    label: medicationCategoryLabel(c, t),
                  }))}
                />
              </FieldRow>
            </FormSection>

            <FormSection title={t("medication.sectionStockManage")}>
              <FieldRow>
                <Field label={t("medication.currentStock")} width={fieldWidth}>
                  <TextInput
                    testID="medication-remaining-input"
                    placeholder={t("medication.currentStockPlaceholder")}
                    keyboardType="number-pad"
                    onChangeText={() => {
                      setQuantityError(false);
                    }}
                    value={remainingQuantity}
                    style={inputBox(theme)}
                  />
                </Field>
                <Field label={t("medication.totalStock")} width={fieldWidth}>
                  <TextInput
                    testID="medication-total-input"
                    placeholder={t("medication.totalStockPlaceholder")}
                    keyboardType="number-pad"
                    value={totalQuantity}
                    style={inputBox(theme)}
                  />
                </Field>
              </FieldRow>
              {quantityError ? (
                <ErrorText text={t("medication.quantityInvalid")} />
              ) : null}

              <Field label={t("medication.expiryDate")}>
                <Row
                  alignment="center"
                  spacing={Spacing.rowGap}
                  style={inputBox(theme)}
                >
                  {expiryDate ? (
                    <DateTimePicker
                      testID="medication-expiry-picker"
                      value={dateFromKey(expiryDate)}
                      mode="date"
                      display="compact"
                      onValueChange={(_, date) => {
                        setExpiryDate(dateKey(date));
                      }}
                    />
                  ) : (
                    <Text
                      textStyle={{ fontSize: 15, color: theme.textSecondary }}
                    >
                      {t("medication.expiryUnset")}
                    </Text>
                  )}
                  <Spacer flexible />
                  {/* 有效期可空：设了要能清掉，否则「未记录」这个语义进得去出不来 */}
                  <Text
                    testID={
                      expiryDate
                        ? "medication-expiry-clear"
                        : "medication-expiry-set"
                    }
                    onPress={() => {
                      setExpiryDate(expiryDate ? null : dateKey(new Date()));
                    }}
                    textStyle={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: theme.primary,
                    }}
                  >
                    {expiryDate ? t("common.clear") : t("medication.expirySet")}
                  </Text>
                </Row>
              </Field>
            </FormSection>

            <FormSection title={t("medication.sectionOther")}>
              <Field label={t("medication.notes")}>
                <TextInput
                  testID="medication-notes-input"
                  placeholder={t("medication.notesFieldPlaceholder")}
                  multiline
                  numberOfLines={3}
                  value={notes}
                  style={inputBox(theme)}
                />
              </Field>

              <Field label={t("medication.takers")}>
                {/* 服用对象不属于药品：谁吃什么药是「用药配置」（MedicationPlan）的职责，
                    药品与用药人是多对多。表单里只提示去向，不在这里存 —— 存了就会和
                    plan 表双写同一份事实，改一处漏一处。 */}
                <Text
                  textStyle={{
                    fontSize: 13,
                    lineHeight: 18,
                    color: theme.textSecondary,
                  }}
                >
                  {persons.length === 0
                    ? t("medication.takersNone")
                    : t("medication.takersHint")}
                </Text>
              </Field>

              <Field label={t("medication.prescription")}>
                <Row spacing={Spacing.two}>
                  <Chip
                    testID="medication-prescription-yes"
                    label={t("medication.prescriptionYes")}
                    active={prescription}
                    onPress={() => {
                      setPrescription(true);
                    }}
                  />
                  <Chip
                    testID="medication-prescription-no"
                    label={t("medication.prescriptionNo")}
                    active={!prescription}
                    onPress={() => {
                      setPrescription(false);
                    }}
                  />
                </Row>
              </Field>
            </FormSection>

            <Column spacing={Spacing.three}>
              <Button
                testID="medication-save-button"
                label={t("medication.saveMedication")}
                onPress={() => {
                  void save();
                }}
                modifiers={nativeButtonModifiers({ fullWidth: true })}
              />
              <Button
                testID="medication-cancel-button"
                label={t("common.cancel")}
                variant="text"
                onPress={() => {
                  router.back();
                }}
                modifiers={nativeButtonModifiers({ fullWidth: true })}
              />
              <Row alignment="center">
                <Spacer flexible />
                <Text
                  textStyle={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {t("medication.saveHint")}
                </Text>
                <Spacer flexible />
              </Row>
            </Column>
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}

/**
 * 输入框 / 下拉的统一外盒：canvas 底 + 描边 + 14 圆角。
 *
 * 描边用 1.5 而非 1 —— 设计稿的 input 描边就是 1.5px，1px 在浅色底上几乎看不见。
 */
function inputBox(theme: ReturnType<typeof useTheme>) {
  return {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.rowGap,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: theme.canvas,
  } as const;
}

/** 两列字段行（design 的 .form-row：grid 1fr 1fr）。
 *  universal style 没有 flex，等宽只能靠外面算好的 `fieldWidth` 显式传下去。 */
function FieldRow({ children }: { children: React.ReactNode }) {
  return <Row spacing={Spacing.cardGap}>{children}</Row>;
}

/** 标题下方的副标题（design 的 .hero-subtitle） */
function Subtitle({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>{text}</Text>
  );
}

/**
 * 拍照识别药盒：设计稿的虚线大框。
 *
 * 功能还没做（`add-options` 里同一入口也标着「即将推出」），所以不给 onPress ——
 * 给一个按不动的框比不给框更让人困惑。
 *
 * 不用整块 opacity 降透明：那会把图标和文案一起洗白发虚。改成只压描边和图标
 * 的颜色，文案保持正常字色，视觉上仍是「未启用」但不脏。
 */
function PhotoScanArea({ width }: { width: number }) {
  const theme = useTheme();
  const t = useTranslation();
  // 实测宽还没回来时先不渲染：宽度 0 会画成一个看不见的细条，
  // 下一帧再撑开，表现为「闪一下」
  if (width <= 0) return null;
  return (
    <Column
      alignment="center"
      spacing={Spacing.two}
      style={{
        // 必须给显式宽度：VStack 按内容收缩，而这里最宽的子元素只有 56pt 圆和
        // 一行字。`nativeLayout({ fullWidth: true })` 的 maxWidth: Infinity 在
        // 这个位置撑不开（真机实测仍是小方块），显式数字宽度才稳定
        width: width,
        paddingVertical: Spacing.four,
        borderRadius: Radius.card,
        // 虚线是 CSS 的 border-style，universal style 不支持，用实线描边表达同一意图
        borderWidth: 1.5,
        borderColor: theme.border,
        backgroundColor: theme.surface,
      }}
      // 同心圆角替换掉 borderRadius 生成的那个 clipShape，其余 modifier 不变
      modifiers={nativeConcentricShape(Radius.card)}
    >
      <Row
        alignment="center"
        spacing={Spacing.two}
        style={{
          width: 56,
          height: 56,
          borderRadius: Radius.pill,
          backgroundColor: theme.primarySoft,
        }}
      >
        <Spacer flexible />
        <Icon
          name="camera.fill"
          size={24}
          color={theme.primary}
          accessibilityLabel={t("medication.photoScan")}
        />
        <Spacer flexible />
      </Row>
      <Text textStyle={{ fontSize: 15, fontWeight: "600" }}>
        {t("medication.photoScan")}
      </Text>
      <Text
        textStyle={{
          fontSize: 12,
          fontWeight: "600",
          color: theme.textSecondary,
        }}
      >
        {t("medication.photoScanHint")}
      </Text>
    </Column>
  );
}

/** 表单分区：标题带左侧强调竖条（design 的 .form-section-title border-left） */
function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
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
        style={{
          padding: CARD_PADDING,
          borderRadius: Radius.card,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
        }}
        // 同心圆角替换掉 borderRadius 生成的那个 clipShape，其余 modifier 不变
        modifiers={nativeConcentricShape(Radius.card)}
      >
        {children}
      </Column>
    </Column>
  );
}

/**
 * 字段：label 在上、控件在下（design 的 .form-field 是 column 布局）。
 *
 * 标签用 `textSecondary` 而不是 `text` —— 六个纯黑 600 标签会把整页压得很重，
 * 设计稿这里用的是中间调的 --fg-2。
 */
function Field({
  label,
  width,
  children,
}: {
  label: string;
  /** 两列字段的等宽，由 `fieldWidth` 传入；通栏字段不传 */
  width?: number;
  children: React.ReactNode;
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
 * 下拉字段：`Picker` 外面套上和 `Field` 输入框相同的盒子。
 *
 * Picker 在 iOS 上是原生 `Menu` 胶囊，没有 `style` 可加，不套盒子的话它和旁边
 * 带框的输入框完全不是一个视觉体系。套上之后两类控件的尺寸、圆角、底色一致。
 */
function SelectField({
  label,
  testID,
  selectedValue,
  onValueChange,
  items,
  width,
}: {
  label: string;
  testID: string;
  selectedValue: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: string }[];
  /** 两列字段的等宽，由 `fieldWidth` 传入；通栏字段不传 */
  width?: number;
}) {
  const theme = useTheme();
  return (
    <Field label={label} width={width}>
      <Row
        alignment="center"
        spacing={Spacing.two}
        style={{ ...inputBox(theme), ...(width ? { width } : undefined) }}
      >
        <Spacer flexible />
        <Picker
          testID={testID}
          selectedValue={selectedValue}
          onValueChange={onValueChange}
        >
          {items.map((item) => (
            <Picker.Item
              key={item.value}
              label={item.label}
              value={item.value}
            />
          ))}
        </Picker>
        <Spacer flexible />
      </Row>
    </Field>
  );
}

function ErrorText({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Text textStyle={{ fontSize: 13, fontWeight: "500", color: theme.danger }}>
      {text}
    </Text>
  );
}
