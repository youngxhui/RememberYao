import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { TextInput } from "react-native";
import { Button, Text, View, XStack, YStack } from "tamagui";

import { GlassChip } from "@/components/glass-chip";
import { RnDateTimePicker } from "@/components/rn-datetime-picker";
import {
  ChipField,
  ErrorText,
  Field,
  FieldRow,
  FormSection,
  HintText,
  Subtitle,
} from "@/components/rn-form";
import { InputShell } from "@/components/rn-input-shell";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { pickerFormat, useI18n } from "@/i18n";
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
  useMedication,
  usePersons,
  usePacksForMedication,
  type MedicationCategory,
  type MedicationInput,
  type MedicationType,
  type MedicationUnit,
} from "@/lib/store";

/**
 * 添加 / 编辑药品。视觉基准 = design/add-medication.html。
 *
 * 表单结构：hero 标题 + 三段表单卡片 + 底部操作栏。label 在输入框上方、
 * 输入框是圆角描边底 —— 与 iOS 原生 FieldGroup（Form，label 在左、整行分隔）
 * 不是一回事，所以这里用 ScrollView + 卡片拼。
 *
 * 三个枚举字段（包装形式 / 单位 / 用途分类）用 GlassChip 行而不是 Picker：
 * Picker 在 iOS 上是原生 Menu 胶囊，不吃 style，套进输入框盒子就是「盒子里
 * 再嵌一颗绿胶囊」，且窄列里中文选项会被折行。这三个枚举都只有 2~3 个取值，
 * chip 一次点选也比下拉两步更短，且与药品库的分类筛选是同一套控件。
 */
export default function MedicationFormScreen() {
  const router = useRouter();
  const { t, language } = useI18n();
  const picker = pickerFormat(language);
  // 只剩两处要真实色值：RN TextInput 的 style 不解析 $token（输入文字色），
  // RnDateTimePicker 的 accentColor 是原生视图 prop
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const { data: medication, loading: medicationLoading } = useMedication(id);
  const { data: packs, loading: packsLoading } = usePacksForMedication(id);
  const { data: persons, loading: personsLoading } = usePersons();
  const loading = medicationLoading || packsLoading || personsLoading;
  const existing = medication ?? undefined;
  const hasTwin = existing ? packs.length > 0 : false;

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
  const [rowsText, setRowsText] = useState("3");
  const [colsText, setColsText] = useState("10");
  const [packsText, setPacksText] = useState("1");

  const [name, setName] = useState("");
  const [specification, setSpecification] = useState("");
  const [totalQuantity, setTotalQuantity] = useState("");
  const [remainingQuantity, setRemainingQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [blisterRows, setBlisterRows] = useState("3");
  const [blisterCols, setBlisterCols] = useState("10");
  const [blisterPackCount, setBlisterPackCount] = useState("1");

  const isBlister = type === "blister";
  const rowsValue = Number.parseInt(rowsText, 10);
  const colsValue = Number.parseInt(colsText, 10);
  const packsValue = Number.parseInt(packsText, 10);
  const perPackPreview =
    Number.isFinite(rowsValue) && Number.isFinite(colsValue)
      ? Math.max(0, rowsValue * colsValue)
      : 0;
  const packCountPreview =
    Number.isFinite(packsValue) && packsValue > 0 ? packsValue : 1;

  const filledRef = useRef(false);
  useEffect(() => {
    if (!id) return;
    if (filledRef.current || loading) return;
    filledRef.current = true;
    const current = medication;
    if (current) {
      setName(current.name);
      setSpecification(current.specification);
      setType(current.type);
      setCategory(current.category);
      setUnit(current.unit);
      setTotalQuantity(String(current.totalQuantity));
      setRemainingQuantity(String(current.remainingQuantity));
      setExpiryDate(current.expiryDate);
      setPrescription(current.prescription);
      setNotes(current.notes);
      if (current.blisterRows && current.blisterCols) {
        setBlisterRows(String(current.blisterRows));
        setBlisterCols(String(current.blisterCols));
        setRowsText(String(current.blisterRows));
        setColsText(String(current.blisterCols));
      }
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, medication, loading]);

  const save = async () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    let total = existing?.totalQuantity ?? 0;
    let remaining = existing?.remainingQuantity ?? 0;
    if (!isBlister) {
      total = Number.parseInt(totalQuantity, 10);
      if (!Number.isFinite(total) || total < 0) {
        setQuantityError(true);
        return;
      }
      const remainingRaw = Number.parseInt(remainingQuantity, 10);
      remaining = Number.isFinite(remainingRaw)
        ? Math.min(Math.max(remainingRaw, 0), total)
        : total;
    }

    let blister: MedicationInput["blister"];
    let blisterRowsValue: number | null = null;
    let blisterColsValue: number | null = null;
    if (isBlister) {
      const rows = Number.parseInt(blisterRows, 10);
      const cols = Number.parseInt(blisterCols, 10);
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
        const packCount = Number.parseInt(blisterPackCount, 10);
        if (!Number.isFinite(packCount) || packCount < 1 || packCount > 20) {
          setSpecError(true);
          return;
        }
        blister = { rows, cols, packCount };
      }
    }

    const input: MedicationInput = {
      name: name.trim(),
      type,
      category,
      specification: specification.trim(),
      unit,
      totalQuantity: total,
      remainingQuantity: remaining,
      blisterRows: blisterRowsValue,
      blisterCols: blisterColsValue,
      expiryDate,
      prescription,
      notes: notes.trim(),
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

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <YStack gap="four">
          <Subtitle text={t("medication.formSubtitle")} />

          <FormSection title={t("medication.sectionBasic")}>
            <Field label={t("medication.name")}>
              <InputShell>
                <TextInput
                  testID="medication-name-input"
                  placeholder={t("medication.namePlaceholder")}
                  autoFocus={!isEditing}
                  onChangeText={(value) => {
                    setName(value);
                    setNameError(false);
                  }}
                  value={name}
                  style={{ fontSize: 17, color: theme.text, padding: 0 }}
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
                  onChangeText={setSpecification}
                  style={{ fontSize: 15, color: theme.text, padding: 0 }}
                />
              </InputShell>
            </Field>

            <ChipField
              label={t("medication.type")}
              testID="medication-type"
              value={type}
              onChange={(value) => {
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
              <YStack gap="three">
                <FieldRow>
                  <Field label={t("medication.blisterRows")}>
                    <InputShell>
                      <TextInput
                        testID="medication-blister-rows-input"
                        placeholder={t("medication.blisterRowsPlaceholder")}
                        keyboardType="number-pad"
                        onChangeText={(value) => {
                          setBlisterRows(value);
                          setRowsText(value);
                          setSpecError(false);
                        }}
                        value={blisterRows}
                        style={{ fontSize: 15, color: theme.text, padding: 0 }}
                      />
                    </InputShell>
                  </Field>
                  <Field label={t("medication.blisterCols")}>
                    <InputShell>
                      <TextInput
                        testID="medication-blister-cols-input"
                        placeholder={t("medication.blisterColsPlaceholder")}
                        keyboardType="number-pad"
                        onChangeText={(value) => {
                          setBlisterCols(value);
                          setColsText(value);
                          setSpecError(false);
                        }}
                        value={blisterCols}
                        style={{ fontSize: 15, color: theme.text, padding: 0 }}
                      />
                    </InputShell>
                  </Field>
                </FieldRow>
                {!isEditing ? (
                  <Field label={t("medication.blisterPackCount")}>
                    <InputShell>
                      <TextInput
                        testID="medication-blister-packs-input"
                        placeholder={t(
                          "medication.blisterPackCountPlaceholder",
                        )}
                        keyboardType="number-pad"
                        onChangeText={(value) => {
                          setBlisterPackCount(value);
                          setPacksText(value);
                          setSpecError(false);
                        }}
                        value={blisterPackCount}
                        style={{ fontSize: 15, color: theme.text, padding: 0 }}
                      />
                    </InputShell>
                  </Field>
                ) : null}
                {specError ? (
                  <ErrorText text={t("medication.blisterSpecInvalid")} />
                ) : null}
                <Text fontSize={13} lineHeight={18} color="$textSecondary">
                  {isEditing
                    ? hasTwin
                      ? t("medication.blisterSpecHintExisting")
                      : t("medication.blisterSpecHintNoTwin")
                    : t("medication.blisterSpecHintNew", {
                        perPack: perPackPreview,
                        total: perPackPreview * packCountPreview,
                      })}
                </Text>
              </YStack>
            ) : (
              <YStack gap="three">
                <FieldRow>
                  <Field label={t("medication.currentStock")}>
                    <InputShell>
                      <TextInput
                        testID="medication-remaining-input"
                        placeholder={t("medication.currentStockPlaceholder")}
                        keyboardType="number-pad"
                        onChangeText={(value) => {
                          setRemainingQuantity(value);
                          setQuantityError(false);
                        }}
                        value={remainingQuantity}
                        style={{ fontSize: 15, color: theme.text, padding: 0 }}
                      />
                    </InputShell>
                  </Field>
                  <Field label={t("medication.totalStock")}>
                    <InputShell>
                      <TextInput
                        testID="medication-total-input"
                        placeholder={t("medication.totalStockPlaceholder")}
                        keyboardType="number-pad"
                        onChangeText={setTotalQuantity}
                        value={totalQuantity}
                        style={{ fontSize: 15, color: theme.text, padding: 0 }}
                      />
                    </InputShell>
                  </Field>
                </FieldRow>
                {quantityError ? (
                  <ErrorText text={t("medication.quantityInvalid")} />
                ) : null}
              </YStack>
            )}

            <Field label={t("medication.expiryDate")}>
              <XStack alignItems="center" gap="rowGap">
                {expiryDate ? (
                  <RnDateTimePicker
                    testID="medication-expiry-picker"
                    value={dateFromKey(expiryDate)}
                    mode="date"
                    accentColor={theme.primary}
                    locale={picker.locale}
                    onValueChange={(date) => {
                      setExpiryDate(dateKey(date));
                    }}
                  />
                ) : (
                  <Text fontSize={15} color="$textSecondary">
                    {t("medication.expiryUnset")}
                  </Text>
                )}
                <View flex={1} />
                <View
                  testID={
                    expiryDate
                      ? "medication-expiry-clear"
                      : "medication-expiry-set"
                  }
                  onPress={() => {
                    setExpiryDate(expiryDate ? null : dateKey(new Date()));
                  }}
                  accessibilityRole="button"
                >
                  <Text fontSize={14} fontWeight="600" color="$primary">
                    {expiryDate ? t("common.clear") : t("medication.expirySet")}
                  </Text>
                </View>
              </XStack>
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
                  onChangeText={setNotes}
                  style={{ fontSize: 15, color: theme.text, padding: 0 }}
                />
              </InputShell>
            </Field>

            <Field label={t("medication.takers")}>
              <Text fontSize={13} lineHeight={18} color="$textSecondary">
                {persons.length === 0
                  ? t("medication.takersNone")
                  : t("medication.takersHint")}
              </Text>
            </Field>

            <Field label={t("medication.prescription")}>
              <XStack gap="two">
                <GlassChip
                  testID="medication-prescription-yes"
                  label={t("medication.prescriptionYes")}
                  active={prescription}
                  onPress={() => {
                    setPrescription(true);
                  }}
                />
                <GlassChip
                  testID="medication-prescription-no"
                  label={t("medication.prescriptionNo")}
                  active={!prescription}
                  onPress={() => {
                    setPrescription(false);
                  }}
                />
              </XStack>
            </Field>
          </FormSection>

          <YStack gap="three" marginBottom="three">
            <Button
              testID="medication-save-button"
              onPress={() => {
                void save();
              }}
              alignSelf="stretch"
              backgroundColor="$primary press:$primarySoft"
              borderCurve="continuous"
              color="$onPrimary"
            >
              {t("medication.saveMedication")}
            </Button>
            <Button
              testID="medication-cancel-button"
              onPress={() => {
                router.back();
              }}
              alignSelf="stretch"
              borderWidth={1}
              borderColor="$border"
              backgroundColor="$surface press:$backgroundSelected"
              borderCurve="continuous"
              color="$text"
            >
              {t("common.cancel")}
            </Button>
            <YStack alignItems="center" paddingBlock="two">
              <Text fontSize={12} color="$textSecondary" textAlign="center">
                {t("medication.saveHint")}
              </Text>
            </YStack>
          </YStack>
        </YStack>
      </ScreenScaffold>
    </>
  );
}
