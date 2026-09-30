import {
  Button,
  Column,
  FieldGroup,
  Host,
  Picker,
  Row,
  Spacer,
  Switch,
  Text,
  TextInput,
  useNativeState,
} from "@expo/ui";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import {
  nativeButtonModifiers,
  nativeFieldModifiers,
  nativeLayout,
} from "@/components/native-layout";
import { useTranslation } from "@/i18n";
import { requestNotificationPermission } from "@/lib/notifications";
import {
  addPlan,
  dateFromKey,
  dateKey,
  dateToTime,
  defaultTimes,
  deletePlan,
  medicationUnitLabel,
  timeToDate,
  todayKey,
  updatePlan,
  useAppData,
} from "@/lib/store";

const TIMES_PER_DAY = [1, 2, 3, 4, 5, 6];

export default function PlanFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    personId?: string;
    medicationId?: string;
  }>();
  const t = useTranslation();
  const isEditing = Boolean(params.id);
  const { medications, persons, plans, loading } = useAppData();

  const [loaded, setLoaded] = useState(!isEditing);
  const [medicationId, setMedicationId] = useState(params.medicationId ?? "");
  const [personId, setPersonId] = useState(params.personId ?? "");
  const [timesPerDay, setTimesPerDay] = useState(1);
  const [times, setTimes] = useState<string[]>(defaultTimes(1));
  const [startDate, setStartDate] = useState(todayKey());
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(todayKey());
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dose = useNativeState("1");

  // 编辑模式下只填充一次：等数据加载完再填，避免把用户已输入的内容覆盖掉
  const filledRef = useRef(false);
  useEffect(() => {
    if (!params.id) return;
    if (filledRef.current || loading) return;
    filledRef.current = true;
    const existing = plans.find((p) => p.id === params.id);
    if (existing) {
      setMedicationId(existing.medicationId);
      setPersonId(existing.personId);
      dose.value = String(existing.doseAmount);
      setTimesPerDay(existing.times.length);
      setTimes(existing.times);
      setStartDate(existing.startDate);
      setHasEndDate(Boolean(existing.endDate));
      if (existing.endDate) setEndDate(existing.endDate);
      setEnabled(existing.enabled);
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, plans, loading]);

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
    // 形参避开 t：外层已有 t()（翻译函数），同名会把两个概念混在一起
    setTimes((prev) =>
      prev.map((time, i) => (i === index ? dateToTime(date) : time)),
    );
  };

  const save = async () => {
    if (!medicationId) {
      setError(t("plan.errorMedication"));
      return;
    }
    if (!personId) {
      setError(t("plan.errorPerson"));
      return;
    }
    const doseAmount = Number.parseInt(dose.value, 10);
    if (!Number.isFinite(doseAmount) || doseAmount <= 0) {
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
    // 新建配置时申请通知权限，保证到点能收到提醒（被拒绝也不影响保存）
    if (!params.id) {
      await requestNotificationPermission();
    }
    const input = {
      medicationId,
      personId,
      doseAmount,
      times,
      startDate,
      endDate: hasEndDate ? endDate : null,
      enabled,
    };
    if (params.id) {
      await updatePlan(params.id, input);
    } else {
      await addPlan(input);
    }
    router.back();
  };

  if (!loaded) return null;

  const remove = async () => {
    if (!params.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deletePlan(params.id);
    router.back();
  };

  const medication = medications.find((m) => m.id === medicationId);

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>
        {isEditing ? t("plan.editTitle") : t("plan.formTitle")}
      </Stack.Title>
      <Host seedColor="#40621a" style={{ flex: 1 }}>
        <Column
          modifiers={[nativeLayout({ fullWidth: true, fullHeight: true })]}
        >
          <FieldGroup>
            <FieldGroup.Section title={t("plan.sectionMedicationPerson")}>
              <Picker
                testID="plan-medication-picker"
                selectedValue={medicationId}
                onValueChange={(value) => setMedicationId(value as string)}
              >
                <Picker.Item label={t("plan.medication")} value="" />
                {medications.map((m) => (
                  <Picker.Item key={m.id} label={m.name} value={m.id} />
                ))}
              </Picker>
              <Picker
                testID="plan-person-picker"
                selectedValue={personId}
                onValueChange={(value) => setPersonId(value as string)}
              >
                <Picker.Item label={t("plan.person")} value="" />
                {persons.map((p) => (
                  <Picker.Item key={p.id} label={p.name} value={p.id} />
                ))}
              </Picker>
            </FieldGroup.Section>
            <FieldGroup.Section title={t("plan.sectionDose")}>
              <TextInput
                testID="plan-dose-input"
                placeholder={t("plan.dosePlaceholder", {
                  unit: medication
                    ? medicationUnitLabel(medication.unit, t)
                    : t("plan.unitFallback"),
                })}
                keyboardType="number-pad"
                value={dose}
              />
              <Picker
                testID="plan-times-picker"
                selectedValue={timesPerDay}
                onValueChange={(value) => changeTimesPerDay(Number(value))}
              >
                {TIMES_PER_DAY.map((n) => (
                  <Picker.Item
                    key={n}
                    label={t("plan.perDay", { count: n })}
                    value={n}
                  />
                ))}
              </Picker>
            </FieldGroup.Section>
            <FieldGroup.Section title={t("plan.sectionTimes")}>
              {times.map((time, index) => (
                <Row key={index} alignment="center">
                  <Text>{t("plan.ordinal", { index: index + 1 })}</Text>
                  <Spacer flexible />
                  <DateTimePicker
                    value={timeToDate(time)}
                    mode="time"
                    display="compact"
                    is24Hour
                    testID={`plan-dose-time-${index}`}
                    onValueChange={(_, date) => changeTime(index, date)}
                  />
                </Row>
              ))}
            </FieldGroup.Section>
            <FieldGroup.Section title={t("plan.sectionDateRange")}>
              <Row alignment="center">
                <Text>{t("plan.startDate")}</Text>
                <Spacer flexible />
                <DateTimePicker
                  value={dateFromKey(startDate)}
                  mode="date"
                  display="compact"
                  testID="plan-start-date"
                  onValueChange={(_, date) => setStartDate(dateKey(date))}
                />
              </Row>
              <Switch
                testID="plan-has-end-date-switch"
                label={t("plan.hasEndDate")}
                value={hasEndDate}
                onValueChange={setHasEndDate}
              />
              {hasEndDate ? (
                <Row alignment="center">
                  <Text>{t("plan.endDate")}</Text>
                  <Spacer flexible />
                  <DateTimePicker
                    value={dateFromKey(endDate)}
                    mode="date"
                    display="compact"
                    minimumDate={dateFromKey(startDate)}
                    testID="plan-end-date"
                    onValueChange={(_, date) => setEndDate(dateKey(date))}
                  />
                </Row>
              ) : null}
            </FieldGroup.Section>
            <FieldGroup.Section title={t("plan.sectionStatus")}>
              <Switch
                testID="plan-enabled-switch"
                label={t("plan.enablePlan")}
                value={enabled}
                onValueChange={setEnabled}
              />
            </FieldGroup.Section>
            {error ? (
              <FieldGroup.Section>
                <Text
                  style={{ paddingHorizontal: 16 }}
                  textStyle={{ color: "#ff3b30" }}
                >
                  {error}
                </Text>
              </FieldGroup.Section>
            ) : null}
            <FieldGroup.Section
              modifiers={nativeFieldModifiers({ flush: true })}
            >
              <Button
                testID="plan-save-button"
                label={t("common.save")}
                onPress={() => {
                  save();
                }}
                modifiers={nativeButtonModifiers({ style: "glassProminent" })}
              >
                <Row modifiers={[nativeLayout({ fullWidth: true })]}>
                  <Spacer />
                  <Text>{t("common.save")}</Text>
                  <Spacer />
                </Row>
              </Button>
            </FieldGroup.Section>
            {isEditing ? (
              <FieldGroup.Section
                modifiers={nativeFieldModifiers({ flush: true })}
              >
                {/* 文案在「删除该配置 / 再次点击确认删除」之间切换，靠 testID 稳定定位 */}
                <Button
                  testID="plan-delete-button"
                  label={
                    confirmDelete
                      ? t("common.confirmDelete")
                      : t("plan.deleteButtonAlt")
                  }
                  onPress={() => {
                    remove();
                  }}
                  modifiers={nativeButtonModifiers({
                    style: "borderedProminent",
                  })}
                />
              </FieldGroup.Section>
            ) : null}
          </FieldGroup>
        </Column>
      </Host>
    </>
  );
}
