import {
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from "react-native";

import { AvatarMark } from "@/components/avatar";
import { Spacing, Radius } from "@/constants/theme";
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
    <RNView
      style={{
        backgroundColor: soft,
        borderRadius: Radius.pill,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.one + 1,
      }}
    >
      <RNText style={{ fontSize: 12, color, fontWeight: "600" }}>
        {label}
      </RNText>
    </RNView>
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
    <RNView
      testID={`dose-row-${reminder.id}`}
      style={{
        backgroundColor: theme.backgroundElement,
        borderRadius: Radius.card,
        padding: Spacing.three,
      }}
    >
      <RNView
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.three,
        }}
      >
        {/* 时间 */}
        <RNView style={{ width: 52 }}>
          <RNText
            style={{ fontSize: 15, fontWeight: "700", color: theme.text }}
          >
            {reminder.time}
          </RNText>
        </RNView>

        {/* 药品 + 剂量 / 成员 */}
        <RNView style={{ flex: 1 }}>
          <RNText
            style={{ fontSize: 15, fontWeight: "600", color: theme.text }}
          >
            {medication?.name ?? t("home.unknownMedication")}
          </RNText>
          <RNText
            style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}
          >
            {`${reminder.doseAmount} ${
              medication
                ? medicationUnitLabel(medication.unit, t)
                : t("medication.unitTablet")
            }`}
          </RNText>
          {showPerson && person ? (
            <RNView
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: Spacing.one,
                marginTop: 2,
              }}
            >
              <AvatarMark
                color={person.avatarColor}
                name={person.name}
                uri={person.avatarUri}
                size={14}
              />
              <RNText style={{ fontSize: 11, color: theme.textSecondary }}>
                {person.name}
              </RNText>
            </RNView>
          ) : null}
        </RNView>

        {/* 操作区 */}
        {interactive && canResolve ? (
          <RNView
            style={{
              flexDirection: "row",
              gap: Spacing.two,
              alignItems: "center",
            }}
          >
            <RNPressable
              testID={`dose-skip-${reminder.id}`}
              onPress={() => act(() => skipReminder(reminder.id))}
              accessibilityRole="button"
              style={({ pressed }) => ({
                paddingHorizontal: Spacing.three,
                paddingVertical: Spacing.two,
                borderRadius: Radius.card,
                borderCurve: "continuous",
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
              })}
            >
              <RNText
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: theme.textSecondary,
                }}
              >
                {t("reminder.skip")}
              </RNText>
            </RNPressable>
            <RNPressable
              testID={`dose-take-${reminder.id}`}
              onPress={() => act(() => takeReminder(reminder.id))}
              accessibilityRole="button"
              style={({ pressed }) => ({
                paddingHorizontal: Spacing.three,
                paddingVertical: Spacing.two,
                borderRadius: Radius.card,
                borderCurve: "continuous",
                backgroundColor: pressed ? theme.primarySoft : theme.primary,
              })}
            >
              <RNText
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: theme.onPrimary,
                }}
              >
                {reminder.status === "missed"
                  ? t("reminder.lateTake")
                  : t("reminder.taken")}
              </RNText>
            </RNPressable>
          </RNView>
        ) : (
          <StatusChip label={meta.label} tone={meta.tone} />
        )}
      </RNView>
    </RNView>
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
      <RNText style={{ color: theme.textSecondary, fontSize: 13 }}>
        {emptyText ?? t("common.empty")}
      </RNText>
    );
  }
  const showPerson = persons.length > 1;
  return (
    <RNView style={{ gap: Spacing.two }}>
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
    </RNView>
  );
}
