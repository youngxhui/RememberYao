import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { TextInput } from "react-native";
import { Button, Text, View, XStack, YStack } from "tamagui";

import { AvatarMark } from "@/components/avatar";
import { RnDateTimePicker } from "@/components/rn-datetime-picker";
import { ChipField, Field, FormSection, Subtitle } from "@/components/rn-form";
import { InputShell } from "@/components/rn-input-shell";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { BottomTabInset, Spacing } from "@/constants/theme";
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
  // 只剩两处要真实色值：RnDateTimePicker 的 accentColor（原生视图 prop），
  // 以及 AvatarMark 的头像底色（传进来再交给原生视图裁圆）
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
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>{stepTitle}</Stack.Title>

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <YStack gap="four">
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
            <Button
              testID="quick-add-next-button"
              onPress={() => {
                setStep(2);
              }}
              disabled={!trimmedName}
              alignSelf="stretch"
              backgroundColor={
                trimmedName ? "$primary press:$primarySoft" : "$textSecondary"
              }
              borderCurve="continuous"
              color="$onPrimary"
              opacity={trimmedName ? 1 : 0.5}
            >
              {t("quickAdd.next")}
            </Button>
          ) : null}

          {step === 2 ? (
            <YStack gap="three">
              <Button
                testID="quick-add-next-button"
                onPress={() => {
                  setStep(3);
                }}
                alignSelf="stretch"
                backgroundColor="$primary press:$primarySoft"
                borderCurve="continuous"
                color="$onPrimary"
              >
                {t("quickAdd.next")}
              </Button>
              <Button
                testID="quick-add-back-button"
                onPress={() => {
                  setStep(1);
                }}
                alignSelf="stretch"
                borderWidth={1}
                borderColor="$border"
                backgroundColor="$surface press:$backgroundSelected"
                borderCurve="continuous"
                color="$text"
              >
                {t("quickAdd.back")}
              </Button>
            </YStack>
          ) : null}

          {step === 3 ? (
            <YStack gap="three">
              <Button
                testID="quick-add-save-button"
                onPress={() => {
                  void save(false);
                }}
                disabled={saving}
                alignSelf="stretch"
                backgroundColor="$primary press:$primarySoft"
                borderCurve="continuous"
                color="$onPrimary"
                opacity={saving ? 0.6 : 1}
              >
                {t("quickAdd.saveAndEnable")}
              </Button>
              <XStack alignItems="center" gap="three">
                <View flex={1} />
                <View
                  testID="quick-add-complete-button"
                  onPress={() => {
                    void save(true);
                  }}
                  accessibilityRole="button"
                >
                  <Text fontSize={14} fontWeight="600" color="$primary">
                    {t("quickAdd.completeLater")}
                  </Text>
                </View>
                <View flex={1} />
              </XStack>
              <Button
                testID="quick-add-back-button"
                onPress={() => {
                  setStep(2);
                }}
                alignSelf="stretch"
                borderWidth={1}
                borderColor="$border"
                backgroundColor="$surface press:$backgroundSelected"
                borderCurve="continuous"
                color="$text"
              >
                {t("quickAdd.back")}
              </Button>
              <YStack alignItems="center" paddingBlock="two">
                <Text fontSize={12} color="$textSecondary" textAlign="center">
                  {t("quickAdd.notifyHint")}
                </Text>
              </YStack>
            </YStack>
          ) : null}
        </YStack>
      </ScreenScaffold>
    </>
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
  // RN TextInput 的 style 不解析 Tamagui 的 $token，输入文字色取真实值
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
          <YStack gap="two">
            {medications.map((medication) => (
              <View
                key={medication.id}
                testID={`quick-add-existing-${medication.id}`}
                onPress={() => {
                  onPickExisting(medication);
                }}
                accessibilityRole="button"
              >
                <Text fontSize={16} color="$text" paddingBlock="rowGap">
                  {medication.name}
                </Text>
              </View>
            ))}
          </YStack>
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
        <YStack gap="two">
          {times.map((time, index) => (
            <XStack
              key={index}
              alignItems="center"
              paddingBlock="two"
              gap="rowGap"
            >
              <Text fontSize={15} color="$text">
                {t("plan.ordinal", { index: index + 1 })}
              </Text>
              <View flex={1} />
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
            </XStack>
          ))}
        </YStack>
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
  const t = useTranslation();

  return (
    <>
      <Subtitle text={t("quickAdd.subtitle3")} />
      <YStack
        backgroundColor="$surface"
        borderWidth={1}
        borderColor="$border"
        borderRadius="card"
        borderCurve="continuous"
        padding="three"
        gap="three"
      >
        <XStack alignItems="center" gap="rowGap">
          <AvatarMark
            color={personColor}
            name={personName}
            uri={personPhoto}
            size={40}
          />
          <View flex={1} minWidth={0}>
            <Text
              numberOfLines={1}
              fontSize={17}
              fontWeight="700"
              color="$text"
            >
              {name}
            </Text>
            <Text numberOfLines={1} fontSize={13} color="$textSecondary">
              {t("quickAdd.forSelf", { name: personName })}
            </Text>
          </View>
        </XStack>

        <XStack alignItems="center" gap="two">
          <Text fontSize={15} color="$textSecondary">
            {t("quickAdd.freqCount", { count: freq })}
          </Text>
          <View flex={1} />
          <Text fontFamily="mono" fontSize={15} fontWeight="600" color="$text">
            {times.join("  ")}
          </Text>
        </XStack>

        <Text fontSize={13} color="$textSecondary">
          {t("quickAdd.doseHint", { amount: 1, unit })}
        </Text>

        {matched ? (
          <Text fontSize={12} color="$primary">
            {t("quickAdd.existingHint", { name })}
          </Text>
        ) : null}
      </YStack>
    </>
  );
}
