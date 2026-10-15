import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { DoseTimeline } from "@/components/dose-timeline";
import { ProgressBarRn } from "@/components/progress-bar";
import { ScreenScaffold, Padded } from "@/components/screen-scaffold";
import { Spacing, Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, type Language } from "@/i18n";
import {
  addDays,
  todayKey,
  useMedications,
  usePersons,
  useRemindersForDate,
} from "@/lib/store";

export default function RecordsScreen() {
  const theme = useTheme();
  const { language, t } = useI18n();
  const [date, setDate] = useState(todayKey());
  // 按日期读当天的提醒，药品 / 成员只读这一屏要的集合
  const {
    data: reminders,
    loading: remindersLoading,
    reload: reloadReminders,
  } = useRemindersForDate(date);
  const {
    data: medications,
    loading: medicationsLoading,
    reload: reloadMedications,
  } = useMedications();
  const {
    data: persons,
    loading: personsLoading,
    reload: reloadPersons,
  } = usePersons();
  // 首屏加载没结束时不显示 empty 态（界面四态约定）：日期栏照常渲染，
  // 统计卡与时间线等数据就绪
  const loading = remindersLoading || medicationsLoading || personsLoading;
  const reload = useCallback(() => {
    reloadReminders();
    reloadMedications();
    reloadPersons();
  }, [reloadReminders, reloadMedications, reloadPersons]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const today = todayKey();
  const dayReminders = reminders;

  const taken = dayReminders.filter((r) => r.status === "taken").length;
  const missed = dayReminders.filter((r) => r.status === "missed").length;
  const skipped = dayReminders.filter((r) => r.status === "skipped").length;
  const total = dayReminders.length;
  const rate = total > 0 ? Math.round((taken / total) * 100) : 0;

  return (
    <>
      <Stack.Title large>{t("records.title")}</Stack.Title>
      <ScreenScaffold>
        <Padded>
          {/* 日期栏 */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.backgroundElement,
              borderRadius: Radius.card,
              padding: Spacing.two,
            }}
          >
            <NavButton
              testID="records-prev-day"
              label="‹"
              onPress={() => setDate((d) => addDays(d, -1))}
            />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                style={{ fontSize: 15, fontWeight: "600", color: theme.text }}
              >
                {formatDateLabel(date, language)}
              </Text>
            </View>
            <NavButton
              testID="records-next-day"
              label="›"
              disabled={date >= today}
              onPress={() => setDate((d) => (d < today ? addDays(d, 1) : d))}
            />
          </View>

          {/* 统计卡 */}
          {!loading && total > 0 ? (
            <View
              style={{
                marginTop: Spacing.three,
                backgroundColor: theme.primarySoft,
                borderRadius: Radius.card,
                padding: Spacing.three,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  gap: Spacing.one,
                }}
              >
                <Text
                  style={{ fontSize: 28, fontWeight: "700", color: theme.text }}
                >
                  {`${rate}%`}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.textSecondary,
                    marginBottom: 2,
                  }}
                >
                  {t("records.adherence")}
                </Text>
              </View>
              <View style={{ marginTop: Spacing.two }}>
                <ProgressBarRn
                  percent={rate / 100}
                  color={theme.primary}
                  track={theme.backgroundSelected}
                  height={8}
                />
              </View>
              <Text
                style={{
                  marginTop: Spacing.two,
                  fontSize: 12,
                  color: theme.textSecondary,
                }}
              >
                {t("records.summary", { total, taken, missed, skipped })}
              </Text>
            </View>
          ) : null}

          {/* 时间线 */}
          {!loading ? (
            <View style={{ marginTop: Spacing.three }}>
              <DoseTimeline
                reminders={dayReminders}
                medications={medications}
                persons={persons}
                interactive={date === today}
                onChanged={reload}
                emptyText={t("records.empty")}
              />
            </View>
          ) : null}
        </Padded>
      </ScreenScaffold>
    </>
  );
}

function NavButton({
  testID,
  label,
  onPress,
  disabled,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        borderRadius: Radius.card,
        opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 20,
          color: theme.primary,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** 日期标题走 Intl：中文「2025年9月5日 周五」与英文「Sep 5, 2025」语序完全不同，
 *  硬编码语序会让其中一种语言出现别扭的日期 */
function formatDateLabel(key: string, language: Language): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: language === "zh" ? "numeric" : "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}
