import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { AvatarMark } from "@/components/avatar";
import { RnDateTimePicker } from "@/components/rn-datetime-picker";
import {
  ChipField,
  ErrorText,
  Field,
  FormSection,
  HintText,
  Subtitle,
} from "@/components/rn-form";
import { InputShell } from "@/components/rn-input-shell";
import { RnPicker } from "@/components/rn-picker";
import { HairLine } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { BottomTabInset, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { pickerFormat, useI18n, useTranslation } from "@/i18n";
import { requestNotificationPermission } from "@/lib/notifications";
import {
  applyPlanChanges,
  dateFromKey,
  dateKey,
  dateToTime,
  defaultTimes,
  medicationUnitLabel,
  timeToDate,
  todayKey,
  useMedications,
  usePersons,
  usePlan,
  type Medication,
} from "@/lib/store";

const TIMES_PER_DAY = [1, 2, 3, 4, 5, 6];

/** 新勾一味药时的默认剂量 */
const DEFAULT_DOSE = "1";

/**
 * 用药配置：**先定人，再定他要吃的那些药**。
 *
 * 人与药是一对多 —— 一味药可以好几个人吃，一个人也可以同时吃好几味药。所以这一页
 * 的主语是「用药人」，药品是**可多选**的一组：勾几味药就一次落多条配置，每味药各自
 * 的剂量单独填（单位不同：片 / 粒 / ml），而服用时间与起止日期是这组药共用的。编辑态
 * 同理：原来那味药被取消勾选，保存时就移除那条配置。
 *
 * 用药人是不是「可改」取决于入口：从用药人详情进来（`params.personId`）时人已经定了，
 * 只读展示头像 + 姓名，不再摆选择器；从药品详情进来（`params.medicationId`）时不知道
 * 谁吃，才用 `RnPicker` 选。
 *
 * 排版与添加药品、添加成员共用 rn-form 基元：画布底 + 分区卡片，label 在控件**上方**。
 * 但只有**文字输入**套 InputShell 圆角描边盒 —— 原生自绘控件（`RnPicker` /
 * `RnDateTimePicker`）自己就带一颗灰底胶囊，再套一层就是「盒子里嵌盒子」，一律裸放，
 * 并用 `accentColor` 上品牌色、用 App 语言定日期时间格式。
 *
 * 药品多选用 Checkbox 逐行列（Row 在 iOS 上是 HStack，不折行，药一多就溢出屏外）。
 * 用药人选项数量不定，用 `RnPicker` 的原生菜单而不是 chip 行。
 */
export default function PlanFormScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, language } = useI18n();
  const picker = pickerFormat(language);
  const params = useLocalSearchParams<{
    id?: string;
    personId?: string;
    medicationId?: string;
  }>();
  const isEditing = Boolean(params.id);
  const { data: medications, loading: medicationsLoading } = useMedications();
  const { data: persons, loading: personsLoading } = usePersons();
  const { data: editingPlan, loading: planLoading } = usePlan(params.id);
  const loading = medicationsLoading || personsLoading || planLoading;

  const [loaded, setLoaded] = useState(false);
  const [personId, setPersonId] = useState(params.personId ?? "");
  const [doses, setDoses] = useState<Record<string, string>>(() =>
    params.medicationId ? { [params.medicationId]: DEFAULT_DOSE } : {},
  );
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(
    null,
  );
  const [timesPerDay, setTimesPerDay] = useState(1);
  const [times, setTimes] = useState<string[]>(defaultTimes(1));
  const [startDate, setStartDate] = useState(todayKey());
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(todayKey());
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filledRef = useRef(false);
  useEffect(() => {
    if (filledRef.current || loading) return;
    filledRef.current = true;
    if (params.id) {
      const existing = editingPlan;
      if (existing) {
        setPersonId(existing.personId);
        setDoses({ [existing.medicationId]: String(existing.doseAmount) });
        setEditingMedicationId(existing.medicationId);
        setTimesPerDay(existing.times.length);
        setTimes(existing.times);
        setStartDate(existing.startDate);
        setHasEndDate(Boolean(existing.endDate));
        if (existing.endDate) setEndDate(existing.endDate);
        setEnabled(existing.enabled);
      }
    }
    if (!params.id && !params.personId && !personId) {
      setPersonId(persons[0]?.id ?? "");
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, editingPlan, loading]);

  const changeTimesPerDay = (count: number) => {
    setTimesPerDay(count);
    setTimes((prev) => {
      const next = prev.slice(0, count);
      const defaults = defaultTimes(count);
      while (next.length < count) next.push(defaults[next.length]);
      return next;
    });
  };

  const changeTime = (index: number, date: Date) => {
    setTimes((prev) =>
      prev.map((time, i) => (i === index ? dateToTime(date) : time)),
    );
  };

  const toggleMedication = (id: string) => {
    setDoses((prev) => {
      if (prev[id] !== undefined) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: DEFAULT_DOSE };
    });
    setError("");
  };

  const changeDose = (id: string, text: string) => {
    setDoses((prev) => ({ ...prev, [id]: text }));
    setError("");
  };

  const toggleEndDate = () => {
    const next = !hasEndDate;
    setHasEndDate(next);
    if (next && endDate < startDate) setEndDate(startDate);
  };

  const save = async () => {
    if (!personId) {
      setError(t("plan.errorPerson"));
      return;
    }
    const entries = medications
      .filter((m) => doses[m.id] !== undefined)
      .map((m) => ({
        medication: m,
        amount: Number.parseInt(doses[m.id], 10),
      }));
    if (entries.length === 0) {
      setError(t("plan.errorMedication"));
      return;
    }
    if (entries.some((e) => !Number.isFinite(e.amount) || e.amount <= 0)) {
      setError(t("plan.errorDose"));
      return;
    }
    if (times.length === 0) {
      setError(t("plan.errorTimes"));
      return;
    }
    if (new Set(times).size !== times.length) {
      setError(t("plan.errorDuplicateTimes"));
      return;
    }
    if (hasEndDate && endDate < startDate) {
      setError(t("plan.errorEndDate"));
      return;
    }
    if (!params.id) {
      await requestNotificationPermission();
    }
    const planId = params.id;
    const shared = {
      personId,
      times,
      startDate,
      endDate: hasEndDate ? endDate : null,
      enabled,
    };
    const editing = entries.find(
      (e) => e.medication.id === editingMedicationId,
    );
    await applyPlanChanges({
      add: entries
        .filter((e) => e.medication.id !== editingMedicationId)
        .map((e) => ({
          ...shared,
          medicationId: e.medication.id,
          doseAmount: e.amount,
        })),
      update:
        planId && editing
          ? [
              {
                id: planId,
                patch: {
                  ...shared,
                  medicationId: editing.medication.id,
                  doseAmount: editing.amount,
                },
              },
            ]
          : [],
      remove: planId && !editing ? [planId] : [],
    });
    router.back();
  };

  const remove = async () => {
    const planId = params.id;
    if (!planId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await applyPlanChanges({ remove: [planId] });
    router.back();
  };

  const title = isEditing ? t("plan.editTitle") : t("plan.formTitle");

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas }}>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>{title}</Stack.Title>
      </View>
    );
  }

  const selected = medications.filter((m) => doses[m.id] !== undefined);
  const presetPerson = persons.find((p) => p.id === params.personId);

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>{title}</Stack.Title>

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <View style={{ gap: Spacing.four }}>
          <Subtitle text={t("plan.formSubtitle")} />

          <FormSection title={t("plan.sectionPerson")}>
            {presetPerson ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Spacing.rowGap,
                  paddingVertical: Spacing.two,
                }}
              >
                <AvatarMark
                  color={presetPerson.avatarColor}
                  name={presetPerson.name}
                  uri={presetPerson.avatarUri}
                  size={36}
                />
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 17, fontWeight: "700", color: theme.text }}
                >
                  {presetPerson.name}
                </Text>
              </View>
            ) : (
              <Field label={t("plan.person")}>
                <RnPicker
                  testID="plan-person-picker"
                  value={personId}
                  options={[
                    { label: t("plan.personPlaceholder"), value: "" },
                    ...persons.map((p) => ({ label: p.name, value: p.id })),
                  ]}
                  onValueChange={(value) => {
                    setPersonId(value);
                  }}
                  placeholder={t("plan.personPlaceholder")}
                  menuTitle={t("plan.person")}
                />
              </Field>
            )}
            <HintText
              text={
                presetPerson
                  ? t("plan.personFixedHint")
                  : persons.length === 0
                    ? t("plan.noPersonHint")
                    : t("plan.personHint")
              }
            />
          </FormSection>

          <FormSection title={t("plan.sectionMedications")}>
            {medications.length === 0 ? (
              <HintText text={t("plan.noMedicationHint")} />
            ) : (
              <View style={{ gap: Spacing.three }}>
                <Field label={t("plan.medicationsLabel")}>
                  <View style={{ gap: Spacing.three }}>
                    {medications.map((m) => {
                      const checked = doses[m.id] !== undefined;
                      return (
                        <View key={m.id} style={{ gap: Spacing.two }}>
                          <CheckboxRow
                            testID={`plan-medication-${m.id}`}
                            label={m.name}
                            checked={checked}
                            onToggle={() => toggleMedication(m.id)}
                          />
                          {checked ? (
                            <DoseField
                              medication={m}
                              value={doses[m.id]}
                              onChange={(text) => changeDose(m.id, text)}
                            />
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </Field>
                {selected.length > 0 ? (
                  <HintText
                    text={t("plan.selectedCount", { count: selected.length })}
                  />
                ) : null}
                <HintText
                  text={
                    isEditing
                      ? t("plan.editUncheckHint")
                      : t("plan.medicationMultiHint")
                  }
                />
              </View>
            )}
          </FormSection>

          <FormSection title={t("plan.sectionTimes")}>
            <Field label={t("plan.timesPerDay")}>
              <RnPicker
                testID="plan-times-picker"
                value={timesPerDay}
                options={TIMES_PER_DAY.map((n) => ({
                  label: t("plan.perDay", { count: n }),
                  value: n,
                }))}
                onValueChange={(value) => {
                  changeTimesPerDay(Number(value));
                }}
                menuTitle={t("plan.timesPerDay")}
              />
            </Field>
            <HintText text={t("plan.timesSharedHint")} />
            <View style={{ gap: Spacing.two }}>
              {times.map((time, index) => (
                <View key={index}>
                  {index > 0 ? <HairLine /> : null}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: Spacing.two,
                      gap: Spacing.rowGap,
                    }}
                  >
                    <Text style={{ fontSize: 15, color: theme.text }}>
                      {t("plan.ordinal", { index: index + 1 })}
                    </Text>
                    <View style={{ flex: 1 }} />
                    <RnDateTimePicker
                      value={timeToDate(time)}
                      mode="time"
                      accentColor={theme.primary}
                      locale={picker.locale}
                      is24Hour={picker.is24Hour}
                      testID={`plan-dose-time-${index}`}
                      onValueChange={(date) => {
                        changeTime(index, date);
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </FormSection>

          <FormSection title={t("plan.sectionDateRange")}>
            <Field label={t("plan.startDate")}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <RnDateTimePicker
                  value={dateFromKey(startDate)}
                  mode="date"
                  accentColor={theme.primary}
                  locale={picker.locale}
                  testID="plan-start-date"
                  onValueChange={(date) => setStartDate(dateKey(date))}
                />
              </View>
            </Field>
            <Field label={t("plan.endDate")}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Spacing.rowGap,
                }}
              >
                {hasEndDate ? (
                  <RnDateTimePicker
                    value={dateFromKey(endDate)}
                    mode="date"
                    minimumDate={dateFromKey(startDate)}
                    accentColor={theme.primary}
                    locale={picker.locale}
                    testID="plan-end-date"
                    onValueChange={(date) => setEndDate(dateKey(date))}
                  />
                ) : (
                  <Text style={{ fontSize: 15, color: theme.textSecondary }}>
                    {t("plan.endDateUnlimited")}
                  </Text>
                )}
                <View style={{ flex: 1 }} />
                <Pressable
                  testID={
                    hasEndDate ? "plan-end-date-clear" : "plan-end-date-set"
                  }
                  onPress={toggleEndDate}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: theme.primary,
                    }}
                  >
                    {hasEndDate ? t("common.clear") : t("plan.endDateSet")}
                  </Text>
                </Pressable>
              </View>
            </Field>
          </FormSection>

          <FormSection title={t("plan.sectionStatus")}>
            <ChipField
              label={t("plan.enableLabel")}
              testID="plan-enabled"
              value={enabled ? "on" : "off"}
              onChange={(value) => {
                setEnabled(value === "on");
              }}
              options={[
                { value: "on", label: t("plan.enabledChip") },
                { value: "off", label: t("plan.disabledChip") },
              ]}
            />
            <HintText text={t("plan.statusHint")} />
          </FormSection>

          {error ? <ErrorText text={error} /> : null}

          <View style={{ gap: Spacing.three, marginBottom: Spacing.three }}>
            <Pressable
              testID="plan-save-button"
              onPress={() => {
                void save();
              }}
              style={({ pressed }) => ({
                backgroundColor: pressed ? theme.primarySoft : theme.primary,
                borderRadius: Radius.card,
                borderCurve: "continuous",
                paddingVertical: Spacing.three,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
              })}
            >
              <Text
                style={{
                  color: theme.onPrimary,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {t("plan.savePlan")}
              </Text>
            </Pressable>
            <Pressable
              testID="plan-cancel-button"
              onPress={() => {
                router.back();
              }}
              style={({ pressed }) => ({
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : theme.surface,
                borderRadius: Radius.card,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: theme.border,
                paddingVertical: Spacing.three,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
              })}
            >
              <Text
                style={{
                  color: theme.text,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {t("common.cancel")}
              </Text>
            </Pressable>
            {isEditing ? (
              <Pressable
                testID="plan-delete-button"
                onPress={() => {
                  void remove();
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "600",
                    color: theme.danger,
                    textAlign: "center",
                  }}
                >
                  {confirmDelete
                    ? t("common.confirmDelete")
                    : t("plan.deleteButtonAlt")}
                </Text>
              </Pressable>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: Spacing.three,
              }}
            >
              <View style={{ flex: 1 }} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.textSecondary,
                  textAlign: "center",
                }}
              >
                {t("plan.saveHint")}
              </Text>
              <View style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </ScreenScaffold>
    </>
  );
}

/** RN 勾选行：替代 Expo UI Checkbox（离开 Host 会丢 view config） */
function CheckboxRow({
  testID,
  label,
  checked,
  onToggle,
}: {
  testID: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onToggle}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.rowGap,
        paddingVertical: Spacing.two,
        backgroundColor: pressed ? theme.backgroundSelected : "transparent",
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderCurve: "continuous",
          borderWidth: 1.5,
          borderColor: checked ? theme.primary : theme.border,
          backgroundColor: checked ? theme.primary : theme.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked ? (
          <Text
            style={{
              color: theme.onPrimary,
              fontSize: 14,
              fontWeight: "700",
              lineHeight: 16,
            }}
          >
            ✓
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          fontSize: 15,
          color: checked ? theme.text : theme.textSecondary,
          fontWeight: checked ? "600" : "400",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 一味药的剂量输入 */
function DoseField({
  medication,
  value,
  onChange,
}: {
  medication: Medication;
  value: string;
  onChange: (text: string) => void;
}) {
  const t = useTranslation();
  const theme = useTheme();
  return (
    <Field
      label={t("plan.doseForMedication", {
        name: medication.name,
        unit: medicationUnitLabel(medication.unit, t),
      })}
    >
      <InputShell>
        <TextInput
          testID={`plan-dose-input-${medication.id}`}
          placeholder={t("plan.dosePlaceholder")}
          keyboardType="number-pad"
          value={value}
          onChangeText={onChange}
          style={{ fontSize: 15, color: theme.text, padding: 0 }}
        />
      </InputShell>
    </Field>
  );
}
