import { Button, Column, Row, Spacer, Text } from "@expo/ui";
import { frame } from "@expo/ui/swift-ui/modifiers";

import { Avatar } from "@/components/avatar";
import { useTheme } from "@/hooks/use-theme";
import {
  medicationUnitLabel,
  reminderDueDate,
  skipReminder,
  takeReminder,
  type Medication,
  type Person,
  type Reminder,
} from "@/lib/store";

export type StatusTone = "success" | "warning" | "primary" | "neutral";

/** 提醒的展示状态：已服用 / 未服用 / 待服用 / 已跳过 */
export function reminderStatusMeta(
  reminder: Reminder,
  now: Date = new Date(),
): { label: string; tone: StatusTone } {
  switch (reminder.status) {
    case "taken":
      return { label: "已服用", tone: "success" };
    case "skipped":
      return { label: "已跳过", tone: "neutral" };
    case "missed":
      return { label: "未服用", tone: "warning" };
    default:
      return reminderDueDate(reminder) > now
        ? { label: "待服用", tone: "primary" }
        : { label: "未服用", tone: "warning" };
  }
}

export function toneColors(
  tone: StatusTone,
  theme: ReturnType<typeof useTheme>,
): { color: string; soft: string } {
  switch (tone) {
    case "success":
      return { color: theme.success, soft: theme.successSoft };
    case "warning":
      return { color: theme.warning, soft: theme.warningSoft };
    case "primary":
      return { color: theme.primary, soft: theme.primarySoft };
    default:
      return { color: theme.textSecondary, soft: theme.backgroundSelected };
  }
}

/** 状态徽标：已服用 / 未服用 / 待服用 / 已跳过 */
export function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  const theme = useTheme();
  const { color, soft } = toneColors(tone, theme);
  return (
    <Row
      style={{
        backgroundColor: soft,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text textStyle={{ fontSize: 12, color, fontWeight: "600" }}>
        {label}
      </Text>
    </Row>
  );
}

function DoseRow({
  reminder,
  medication,
  person,
  showPerson,
  interactive,
  onChanged,
}: {
  reminder: Reminder;
  medication?: Medication;
  person?: Person;
  showPerson: boolean;
  interactive: boolean;
  onChanged?: () => void;
}) {
  const theme = useTheme();
  const meta = reminderStatusMeta(reminder);
  const canResolve =
    reminder.status === "pending" || reminder.status === "missed";

  const act = async (action: () => Promise<void>) => {
    await action();
    onChanged?.();
  };

  return (
    <Row
      alignment="center"
      spacing={10}
      style={{
        backgroundColor: theme.backgroundElement,
        borderRadius: 14,
        padding: 12,
      }}
    >
      <Text
        style={{ width: 52 }}
        textStyle={{ fontSize: 15, fontWeight: "700" }}
      >
        {reminder.time}
      </Text>
      <Column
        spacing={2}
        modifiers={[frame({ minWidth: 0, maxWidth: Infinity })]}
      >
        <Text textStyle={{ fontSize: 15, fontWeight: "600" }}>
          {medication?.name ?? "未知药品"}
        </Text>
        <Text textStyle={{ fontSize: 12, color: theme.textSecondary }}>
          {`${reminder.doseAmount}${
            medication ? medicationUnitLabel(medication.unit) : "片"
          }`}
        </Text>
        {showPerson && person ? (
          <Row alignment="center" spacing={4}>
            <Avatar color={person.avatarColor} name={person.name} size={14} />
            <Text textStyle={{ fontSize: 11, color: theme.textSecondary }}>
              {person.name}
            </Text>
          </Row>
        ) : null}
      </Column>
      <Spacer />
      {interactive && canResolve ? (
        <Row spacing={6}>
          <Button
            label="跳过"
            variant="outlined"
            onPress={() => act(() => skipReminder(reminder.id))}
          />
          <Button
            label={reminder.status === "missed" ? "补服" : "已服用"}
            onPress={() => act(() => takeReminder(reminder.id))}
          />
        </Row>
      ) : (
        <StatusChip label={meta.label} tone={meta.tone} />
      )}
    </Row>
  );
}

/** 服药时间线：按时间排序的提醒列表 */
export function DoseTimeline({
  reminders,
  medications,
  persons,
  interactive = false,
  onChanged,
  emptyText = "没有记录",
}: {
  reminders: Reminder[];
  medications: Medication[];
  persons: Person[];
  interactive?: boolean;
  onChanged?: () => void;
  emptyText?: string;
}) {
  const theme = useTheme();
  if (reminders.length === 0) {
    return (
      <Text textStyle={{ color: theme.textSecondary, fontSize: 13 }}>
        {emptyText}
      </Text>
    );
  }
  const showPerson = persons.length > 1;
  return (
    <Column spacing={8}>
      {reminders.map((reminder) => (
        <DoseRow
          key={reminder.id}
          reminder={reminder}
          medication={medications.find((m) => m.id === reminder.medicationId)}
          person={persons.find((p) => p.id === reminder.personId)}
          showPerson={showPerson}
          interactive={interactive}
          onChanged={onChanged}
        />
      ))}
    </Column>
  );
}
