import { RNHostView } from "@expo/ui";
import { useCallback, useState } from "react";
import { Pressable, Text as RNText, View as RNView } from "react-native";

import {
  reminderStatusMeta,
  toneColors,
  type StatusTone,
} from "@/components/dose-timeline";
import { SymbolIcon } from "@/components/symbol-icon";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  DEFAULT_SETTINGS,
  medicationUnitLabel,
  skipReminder,
  snoozedReminder,
  snoozeReminder,
  takeReminder,
  type Medication,
  type Person,
  type Reminder,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

/**
 * 服药时间线（导轨式）：按时间排的当日提醒，左侧是时间 + 状态导轨，右侧是剂量卡。
 * 视觉与交互基准 = design/today.html 的「服药时间线」区块。
 *
 * 为什么是纯 RN 而不是 @expo/ui：导轨的连接线要跟着行高伸缩（flex），
 * 而 universal `style` 不支持 flex，用 `frame` modifier 硬凑两端行为不一致。
 */

/** 空档阈值（分钟）：相邻两剂之间空闲超过 4 小时才值得单列一行说明 */
const GAP_MINUTES = 4 * 60;

/** 三列导轨宽度，与设计稿 grid-template-columns: 46px 24px 1fr 一致 */
const TIME_COL = 46;
const RAIL_COL = 24;
const COL_GAP = Spacing.two;
const NODE = 22;
/** 节点外圈用页面底色盖住连接线，等价设计稿 box-shadow: 0 0 0 3px var(--bg) */
const HALO = NODE + 6;

/** 时间线的一行：剂量 / 空档说明 / 当前时刻标记 */
export type RailEntry =
  | { kind: "dose"; reminder: Reminder }
  | {
      kind: "gap";
      /** 用空档两端的时间做稳定 id（不用下标，排序后会漂） */
      id: string;
      from: string;
      to: string;
      hours: number;
      /** 空档之后的第一剂，展开后告诉用户「下一剂是什么」 */
      next: { time: string; name: string; personName: string };
    }
  | { kind: "now"; time: string };

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

/**
 * 组装渲染序列（纯函数）：相邻两剂之间超过阈值的空闲段落折叠成一行，
 * 「现在」插在第一剂未到点的位置（全天都过完则落在末尾）。
 */
export function buildRail(
  reminders: Reminder[],
  now: Date,
  resolve: (reminder: Reminder) => { name: string; personName: string },
): RailEntry[] {
  const nowTime = hhmm(now);
  const entries: RailEntry[] = [];
  let nowInserted = false;

  reminders.forEach((reminder, index) => {
    const previous = reminders[index - 1];
    if (previous) {
      const gap =
        Number(reminder.time.slice(0, 2)) * 60 +
        Number(reminder.time.slice(3, 5)) -
        (Number(previous.time.slice(0, 2)) * 60 +
          Number(previous.time.slice(3, 5)));
      if (gap >= GAP_MINUTES) {
        entries.push({
          kind: "gap",
          id: `${previous.time.replace(":", "")}-${reminder.time.replace(":", "")}`,
          from: previous.time,
          to: reminder.time,
          hours: Math.round(gap / 60),
          next: { time: reminder.time, ...resolve(reminder) },
        });
      }
    }
    if (!nowInserted && reminder.time.localeCompare(nowTime) > 0) {
      entries.push({ kind: "now", time: nowTime });
      nowInserted = true;
    }
    entries.push({ kind: "dose", reminder });
  });

  if (!nowInserted) entries.push({ kind: "now", time: nowTime });
  return entries;
}

/** 剂量在时间线上的配色：卡片底 / 描边 / 导轨节点实心色 / 时间文字 */
function railPalette(tone: StatusTone, theme: ReturnType<typeof useTheme>) {
  switch (tone) {
    case "success":
      return {
        card: theme.successSoft,
        border: withAlpha(theme.success, 0.26),
        node: theme.successStrong,
        iconBg: withAlpha(theme.success, 0.14),
        iconColor: theme.successStrong,
        time: theme.textSecondary,
      };
    case "warning":
      return {
        card: theme.warningSoft,
        border: withAlpha(theme.warning, 0.28),
        node: theme.warningStrong,
        iconBg: withAlpha(theme.warning, 0.12),
        iconColor: theme.warningStrong,
        time: theme.warningStrong,
      };
    case "danger":
      return {
        card: theme.dangerSoft,
        border: withAlpha(theme.danger, 0.3),
        node: theme.dangerStrong,
        iconBg: withAlpha(theme.danger, 0.12),
        iconColor: theme.dangerStrong,
        time: theme.dangerStrong,
      };
    case "primary":
      return {
        card: theme.surface,
        border: theme.border,
        node: theme.border,
        iconBg: withAlpha(theme.text, 0.06),
        iconColor: theme.text,
        time: theme.textSecondary,
      };
    default:
      return {
        card: withAlpha(theme.text, 0.05),
        border: theme.border,
        node: theme.textSecondary,
        iconBg: withAlpha(theme.text, 0.06),
        iconColor: theme.textSecondary,
        time: theme.textSecondary,
      };
  }
}

type SymbolName = Parameters<typeof SymbolIcon>[0]["name"];

/** 导轨节点图标：待服用是空心点，其余状态用实心圆 + 符号 */
function nodeIcon(tone: StatusTone): SymbolName | null {
  switch (tone) {
    case "success":
      return "checkmark.circle";
    case "warning":
    case "danger":
      return "alarm";
    case "neutral":
      return "xmark.circle";
    default:
      return null;
  }
}

/**
 * 导轨组件的 props。
 *
 * `containerWidth` 是给 Expo UI 树用的：导轨是纯 RN 子树，塞进 `Host` 后由
 * `RNHostView matchContents` 承载，而 matchContents 下 RN 自身测不到父级宽度，
 * 导轨里那条 `flex: 1` 的连接线会塌掉。调用方（首页）实测内容区宽度后传进来。
 */
export type DoseRailProps = {
  /** 当天提醒，需已按 time 升序 */
  reminders: Reminder[];
  medications: Medication[];
  persons: Person[];
  /** 家庭里有多人才显示用药人，避免每行都重复同一个名字 */
  showPerson: boolean;
  now: Date;
  /** 设置页配置的「稍后提醒」间隔，用于按钮文案（不传则用默认值） */
  snoozeMinutes?: number;
  onChanged?: () => void;
  /** 岛内可用宽度（不含屏幕左右边距）。纯 RN 屏不传 */
  containerWidth?: number;
};

export function DoseRail({
  reminders,
  medications,
  persons,
  showPerson,
  now,
  snoozeMinutes,
  onChanged,
  containerWidth,
}: DoseRailProps) {
  const theme = useTheme();
  const t = useTranslation();
  const [openGap, setOpenGap] = useState<string | null>(null);

  const resolve = useCallback(
    (reminder: Reminder) => ({
      name:
        medications.find((m) => m.id === reminder.medicationId)?.name ??
        t("home.unknownMedication"),
      personName:
        persons.find((p) => p.id === reminder.personId)?.name ??
        t("home.unknownPerson"),
    }),
    [medications, persons, t],
  );

  const entries = buildRail(reminders, now, resolve);
  const toggleGap = useCallback((id: string) => {
    setOpenGap((prev) => (prev === id ? null : id));
  }, []);

  if (reminders.length === 0) {
    return (
      <RNView
        style={{
          width: containerWidth,
          backgroundColor: withAlpha(theme.text, 0.05),
          borderRadius: Radius.card,
          padding: Spacing.three,
        }}
      >
        <RNText style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
          {t("home.noSchedule")}
        </RNText>
        <RNText
          style={{ color: theme.textSecondary, fontSize: 13, marginTop: 4 }}
        >
          {t("home.noScheduleHint")}
        </RNText>
      </RNView>
    );
  }

  return (
    // 宽度显式给出去：行尾是 `flex: 1`，父容器没有确定宽度时连接线会整条塌掉
    <RNView style={{ width: containerWidth }}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;
        if (entry.kind === "now") {
          return (
            <NowMarker
              key={`now-${entry.time}`}
              time={entry.time}
              last={isLast}
            />
          );
        }
        if (entry.kind === "gap") {
          return (
            <GapRow
              key={`gap-${entry.id}`}
              entry={entry}
              last={isLast}
              open={openGap === entry.id}
              onToggle={toggleGap}
            />
          );
        }
        return (
          <DoseRow
            key={entry.reminder.id}
            reminder={entry.reminder}
            medication={medications.find(
              (m) => m.id === entry.reminder.medicationId,
            )}
            person={persons.find((p) => p.id === entry.reminder.personId)}
            showPerson={showPerson}
            now={now}
            snoozeMinutes={snoozeMinutes}
            last={isLast}
            onChanged={onChanged}
          />
        );
      })}
    </RNView>
  );
}

/** 剂量行：时间列 + 导轨 + 剂量卡（+ 未处理时的操作行） */
function DoseRow({
  reminder,
  medication,
  person,
  showPerson,
  now,
  snoozeMinutes,
  last,
  onChanged,
}: {
  reminder: Reminder;
  medication?: Medication;
  person?: Person;
  showPerson: boolean;
  now: Date;
  snoozeMinutes?: number;
  last: boolean;
  onChanged?: () => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const meta = reminderStatusMeta(reminder, now, t);
  const palette = railPalette(meta.tone, theme);
  const badge = toneColors(meta.tone, theme);
  const nodeName = nodeIcon(meta.tone);
  const resolvable =
    reminder.status === "pending" || reminder.status === "missed";
  const snoozed = snoozedReminder(reminder, now);
  const unit = medication
    ? medicationUnitLabel(medication.unit, t)
    : t("medication.unitTablet");

  const metaParts = [
    medication?.notes.trim() ?? "",
    `${reminder.doseAmount}${unit}`,
    showPerson && person ? person.name : "",
  ].filter((part) => part.length > 0);

  const act = (action: () => Promise<void>) => {
    void (async () => {
      await action();
      onChanged?.();
    })();
  };

  return (
    <RNView style={{ flexDirection: "row" }}>
      <RNText
        style={{
          width: TIME_COL,
          marginRight: COL_GAP,
          paddingTop: 15,
          textAlign: "right",
          color: palette.time,
          fontFamily: Fonts.mono,
          fontVariant: ["tabular-nums"],
          fontSize: 12,
          fontWeight: resolvable ? "600" : "400",
        }}
      >
        {reminder.time}
      </RNText>

      <RNView
        style={{
          width: RAIL_COL,
          marginRight: COL_GAP,
          paddingTop: 13,
          alignItems: "center",
        }}
      >
        <RNView
          style={{
            width: HALO,
            height: HALO,
            borderRadius: HALO / 2,
            backgroundColor: theme.canvas,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <RNView
            style={{
              width: NODE,
              height: NODE,
              borderRadius: NODE / 2,
              borderWidth: 2,
              borderColor: palette.node,
              backgroundColor:
                meta.tone === "primary" ? theme.surface : palette.node,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {nodeName ? (
              <SymbolIcon
                name={nodeName}
                size={12}
                weight="bold"
                color={
                  meta.tone === "primary" ? theme.textSecondary : "#FFFFFF"
                }
              />
            ) : (
              <RNView
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: theme.textSecondary,
                }}
              />
            )}
          </RNView>
        </RNView>
        {!last ? (
          <RNView
            style={{
              width: 2,
              flex: 1,
              backgroundColor: theme.border,
            }}
          />
        ) : null}
      </RNView>

      <RNView style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
        <RNView
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: Radius.card,
            borderCurve: "continuous",
            padding: 12,
          }}
        >
          <RNView
            style={{
              width: 34,
              height: 34,
              borderRadius: Radius.tile,
              backgroundColor: palette.iconBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SymbolIcon name="pills.fill" size={17} color={palette.iconColor} />
          </RNView>

          <RNView style={{ flex: 1, minWidth: 0 }}>
            <RNView
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: Spacing.two,
              }}
            >
              <RNText
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  color: theme.text,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {medication?.name ?? t("home.unknownMedication")}
              </RNText>
              <RNView
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  borderRadius: Radius.pill,
                  backgroundColor: badge.soft,
                  paddingHorizontal: Spacing.two,
                  paddingVertical: 3,
                }}
              >
                <RNView
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: badge.color,
                  }}
                />
                <RNText
                  style={{
                    color: badge.color,
                    fontSize: 11,
                    lineHeight: 14,
                    fontWeight: "600",
                  }}
                >
                  {meta.label}
                </RNText>
              </RNView>
            </RNView>
            <RNText
              numberOfLines={1}
              style={{
                marginTop: Spacing.one,
                color: theme.textSecondary,
                fontFamily: Fonts.mono,
                fontVariant: ["tabular-nums"],
                fontSize: 11,
              }}
            >
              {metaParts.join(" · ")}
            </RNText>
          </RNView>

          <CheckButton
            reminder={reminder}
            resolvable={resolvable}
            now={now}
            onTake={() => act(() => takeReminder(reminder.id))}
          />
        </RNView>

        {resolvable ? (
          <RNView
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: Spacing.two,
              marginTop: Spacing.two,
            }}
          >
            {/* 「稍后提醒」只对已到点的剂量有意义：还没到点的剂量本来就已排好通知 */}
            {reminder.time.localeCompare(hhmm(now)) <= 0 ? (
              <ActionButton
                testID={`dose-snooze-${reminder.id}`}
                label={
                  snoozed
                    ? t("home.snoozeSet")
                    : t("home.snoozeIn", {
                        minutes:
                          snoozeMinutes ?? DEFAULT_SETTINGS.snoozeMinutes,
                      })
                }
                disabled={snoozed}
                onPress={() => act(() => snoozeReminder(reminder.id))}
              />
            ) : null}
            <ActionButton
              testID={`dose-skip-${reminder.id}`}
              label={t("reminder.skip")}
              danger
              onPress={() => act(() => skipReminder(reminder.id))}
            />
          </RNView>
        ) : null}
      </RNView>
    </RNView>
  );
}

/** 行尾圆形勾选按钮：未处理时可点，命中后变成状态实心圆 */
function CheckButton({
  reminder,
  resolvable,
  now,
  onTake,
}: {
  reminder: Reminder;
  resolvable: boolean;
  now: Date;
  onTake: () => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const meta = reminderStatusMeta(reminder, now, t);
  const fill =
    meta.tone === "success"
      ? theme.successStrong
      : meta.tone === "neutral"
        ? theme.textSecondary
        : null;
  const icon =
    meta.tone === "success"
      ? "checkmark"
      : meta.tone === "neutral"
        ? "xmark"
        : "checkmark";

  return (
    <Pressable
      testID={`dose-take-${reminder.id}`}
      accessibilityRole="button"
      accessibilityLabel={
        resolvable
          ? // 漏服后补记，按钮语义是「补服」而不是「标记已服用」
            reminder.status === "missed"
            ? t("reminder.lateTake")
            : t("reminder.markTaken")
          : meta.label
      }
      disabled={!resolvable}
      onPress={onTake}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: Radius.pill,
        borderWidth: resolvable ? 1.5 : 0,
        borderColor: theme.border,
        backgroundColor: fill ?? theme.surface,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed && resolvable ? 0.7 : 1,
      })}
    >
      <SymbolIcon name={icon} size={15} color={fill ? "#FFFFFF" : theme.text} />
    </Pressable>
  );
}

/** 操作行里的胶囊按钮 */
function ActionButton({
  testID,
  label,
  onPress,
  disabled,
  danger,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: Spacing.three,
        borderRadius: Radius.pill,
        borderWidth: 1,
        borderColor: danger ? withAlpha(theme.dangerStrong, 0.3) : theme.border,
        backgroundColor:
          pressed && !disabled ? withAlpha(theme.text, 0.05) : theme.surface,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.6 : 1,
      })}
    >
      <RNText
        style={{
          color: danger ? theme.dangerStrong : theme.text,
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

/** 空档折叠行：两剂之间空闲很久时，把这段时间收成一行，展开说明下一剂 */
function GapRow({
  entry,
  last,
  open,
  onToggle,
}: {
  entry: Extract<RailEntry, { kind: "gap" }>;
  last: boolean;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const size = 20;
  const halo = size + 6;

  return (
    <RNView style={{ flexDirection: "row" }}>
      <RNText
        style={{
          width: TIME_COL,
          marginRight: COL_GAP,
          paddingTop: 4,
          textAlign: "right",
          color: theme.textSecondary,
          fontFamily: Fonts.mono,
          fontVariant: ["tabular-nums"],
          fontSize: 10,
          lineHeight: 15,
        }}
      >
        {`${entry.from}\n–\n${entry.to}`}
      </RNText>

      <RNView
        style={{
          width: RAIL_COL,
          marginRight: COL_GAP,
          alignItems: "center",
        }}
      >
        <RNView
          style={{
            width: halo,
            height: halo,
            borderRadius: halo / 2,
            backgroundColor: theme.canvas,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Pressable
            testID={`home-gap-${entry.id}`}
            accessibilityRole="button"
            accessibilityLabel={
              open ? t("home.collapseGap") : t("home.expandGap")
            }
            accessibilityState={{ expanded: open }}
            onPress={() => onToggle(entry.id)}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 2,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <RNView
              style={{
                transform: [{ rotate: open ? "180deg" : "0deg" }],
              }}
            >
              <SymbolIcon
                name="chevron.down"
                size={10}
                weight="bold"
                color={theme.textSecondary}
              />
            </RNView>
          </Pressable>
        </RNView>
        {!last ? (
          <RNView
            style={{ width: 2, flex: 1, backgroundColor: theme.border }}
          />
        ) : null}
      </RNView>

      <RNView style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
        <RNView
          style={{
            borderRadius: Radius.tile,
            backgroundColor: withAlpha(theme.text, 0.05),
            overflow: "hidden",
          }}
        >
          <Pressable
            testID={`home-gap-row-${entry.id}`}
            accessibilityRole="button"
            accessibilityLabel={
              open ? t("home.collapseGap") : t("home.expandGap")
            }
            accessibilityState={{ expanded: open }}
            onPress={() => onToggle(entry.id)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              minHeight: 40,
              paddingHorizontal: 12,
              paddingVertical: 9,
              backgroundColor: pressed
                ? withAlpha(theme.text, 0.04)
                : "transparent",
            })}
          >
            <RNText
              numberOfLines={1}
              style={{ flex: 1, color: theme.textSecondary, fontSize: 12 }}
            >
              {open
                ? t("home.gapRange", { from: entry.from, to: entry.to })
                : t("home.gapCollapsed", { hours: entry.hours })}
            </RNText>
            <RNText
              style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}
            >
              {open ? t("home.collapse") : t("home.expand")}
            </RNText>
          </Pressable>
          {open ? (
            <RNView
              style={{
                paddingHorizontal: 12,
                paddingBottom: 10,
                gap: 2,
              }}
            >
              <RNText style={{ color: theme.textSecondary, fontSize: 12 }}>
                {t("home.gapEmpty", {
                  time: entry.next.time,
                  name: entry.next.name,
                })}
              </RNText>
              <RNText style={{ color: theme.textSecondary, fontSize: 12 }}>
                {t("home.gapNoReminder", { person: entry.next.personName })}
              </RNText>
            </RNView>
          ) : null}
        </RNView>
      </RNView>
    </RNView>
  );
}

/** 「现在」标记：把当前时刻钉在时间线上，一眼看出哪一剂已经过期 */
function NowMarker({ time, last }: { time: string; last: boolean }) {
  const theme = useTheme();
  const t = useTranslation();
  const size = 12;
  const halo = size + 6;

  return (
    <RNView
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: Spacing.one,
      }}
    >
      <RNView
        style={{
          width: TIME_COL,
          marginRight: COL_GAP,
          alignItems: "flex-end",
        }}
      >
        <RNView
          style={{
            borderRadius: 6,
            backgroundColor: theme.successStrong,
            paddingHorizontal: 7,
            paddingVertical: 4,
          }}
        >
          <RNText
            style={{
              color: "#FFFFFF",
              fontFamily: Fonts.mono,
              fontVariant: ["tabular-nums"],
              fontSize: 10,
              lineHeight: 12,
              fontWeight: "700",
            }}
          >
            {time}
          </RNText>
        </RNView>
      </RNView>

      <RNView
        style={{
          width: RAIL_COL,
          marginRight: COL_GAP,
          alignItems: "center",
        }}
      >
        <RNView
          style={{
            width: halo,
            height: halo,
            borderRadius: halo / 2,
            backgroundColor: theme.canvas,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <RNView
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: theme.successStrong,
            }}
          />
        </RNView>
        {!last ? (
          <RNView
            style={{ width: 2, flex: 1, backgroundColor: theme.border }}
          />
        ) : null}
      </RNView>

      <RNView
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.two,
          paddingBottom: 2,
        }}
      >
        <RNText
          style={{
            color: theme.successStrong,
            fontFamily: Fonts.mono,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 1,
          }}
        >
          {t("home.now")}
        </RNText>
        <RNView
          style={{
            flex: 1,
            borderTopWidth: 2,
            borderStyle: "dashed",
            borderColor: withAlpha(theme.successStrong, 0.45),
          }}
        />
      </RNView>
    </RNView>
  );
}

/**
 * 放进 Expo UI 页面时用这个：导轨的连接线要跟着行高伸缩（flex），
 * universal style 不支持 flex，只能整块留成 RN island。
 * 高度由内容给出，宽度由调用方实测后经 `containerWidth` 传入。
 */
export function DoseRailExpoUI(props: DoseRailProps) {
  return (
    <RNHostView matchContents>
      <DoseRail {...props} />
    </RNHostView>
  );
}
