import { Button, Column, Row, Spacer, Text } from "@expo/ui";

import { Avatar } from "@/components/avatar";
import { nativeLayout } from "@/components/native-layout";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation, getTranslator, type Translate } from "@/i18n";
import {
  medicationUnitLabel,
  reminderDueDate,
  skipReminder,
  snoozedReminder,
  takeReminder,
  type Medication,
  type Person,
  type Reminder,
} from "@/lib/store";

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "primary"
  | "neutral";

/** 提醒的展示状态：已服用 / 未服用 / 已漏服 / 待服用 / 稍后提醒 / 已跳过 */
export function reminderStatusMeta(
  reminder: Reminder,
  now: Date = new Date(),
  // t 默认取当前语言的全局翻译函数：这份元数据也被 React 之外的代码
  // （通知排程）复用，调用方拿不到 hook 时不该直接抛错
  t: Translate = getTranslator(),
): { label: string; tone: StatusTone } {
  switch (reminder.status) {
    case "taken":
      return { label: t("reminder.taken"), tone: "success" };
    case "skipped":
      return { label: t("reminder.skipped"), tone: "neutral" };
    case "missed":
      return { label: t("reminder.missed"), tone: "danger" };
    default:
      if (snoozedReminder(reminder, now)) {
        return { label: t("reminder.snooze"), tone: "primary" };
      }
      return reminderDueDate(reminder) > now
        ? { label: t("reminder.pending"), tone: "primary" }
        : { label: t("reminder.notTaken"), tone: "warning" };
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
    case "danger":
      return { color: theme.danger, soft: theme.dangerSoft };
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
  const t = useTranslation();
  const meta = reminderStatusMeta(reminder, new Date(), t);
  const canResolve =
    reminder.status === "pending" || reminder.status === "missed";

  const act = async (action: () => Promise<void>) => {
    await action();
    onChanged?.();
  };

  return (
    <Row
      testID={`dose-row-${reminder.id}`}
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
        modifiers={[nativeLayout({ unconstrainedWidth: true })]}
      >
        <Text textStyle={{ fontSize: 15, fontWeight: "600" }}>
          {medication?.name ?? t("home.unknownMedication")}
        </Text>
        <Text textStyle={{ fontSize: 12, color: theme.textSecondary }}>
          {`${reminder.doseAmount} ${
            medication
              ? medicationUnitLabel(medication.unit, t)
              : t("medication.unitTablet")
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
            testID={`dose-skip-${reminder.id}`}
            label={t("reminder.skip")}
            variant="outlined"
            onPress={() => act(() => skipReminder(reminder.id))}
          />
          {/* 文案在「已服用 / 补服」之间切换，靠 testID 稳定定位 */}
          <Button
            testID={`dose-take-${reminder.id}`}
            label={
              reminder.status === "missed"
                ? t("reminder.lateTake")
                : t("reminder.taken")
            }
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
  emptyText,
}: {
  reminders: Reminder[];
  medications: Medication[];
  persons: Person[];
  interactive?: boolean;
  onChanged?: () => void;
  emptyText?: string;
}) {
  const theme = useTheme();
  const t = useTranslation();
  if (reminders.length === 0) {
    return (
      <Text textStyle={{ color: theme.textSecondary, fontSize: 13 }}>
        {emptyText ?? t("common.empty")}
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
