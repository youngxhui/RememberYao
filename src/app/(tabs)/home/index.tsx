import {
  Button,
  Column,
  Host,
  Icon,
  Row,
  ScrollView,
  Spacer,
  Text,
} from "@expo/ui";
import { frame } from "@expo/ui/swift-ui/modifiers";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { Avatar } from "@/components/avatar";
import { useTheme } from "@/hooks/use-theme";
import {
  medicationUnitLabel,
  skipReminder,
  takeReminder,
  todayKey,
  useAppData,
  type Person,
  type Reminder,
  type ReminderStatus,
} from "@/lib/store";

const STATUS_META: Record<
  ReminderStatus,
  { label: string; colorKey: "success" | "textSecondary" | "danger" | "warning" }
> = {
  pending: { label: "待服用", colorKey: "warning" },
  taken: { label: "已服用", colorKey: "success" },
  skipped: { label: "已跳过", colorKey: "textSecondary" },
  missed: { label: "漏服", colorKey: "danger" },
};

export default function TodayScreen() {
  const theme = useTheme();
  const { reminders, medications, persons, loading, reload } = useAppData();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const today = todayKey();
  const todays = reminders
    .filter((r) => r.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));

  const medicationOf = (r: Reminder) =>
    medications.find((m) => m.id === r.medicationId);
  const personOf = (r: Reminder): Person | undefined =>
    persons.find((p) => p.id === r.personId);

  return (
    <>
      <Stack.Title large>今日</Stack.Title>
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <ScrollView
          style={{ padding: 16, paddingBottom: 32 }}
          showsIndicators={false}
        >
          <Text textStyle={{ color: theme.textSecondary }}>
            {formatTodayLabel(today)}
          </Text>
          {todays.length === 0 && !loading ? (
            <Column
              alignment="center"
              spacing={8}
              style={{ paddingTop: 120 }}
            >
              <Icon
                name="checkmark.circle.fill"
                size={40}
                color={theme.textSecondary}
              />
              <Text textStyle={{ color: theme.textSecondary }}>
                今天没有用药提醒
              </Text>
            </Column>
          ) : (
            <Column spacing={10} style={{ paddingTop: 12 }}>
              {todays.map((reminder) => (
                <ReminderCard
                  key={reminder.id}
                  reminder={reminder}
                  person={personOf(reminder)}
                  medicationName={medicationOf(reminder)?.name ?? "未知药品"}
                  unit={medicationOf(reminder)?.unit ?? "tablet"}
                  onChanged={reload}
                />
              ))}
            </Column>
          )}
        </ScrollView>
      </Host>
    </>
  );
}

function formatTodayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const week = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${y} 年 ${m} 月 ${d} 日 · 周${week}`;
}

function ReminderCard({
  reminder,
  person,
  medicationName,
  unit,
  onChanged,
}: {
  reminder: Reminder;
  person?: Person;
  medicationName: string;
  unit: "tablet" | "pill";
  onChanged: () => void;
}) {
  const theme = useTheme();
  const meta = STATUS_META[reminder.status];

  const act = async (action: () => Promise<void>) => {
    await action();
    onChanged();
  };

  return (
    <Column
      spacing={10}
      style={{
        backgroundColor: theme.backgroundElement,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <Row alignment="center" spacing={10}>
        <Text
          style={{ width: 56 }}
          textStyle={{ fontSize: 22, fontWeight: "700" }}
        >
          {reminder.time}
        </Text>
        <Column
          spacing={3}
          modifiers={[frame({ minWidth: 0, maxWidth: Infinity })]}
        >
          <Row alignment="center" spacing={6}>
            <Text textStyle={{ fontSize: 16, fontWeight: "600" }}>
              {medicationName}
            </Text>
            <Text
              textStyle={{ fontSize: 13, color: theme.textSecondary }}
            >
              {`${reminder.doseAmount}${medicationUnitLabel(unit)}`}
            </Text>
          </Row>
          {person ? (
            <Row alignment="center" spacing={6}>
              <Avatar color={person.avatarColor} name={person.name} size={18} />
              <Text
                textStyle={{ fontSize: 13, color: theme.textSecondary }}
              >
                {person.name}
              </Text>
            </Row>
          ) : null}
        </Column>
        <Spacer />
      </Row>
      <Row alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
        <Text
          textStyle={{
            fontSize: 13,
            color: theme[meta.colorKey],
            fontWeight: "600",
          }}
        >
          {meta.label}
        </Text>
        <Spacer />
        {reminder.status === "pending" ? (
          <Row spacing={8}>
            <Button
              label="跳过"
              variant="outlined"
              onPress={() => act(() => skipReminder(reminder.id))}
            />
            <Button
              label="已服用"
              onPress={() => act(() => takeReminder(reminder.id))}
            />
          </Row>
        ) : null}
      </Row>
    </Column>
  );
}
