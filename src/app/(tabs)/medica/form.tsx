import {
  Button,
  Column,
  Host,
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
  CARD_PADDING,
  ChipField,
  ErrorText,
  Field,
  FieldRow,
  FormSection,
  HintText,
  Subtitle,
} from "@/components/form";
import { InputShell } from "@/components/input-shell";
import { nativeButtonModifiers } from "@/components/native-layout";
import { BottomTabInset, Spacing } from "@/constants/theme";
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
  type MedicationInput,
  type MedicationType,
  type MedicationUnit,
} from "@/lib/store";

/**
 * 添加 / 编辑药品。视觉基准 = design/add-medication.html。
 *
 * 设计稿是「hero 标题 + 三段表单卡片 + 底部操作栏」的自定义布局，label 在输入框
 * 上方、输入框是圆角描边底 —— 与 iOS 原生 `FieldGroup`（Form，label 在左、整行
 * 分隔）不是一回事，所以这里按 detail.tsx 的做法用 `ScrollView` + 卡片拼，不要
 * 再把 `FieldGroup` 塞进 ScrollView（SwiftUI Form 本身是滚动容器，嵌进去会塌成
 * 零高）。
 *
 * 三个枚举字段（包装形式 / 单位 / 用途分类）用 chip 行而不是 universal `Picker`：
 * Picker 在 iOS 上是原生 `Menu` 胶囊，不吃 `style`，套进输入框盒子里就是「盒子里
 * 再嵌一颗绿胶囊」，且窄列里中文选项会被折行（「慢性病」裂成两行）。这三个枚举
 * 都只有 2~3 个取值，chip 一次点选也比下拉两步更短，且与药品库的分类筛选、本页
 * 「是否处方药」是同一套控件。
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
  const { medications, persons, packs, loading } = useAppData();
  const existing = id ? medications.find((m) => m.id === id) : undefined;
  /** 这台药已经建了泡罩孪生：包装形式锁死、规格只影响后续新板 */
  const hasTwin = existing
    ? packs.some((p) => p.medicationId === existing.id)
    : false;

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
  const [specError, setSpecError] = useState(false);
  // 规格输入的同步镜像：useNativeState 的写是异步排到 UI 线程的，
  // 「每板 N 粒」预览读它会慢一拍；onChangeText 同步回一份 React state 专供预览
  const [rowsText, setRowsText] = useState("3");
  const [colsText, setColsText] = useState("10");
  const [packsText, setPacksText] = useState("1");

  const name = useNativeState("");
  const specification = useNativeState("");
  const totalQuantity = useNativeState("");
  const remainingQuantity = useNativeState("");
  const notes = useNativeState("");
  // 板装规格：行 × 列 × 板数。用 useNativeState 而不是 React state ——
  // universal TextInput 的 value 只接受 ObservableState
  const blisterRows = useNativeState("3");
  const blisterCols = useNativeState("10");
  const blisterPackCount = useNativeState("1");

  const isBlister = type === "blister";
  // 「每板 N 粒 · 共 M 粒」预览。解析不了按 0 显示，真正的拦截在 save() 的校验
  const rowsValue = Number.parseInt(rowsText, 10);
  const colsValue = Number.parseInt(colsText, 10);
  const packsValue = Number.parseInt(packsText, 10);
  const perPackPreview =
    Number.isFinite(rowsValue) && Number.isFinite(colsValue)
      ? Math.max(0, rowsValue * colsValue)
      : 0;
  const packCountPreview =
    Number.isFinite(packsValue) && packsValue > 0 ? packsValue : 1;

  // 编辑模式下只填充一次：等数据加载完再填，避免把用户已输入的内容覆盖掉
  const filledRef = useRef(false);
  useEffect(() => {
    if (!id) return;
    if (filledRef.current || loading) return;
    filledRef.current = true;
    const current = medications.find((m) => m.id === id);
    if (current) {
      name.value = current.name;
      specification.value = current.specification;
      setType(current.type);
      setCategory(current.category);
      setUnit(current.unit);
      totalQuantity.value = String(current.totalQuantity);
      remainingQuantity.value = String(current.remainingQuantity);
      setExpiryDate(current.expiryDate);
      setPrescription(current.prescription);
      notes.value = current.notes;
      if (current.blisterRows && current.blisterCols) {
        blisterRows.value = String(current.blisterRows);
        blisterCols.value = String(current.blisterCols);
        setRowsText(String(current.blisterRows));
        setColsText(String(current.blisterCols));
      }
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, medications, loading]);

  const save = async () => {
    if (!name.value.trim()) {
      setNameError(true);
      return;
    }
    // 板装药的库存由板推导：编辑时沿用原值（不让手改，改了就和格子打架），
    // 新建时 addMedication 按板数重算
    let total = existing?.totalQuantity ?? 0;
    let remaining = existing?.remainingQuantity ?? 0;
    if (!isBlister) {
      total = Number.parseInt(totalQuantity.value, 10);
      if (!Number.isFinite(total) || total < 0) {
        setQuantityError(true);
        return;
      }
      const remainingRaw = Number.parseInt(remainingQuantity.value, 10);
      remaining = Number.isFinite(remainingRaw)
        ? Math.min(Math.max(remainingRaw, 0), total)
        : total;
    }

    let blister: MedicationInput["blister"];
    let blisterRowsValue: number | null = null;
    let blisterColsValue: number | null = null;
    if (isBlister) {
      const rows = Number.parseInt(blisterRows.value, 10);
      const cols = Number.parseInt(blisterCols.value, 10);
      if (
        !Number.isFinite(rows) ||
        !Number.isFinite(cols) ||
        rows < 1 ||
        cols < 1 ||
        rows > 12 ||
        cols > 12
      ) {
        setSpecError(true);
        return;
      }
      blisterRowsValue = rows;
      blisterColsValue = cols;
      if (!isEditing) {
        const packCount = Number.parseInt(blisterPackCount.value, 10);
        if (!Number.isFinite(packCount) || packCount < 1 || packCount > 20) {
          setSpecError(true);
          return;
        }
        blister = { rows, cols, packCount };
      }
    }

    const input: MedicationInput = {
      name: name.value.trim(),
      type,
      category,
      specification: specification.value.trim(),
      unit,
      totalQuantity: total,
      remainingQuantity: remaining,
      blisterRows: blisterRowsValue,
      blisterCols: blisterColsValue,
      expiryDate,
      prescription,
      notes: notes.value.trim(),
      ...(blister ? { blister } : null),
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

            <FormSection title={t("medication.sectionBasic")}>
              {/* 药名是这一页的主字段，单独通栏并给更大的字号；规格同样是通栏，
                  三个枚举字段换成 chip 行（见 ChipField） */}
              <Field label={t("medication.name")}>
                <InputShell>
                  <TextInput
                    testID="medication-name-input"
                    placeholder={t("medication.namePlaceholder")}
                    autoFocus={!isEditing}
                    onChangeText={() => {
                      setNameError(false);
                    }}
                    value={name}
                    // 只放大字号，不加粗：textStyle 会连 placeholder 一起作用，
                    // 600 会让「例如：维生素 C」这个灰色提示也跟着变粗，很重
                    textStyle={{ fontSize: 17 }}
                  />
                </InputShell>
              </Field>
              {nameError ? (
                <ErrorText text={t("medication.nameRequired")} />
              ) : null}

              <Field label={t("medication.specification")}>
                <InputShell>
                  <TextInput
                    testID="medication-specification-input"
                    placeholder={t("medication.specificationPlaceholder")}
                    value={specification}
                  />
                </InputShell>
              </Field>

              <ChipField
                label={t("medication.type")}
                testID="medication-type"
                value={type}
                onChange={(value) => {
                  // 已建孪生的板装药不能改包装形式：改了格子就对不上物理药板，
                  // 库存不变式也会破。要换包装只能删药重录
                  if (hasTwin && value !== "blister") return;
                  setType(value as MedicationType);
                }}
                options={MEDICATION_TYPES.map((tp) => ({
                  value: tp,
                  label: medicationTypeLabel(tp, t),
                }))}
              />
              {hasTwin ? (
                <HintText text={t("medication.typeLockedHint")} />
              ) : null}

              <ChipField
                label={t("medication.unit")}
                testID="medication-unit"
                value={unit}
                onChange={(value) => {
                  setUnit(value as MedicationUnit);
                }}
                options={MEDICATION_UNITS.map((u) => ({
                  value: u,
                  label: medicationUnitLabel(u, t),
                }))}
              />

              <ChipField
                label={t("medication.categoryField")}
                testID="medication-category"
                value={category}
                onChange={(value) => {
                  setCategory(value as MedicationCategory);
                }}
                options={MEDICATION_CATEGORIES.map((c) => ({
                  value: c,
                  label: medicationCategoryLabel(c, t),
                }))}
              />
            </FormSection>

            <FormSection title={t("medication.sectionStockManage")}>
              {isBlister ? (
                /* 板装药的库存不手填：每板行 × 列 × 板数就是库存，
                   数字孪生的格子是它的物理投影（见 docs/plans/medication-digital-twin.md） */
                <Column spacing={Spacing.three}>
                  <FieldRow>
                    <Field
                      label={t("medication.blisterRows")}
                      width={fieldWidth}
                    >
                      <InputShell>
                        <TextInput
                          testID="medication-blister-rows-input"
                          placeholder={t("medication.blisterRowsPlaceholder")}
                          keyboardType="number-pad"
                          onChangeText={(value) => {
                            blisterRows.value = value;
                            setRowsText(value);
                            setSpecError(false);
                          }}
                          value={blisterRows}
                        />
                      </InputShell>
                    </Field>
                    <Field
                      label={t("medication.blisterCols")}
                      width={fieldWidth}
                    >
                      <InputShell>
                        <TextInput
                          testID="medication-blister-cols-input"
                          placeholder={t("medication.blisterColsPlaceholder")}
                          keyboardType="number-pad"
                          onChangeText={(value) => {
                            blisterCols.value = value;
                            setColsText(value);
                            setSpecError(false);
                          }}
                          value={blisterCols}
                        />
                      </InputShell>
                    </Field>
                  </FieldRow>
                  {isEditing ? null : (
                    <Field label={t("medication.blisterPackCount")}>
                      <InputShell>
                        <TextInput
                          testID="medication-blister-packs-input"
                          placeholder={t(
                            "medication.blisterPackCountPlaceholder",
                          )}
                          keyboardType="number-pad"
                          onChangeText={(value) => {
                            blisterPackCount.value = value;
                            setPacksText(value);
                            setSpecError(false);
                          }}
                          value={blisterPackCount}
                        />
                      </InputShell>
                    </Field>
                  )}
                  {specError ? (
                    <ErrorText text={t("medication.blisterSpecInvalid")} />
                  ) : null}
                  <Text
                    textStyle={{
                      fontSize: 13,
                      color: theme.textSecondary,
                    }}
                  >
                    {isEditing
                      ? hasTwin
                        ? t("medication.blisterSpecHintExisting")
                        : t("medication.blisterSpecHintNoTwin")
                      : t("medication.blisterSpecHintNew", {
                          perPack: perPackPreview,
                          total: perPackPreview * packCountPreview,
                        })}
                  </Text>
                </Column>
              ) : (
                <>
                  <FieldRow>
                    <Field
                      label={t("medication.currentStock")}
                      width={fieldWidth}
                    >
                      <InputShell>
                        <TextInput
                          testID="medication-remaining-input"
                          placeholder={t("medication.currentStockPlaceholder")}
                          keyboardType="number-pad"
                          onChangeText={() => {
                            setQuantityError(false);
                          }}
                          value={remainingQuantity}
                        />
                      </InputShell>
                    </Field>
                    <Field
                      label={t("medication.totalStock")}
                      width={fieldWidth}
                    >
                      <InputShell>
                        <TextInput
                          testID="medication-total-input"
                          placeholder={t("medication.totalStockPlaceholder")}
                          keyboardType="number-pad"
                          value={totalQuantity}
                        />
                      </InputShell>
                    </Field>
                  </FieldRow>
                  {quantityError ? (
                    <ErrorText text={t("medication.quantityInvalid")} />
                  ) : null}
                </>
              )}

              <Field label={t("medication.expiryDate")}>
                <InputShell spacing={Spacing.rowGap}>
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
                </InputShell>
              </Field>
            </FormSection>

            <FormSection title={t("medication.sectionOther")}>
              <Field label={t("medication.notes")}>
                <InputShell>
                  <TextInput
                    testID="medication-notes-input"
                    placeholder={t("medication.notesFieldPlaceholder")}
                    multiline
                    numberOfLines={3}
                    value={notes}
                  />
                </InputShell>
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
