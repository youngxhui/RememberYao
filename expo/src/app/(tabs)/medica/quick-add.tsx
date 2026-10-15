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
  type ObservableState,
} from "@expo/ui";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";

import { MemberAvatar } from "@/components/avatar";
import { ChipField, Field, FormSection, Subtitle } from "@/components/form";
import { InputShell } from "@/components/input-shell";
import { NativeDatePicker } from "@/components/native-date-picker";
import {
  nativeButtonModifiers,
  nativeLayout,
} from "@/components/native-layout";
import { roundedBox } from "@/components/rounded-box";
import { BottomTabInset, Fonts, Radius, Spacing } from "@/constants/theme";
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
  // 已有药品用于「从已有药品选择」与「同名复用」；成员用于取默认的「自己」
  const { data: medications, loading: medicationsLoading } = useMedications();
  const { data: persons } = usePersons();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  // 药名的 React 镜像：useNativeState 的写异步排到 UI 线程，「下一步」是否可用、
  // 同名匹配要同步读，故额外留一份（同 medica/form.tsx 给规格预览用的镜像）
  const [nameText, setNameText] = useState("");
  const name = useNativeState("");
  const [freq, setFreq] = useState(1);
  const [times, setTimes] = useState<string[]>(defaultTimes(1));

  const self = persons.find((p) => p.id === SELF_PERSON_ID) ?? persons[0];
  const personId = self?.id ?? SELF_PERSON_ID;
  const trimmedName = nameText.trim();
  // 同名（忽略首尾空格与大小写）即复用：不为同一味药建两条档案，只新增一次服药时间
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
        // 复用已有药品：只新增一条用药配置，不重复建档
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
      // 数据已落库，此刻才请求通知权限；被拒也继续（回首页后有横幅引导）
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
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <ScrollView
          showsIndicators={false}
          style={{ backgroundColor: theme.canvas }}
        >
          <Column
            spacing={Spacing.four}
            style={{
              paddingHorizontal: Spacing.screen,
              paddingVertical: Spacing.three,
              paddingBottom: BottomTabInset + Spacing.four,
            }}
          >
            {step === 1 ? (
              <StepName
                name={name}
                onChangeName={(value) => {
                  name.value = value;
                  setNameText(value);
                }}
                onPickExisting={(medication) => {
                  name.value = medication.name;
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
                label={t("quickAdd.next")}
                disabled={!trimmedName}
                onPress={() => {
                  setStep(2);
                }}
                modifiers={nativeButtonModifiers({ fullWidth: true })}
              />
            ) : null}

            {step === 2 ? (
              <Column spacing={Spacing.three}>
                <Button
                  testID="quick-add-next-button"
                  label={t("quickAdd.next")}
                  onPress={() => {
                    setStep(3);
                  }}
                  modifiers={nativeButtonModifiers({ fullWidth: true })}
                />
                <Button
                  testID="quick-add-back-button"
                  label={t("quickAdd.back")}
                  variant="text"
                  onPress={() => {
                    setStep(1);
                  }}
                  modifiers={nativeButtonModifiers({ fullWidth: true })}
                />
              </Column>
            ) : null}

            {step === 3 ? (
              <Column spacing={Spacing.three}>
                <Button
                  testID="quick-add-save-button"
                  label={t("quickAdd.saveAndEnable")}
                  disabled={saving}
                  onPress={() => {
                    void save(false);
                  }}
                  modifiers={nativeButtonModifiers({ fullWidth: true })}
                />
                <Row alignment="center">
                  <Spacer flexible />
                  <Text
                    testID="quick-add-complete-button"
                    onPress={() => {
                      void save(true);
                    }}
                    textStyle={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: theme.primary,
                    }}
                  >
                    {t("quickAdd.completeLater")}
                  </Text>
                  <Spacer flexible />
                </Row>
                <Button
                  testID="quick-add-back-button"
                  label={t("quickAdd.back")}
                  variant="text"
                  onPress={() => {
                    setStep(2);
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
                    {t("quickAdd.notifyHint")}
                  </Text>
                  <Spacer flexible />
                </Row>
              </Column>
            ) : null}
          </Column>
        </ScrollView>
      </Host>
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
  name: ObservableState<string>;
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
              textStyle={{ fontSize: 17 }}
            />
          </InputShell>
        </Field>
      </FormSection>

      {/* 从已有药品选择：省得重复建档；点选即视为复用该药，只再配一次时间 */}
      {loading ? null : medications.length > 0 ? (
        <FormSection title={t("quickAdd.sectionExisting")}>
          <Column spacing={Spacing.two}>
            {medications.map((medication) => (
              <Text
                key={medication.id}
                testID={`quick-add-existing-${medication.id}`}
                onPress={() => {
                  onPickExisting(medication);
                }}
                textStyle={{ fontSize: 16, color: theme.text }}
              >
                {medication.name}
              </Text>
            ))}
          </Column>
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
        <Column>
          {times.map((time, index) => (
            <Row
              key={index}
              alignment="center"
              style={{ paddingVertical: Spacing.two }}
            >
              <Text textStyle={{ fontSize: 15 }}>
                {t("plan.ordinal", { index: index + 1 })}
              </Text>
              <Spacer flexible />
              <NativeDatePicker
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
            </Row>
          ))}
        </Column>
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
  const box = roundedBox({
    color: theme.border,
    background: theme.surface,
    radius: Radius.card,
    width: 1,
  });

  return (
    <>
      <Subtitle text={t("quickAdd.subtitle3")} />
      <Column
        spacing={Spacing.three}
        style={{ ...box.style, padding: Spacing.three }}
        modifiers={box.modifiers}
      >
        <Row alignment="center" spacing={Spacing.rowGap}>
          <MemberAvatar
            color={personColor}
            name={personName}
            uri={personPhoto}
            size={40}
          />
          <Column modifiers={[nativeLayout({ unconstrainedWidth: true })]}>
            <Text
              numberOfLines={1}
              textStyle={{ fontSize: 17, fontWeight: "700" }}
            >
              {name}
            </Text>
            <Text
              numberOfLines={1}
              textStyle={{ fontSize: 13, color: theme.textSecondary }}
            >
              {t("quickAdd.forSelf", { name: personName })}
            </Text>
          </Column>
        </Row>

        <Row alignment="center" spacing={Spacing.two}>
          <Text
            textStyle={{
              fontFamily: Fonts.sans,
              fontSize: 15,
              color: theme.textSecondary,
            }}
          >
            {t("quickAdd.freqCount", { count: freq })}
          </Text>
          <Spacer flexible />
          <Text
            textStyle={{
              fontFamily: Fonts.mono,
              fontSize: 15,
              fontWeight: "600",
              color: theme.text,
            }}
          >
            {times.join("  ")}
          </Text>
        </Row>

        <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>
          {t("quickAdd.doseHint", { amount: 1, unit })}
        </Text>

        {matched ? (
          <Text textStyle={{ fontSize: 12, color: theme.primary }}>
            {t("quickAdd.existingHint", { name })}
          </Text>
        ) : null}
      </Column>
    </>
  );
}
