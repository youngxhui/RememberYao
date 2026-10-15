import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View, ScrollView } from "react-native";

import { AvatarMark } from "@/components/avatar";
import { RnDateTimePicker } from "@/components/rn-datetime-picker";
import { ChipField, Field, FormSection, Subtitle } from "@/components/rn-form";
import { InputShell } from "@/components/rn-input-shell";
import { BottomTabInset, Spacing, Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { pickerFormat, useI18n, useTranslation } from "@/i18n";
import { requestNotificationPermission } from "@/lib/notifications";
import {
  addMedicationWithPlan,
  addPlan,
  dateToTime,
  defaultTimes,
  medicationUnitLabel,
  SELF_PERSON_ID,
  timeToDate,
  todayKey,
  useMedications,
  usePersons,
  type Medication,
} from "@/lib/store";

/** 快速添加支持的每日次数：方案表格最常见的三档，更多频次走完整的用药配置表单 */
const FREQ_OPTIONS = [1, 2, 3];

/**
 * 快速添加：**药名 → 服药频率与时间 → 保存并开启提醒**，一步建好「药品 + 用药
 * 配置 + 提醒」。
 *
 * 这是产品方案第三节「方案 A」的核心路径：首次用药的用户手里拿着一盒药，目标是
 * 「晚上 8 点提醒我吃药」。老流程要求他先填一大张药品档案（规格 / 分类 / 库存 /
 * 有效期 / 备注 / 是否处方药），再去另一页配时间 —— 把「设置提醒」变成了「建档案」
 * 的前置门槛。这里只问提醒所必需的两件事：吃什么药、什么时候提醒。
 *
 * 与完整表单（`medica/form.tsx`）、用药配置（`profile/plan-form.tsx`）的分工：
 *   - 本页只建提醒，库存 / 规格 / 备注一律后置，确认页给「完善库存与备注」入口；
 *   - 固定用药人为默认的「自己」—— 自己吃药是主场景，给家人配药走家人详情里的
 *     用药配置，不在这里加一个选人步骤抬高门槛；
 *   - 三步用单页状态机而不是三个路由：减少一次导航跳转，也让「上一步」不重建屏幕。
 *
 * 保存时机（方案第四节）：点「保存并开启提醒」时**先落库再请求通知权限**——
 * 数据不丢优先于权限，用户拒绝授权也不该让整条添加流程走进死路（回首页后首页的
 * 通知横幅仍可引导去系统设置开启）。
 */
export default function QuickAddScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
  const { language } = useI18n();
  const picker = pickerFormat(language);
  const { data: medications, loading: medicationsLoading } = useMedications();
  const { data: persons } = usePersons();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [nameText, setNameText] = useState("");
  const [freq, setFreq] = useState(1);
  const [times, setTimes] = useState<string[]>(defaultTimes(1));

  const self = persons.find((p) => p.id === SELF_PERSON_ID) ?? persons[0];
  const personId = self?.id ?? SELF_PERSON_ID;
  const trimmedName = nameText.trim();
  const matched = medications.find(
    (m) => m.name.trim().toLowerCase() === trimmedName.toLowerCase(),
  );
  const unit = medicationUnitLabel(matched?.unit ?? "tablet", t);

  const changeFreq = (count: number) => {
    setFreq(count);
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

  const save = async (completeLater: boolean) => {
    if (!trimmedName || saving) return;
    setSaving(true);
    try {
      let medicationId: string;
      if (matched) {
        await addPlan({
          medicationId: matched.id,
          personId,
          doseAmount: 1,
          times,
          startDate: todayKey(),
          endDate: null,
          enabled: true,
        });
        medicationId = matched.id;
      } else {
        const created = await addMedicationWithPlan({
          name: trimmedName,
          personId,
          times,
          doseAmount: 1,
        });
        medicationId = created.medication.id;
      }
      await requestNotificationPermission();
      if (completeLater) {
        router.replace({
          pathname: "/(tabs)/medica/form",
          params: { id: medicationId },
        });
      } else {
        router.replace("/(tabs)/home");
      }
    } finally {
      setSaving(false);
    }
  };

  const stepTitle =
    step === 1
      ? t("quickAdd.title1")
      : step === 2
        ? t("quickAdd.title2")
        : t("quickAdd.title3");

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>{stepTitle}</Stack.Title>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: Spacing.three,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: Spacing.screen, gap: Spacing.four }}>
          {step === 1 ? (
            <StepName
              name={nameText}
              onChangeName={setNameText}
              onPickExisting={(medication) => {
                setNameText(medication.name);
                setStep(2);
              }}
              medications={medications}
              loading={medicationsLoading}
            />
          ) : null}

          {step === 2 ? (
            <StepSchedule
              freq={freq}
              times={times}
              picker={picker}
              accentColor={theme.primary}
              onChangeFreq={changeFreq}
              onChangeTime={changeTime}
            />
          ) : null}

          {step === 3 ? (
            <StepConfirm
              name={trimmedName}
              matched={matched}
              freq={freq}
              times={times}
              unit={unit}
              personName={self?.name ?? t("person.defaultName")}
              personColor={self?.avatarColor ?? theme.primary}
              personPhoto={self?.avatarUri}
            />
          ) : null}

          {step === 1 ? (
            <Pressable
              testID="quick-add-next-button"
              onPress={() => {
                setStep(2);
              }}
              disabled={!trimmedName}
              style={({ pressed }) => ({
                backgroundColor: pressed
                  ? theme.primarySoft
                  : !trimmedName
                    ? theme.textSecondary
                    : theme.primary,
                borderRadius: Radius.card,
                borderCurve: "continuous",
                paddingVertical: Spacing.three,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
                opacity: !trimmedName ? 0.5 : 1,
              })}
            >
              <Text
                style={{
                  color: theme.onPrimary,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {t("quickAdd.next")}
              </Text>
            </Pressable>
          ) : null}

          {step === 2 ? (
            <View style={{ gap: Spacing.three }}>
              <Pressable
                testID="quick-add-next-button"
                onPress={() => {
                  setStep(3);
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
                  {t("quickAdd.next")}
                </Text>
              </Pressable>
              <Pressable
                testID="quick-add-back-button"
                onPress={() => {
                  setStep(1);
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
                  {t("quickAdd.back")}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {step === 3 ? (
            <View style={{ gap: Spacing.three }}>
              <Pressable
                testID="quick-add-save-button"
                onPress={() => {
                  void save(false);
                }}
                disabled={saving}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? theme.primarySoft : theme.primary,
                  borderRadius: Radius.card,
                  borderCurve: "continuous",
                  paddingVertical: Spacing.three,
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 44,
                  opacity: saving ? 0.6 : 1,
                })}
              >
                <Text
                  style={{
                    color: theme.onPrimary,
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                >
                  {t("quickAdd.saveAndEnable")}
                </Text>
              </Pressable>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Spacing.three,
                }}
              >
                <View style={{ flex: 1 }} />
                <Pressable
                  testID="quick-add-complete-button"
                  onPress={() => {
                    void save(true);
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: theme.primary,
                    }}
                  >
                    {t("quickAdd.completeLater")}
                  </Text>
                </Pressable>
                <View style={{ flex: 1 }} />
              </View>
              <Pressable
                testID="quick-add-back-button"
                onPress={() => {
                  setStep(2);
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
                  {t("quickAdd.back")}
                </Text>
              </Pressable>
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: Spacing.two,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {t("quickAdd.notifyHint")}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** 第一步：药名输入 + 从已有药品快速选择 */
function StepName({
  name,
  onChangeName,
  onPickExisting,
  medications,
  loading,
}: {
  name: string;
  onChangeName: (value: string) => void;
  onPickExisting: (medication: Medication) => void;
  medications: Medication[];
  loading: boolean;
}) {
  const theme = useTheme();
  const t = useTranslation();

  return (
    <>
      <Subtitle text={t("quickAdd.subtitle1")} />
      <FormSection title={t("quickAdd.sectionName")}>
        <Field label={t("medication.name")}>
          <InputShell>
            <TextInput
              testID="quick-add-name-input"
              placeholder={t("medication.namePlaceholder")}
              autoFocus
              onChangeText={onChangeName}
              value={name}
              style={{ fontSize: 17, color: theme.text, padding: 0 }}
            />
          </InputShell>
        </Field>
      </FormSection>

      {/* 从已有药品选择：省得重复建档；点选即视为复用该药，只再配一次时间 */}
      {loading ? null : medications.length > 0 ? (
        <FormSection title={t("quickAdd.sectionExisting")}>
          <View style={{ gap: Spacing.two }}>
            {medications.map((medication) => (
              <Pressable
                key={medication.id}
                testID={`quick-add-existing-${medication.id}`}
                onPress={() => {
                  onPickExisting(medication);
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: theme.text,
                    paddingVertical: Spacing.rowGap,
                  }}
                >
                  {medication.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </FormSection>
      ) : null}
    </>
  );
}

/** 第二步：每日次数 + 每次的具体时间 */
function StepSchedule({
  freq,
  times,
  picker,
  accentColor,
  onChangeFreq,
  onChangeTime,
}: {
  freq: number;
  times: string[];
  picker: ReturnType<typeof pickerFormat>;
  accentColor: string;
  onChangeFreq: (count: number) => void;
  onChangeTime: (index: number, date: Date) => void;
}) {
  const t = useTranslation();
  const theme = useTheme();

  return (
    <>
      <Subtitle text={t("quickAdd.subtitle2")} />
      <FormSection title={t("quickAdd.sectionFreq")}>
        <ChipField
          label={t("quickAdd.freqLabel")}
          testID="quick-add-freq"
          value={String(freq)}
          onChange={(value) => {
            onChangeFreq(Number(value));
          }}
          options={FREQ_OPTIONS.map((n) => ({
            value: String(n),
            label: t("quickAdd.freqCount", { count: n }),
          }))}
        />
        <View style={{ gap: Spacing.two }}>
          {times.map((time, index) => (
            <View
              key={index}
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
                accentColor={accentColor}
                locale={picker.locale}
                is24Hour={picker.is24Hour}
                testID={`quick-add-time-${index}`}
                onValueChange={(date) => {
                  onChangeTime(index, date);
                }}
              />
            </View>
          ))}
        </View>
      </FormSection>
    </>
  );
}

/** 第三步：确认卡 + 保存并开启提醒 */
function StepConfirm({
  name,
  matched,
  freq,
  times,
  unit,
  personName,
  personColor,
  personPhoto,
}: {
  name: string;
  matched: Medication | undefined;
  freq: number;
  times: string[];
  unit: string;
  personName: string;
  personColor: string;
  personPhoto?: string;
}) {
  const theme = useTheme();
  const t = useTranslation();

  return (
    <>
      <Subtitle text={t("quickAdd.subtitle3")} />
      <View
        style={{
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: Radius.card,
          borderCurve: "continuous",
          padding: Spacing.three,
          gap: Spacing.three,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.rowGap,
          }}
        >
          <AvatarMark
            color={personColor}
            name={personName}
            uri={personPhoto}
            size={40}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 17, fontWeight: "700", color: theme.text }}
            >
              {name}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontSize: 13, color: theme.textSecondary }}
            >
              {t("quickAdd.forSelf", { name: personName })}
            </Text>
          </View>
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.two,
          }}
        >
          <Text
            style={{
              fontFamily: "system-ui",
              fontSize: 15,
              color: theme.textSecondary,
            }}
          >
            {t("quickAdd.freqCount", { count: freq })}
          </Text>
          <View style={{ flex: 1 }} />
          <Text
            style={{
              fontFamily: "monospace",
              fontSize: 15,
              fontWeight: "600",
              color: theme.text,
            }}
          >
            {times.join("  ")}
          </Text>
        </View>

        <Text style={{ fontSize: 13, color: theme.textSecondary }}>
          {t("quickAdd.doseHint", { amount: 1, unit })}
        </Text>

        {matched ? (
          <Text style={{ fontSize: 12, color: theme.primary }}>
            {t("quickAdd.existingHint", { name })}
          </Text>
        ) : null}
      </View>
    </>
  );
}
