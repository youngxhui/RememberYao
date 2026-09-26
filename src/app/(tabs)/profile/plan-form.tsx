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
import { requestNotificationPermission } from "@/lib/notifications";
import {
  addPlan,
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
    setTimes((prev) =>
      prev.map((t, i) => (i === index ? dateToTime(date) : t)),
    );
  };

  const save = async () => {
    if (!medicationId) {
      setError("请选择药品");
      return;
    }
    if (!personId) {
      setError("请选择用药人");
      return;
    }
    const doseAmount = Number.parseInt(dose.value, 10);
    if (!Number.isFinite(doseAmount) || doseAmount <= 0) {
      setError("每次剂量至少为 1");
      return;
    }
    if (times.length === 0) {
      setError("请至少设置一个服用时间");
      return;
    }
    if (new Set(times).size !== times.length) {
      setError("服用时间不能重复");
      return;
    }
    if (hasEndDate && endDate < startDate) {
      setError("结束日期不能早于开始日期");
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
        {isEditing ? "编辑用药配置" : "添加用药配置"}
      </Stack.Title>
      <Host seedColor="#40621a" style={{ flex: 1 }}>
        <Column
          modifiers={[nativeLayout({ fullWidth: true, fullHeight: true })]}
        >
          <FieldGroup>
            <FieldGroup.Section title="药品与用药人">
              <Picker
                selectedValue={medicationId}
                onValueChange={(value) => setMedicationId(value as string)}
              >
                <Picker.Item label="选择药品" value="" />
                {medications.map((m) => (
                  <Picker.Item key={m.id} label={m.name} value={m.id} />
                ))}
              </Picker>
              <Picker
                selectedValue={personId}
                onValueChange={(value) => setPersonId(value as string)}
              >
                <Picker.Item label="选择用药人" value="" />
                {persons.map((p) => (
                  <Picker.Item key={p.id} label={p.name} value={p.id} />
                ))}
              </Picker>
            </FieldGroup.Section>
            <FieldGroup.Section title="剂量">
              <TextInput
                placeholder={`每次剂量（${
                  medication ? medicationUnitLabel(medication.unit) : "片/粒"
                }）`}
                keyboardType="number-pad"
                value={dose}
              />
              <Picker
                selectedValue={timesPerDay}
                onValueChange={(value) => changeTimesPerDay(Number(value))}
              >
                {TIMES_PER_DAY.map((n) => (
                  <Picker.Item key={n} label={`每日 ${n} 次`} value={n} />
                ))}
              </Picker>
            </FieldGroup.Section>
            <FieldGroup.Section title="服用时间">
              {times.map((time, index) => (
                <Row key={index} alignment="center">
                  <Text>{`第 ${index + 1} 次`}</Text>
                  <Spacer flexible />
                  <DateTimePicker
                    value={timeToDate(time)}
                    mode="time"
                    display="compact"
                    is24Hour
                    testID={`dose-time-${index}`}
                    onValueChange={(_, date) => changeTime(index, date)}
                  />
                </Row>
              ))}
            </FieldGroup.Section>
            <FieldGroup.Section title="起止日期">
              <Row alignment="center">
                <Text>开始日期</Text>
                <Spacer flexible />
                <DateTimePicker
                  value={dateFromKey(startDate)}
                  mode="date"
                  display="compact"
                  testID="start-date"
                  onValueChange={(_, date) => setStartDate(dateKey(date))}
                />
              </Row>
              <Switch
                label="设置结束日期"
                value={hasEndDate}
                onValueChange={setHasEndDate}
              />
              {hasEndDate ? (
                <Row alignment="center">
                  <Text>结束日期</Text>
                  <Spacer flexible />
                  <DateTimePicker
                    value={dateFromKey(endDate)}
                    mode="date"
                    display="compact"
                    minimumDate={dateFromKey(startDate)}
                    testID="end-date"
                    onValueChange={(_, date) => setEndDate(dateKey(date))}
                  />
                </Row>
              ) : null}
            </FieldGroup.Section>
            <FieldGroup.Section title="状态">
              <Switch
                label="启用该配置"
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
                label="保存"
                onPress={() => {
                  save();
                }}
                modifiers={nativeButtonModifiers({ style: "glassProminent" })}
              >
                <Row modifiers={[nativeLayout({ fullWidth: true })]}>
                  <Spacer />
                  <Text>保存</Text>
                  <Spacer />
                </Row>
              </Button>
            </FieldGroup.Section>
            {isEditing ? (
              <FieldGroup.Section
                modifiers={nativeFieldModifiers({ flush: true })}
              >
                <Button
                  label={confirmDelete ? "再次点击确认删除" : "删除该配置"}
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

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
