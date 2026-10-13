import { Column, Host, Row, ScrollView, Spacer, Text } from "@expo/ui";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { DoseTimeline } from "@/components/dose-timeline";
import { ProgressBar } from "@/components/progress-bar";
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
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <ScrollView
          style={{ padding: 16, paddingBottom: 32 }}
          showsIndicators={false}
        >
          <Column spacing={16}>
            <Row
              alignment="center"
              style={{
                backgroundColor: theme.backgroundElement,
                borderRadius: 12,
                padding: 8,
              }}
            >
              <NavButton
                testID="records-prev-day"
                label="‹"
                onPress={() => setDate((d) => addDays(d, -1))}
              />
              <Spacer />
              <Text textStyle={{ fontSize: 15, fontWeight: "600" }}>
                {formatDateLabel(date, language)}
              </Text>
              <Spacer />
              <NavButton
                testID="records-next-day"
                label="›"
                disabled={date >= today}
                onPress={() => setDate((d) => (d < today ? addDays(d, 1) : d))}
              />
            </Row>

            {!loading && total > 0 ? (
              <Column
                spacing={10}
                style={{
                  backgroundColor: theme.primarySoft,
                  borderRadius: 16,
                  padding: 16,
                }}
              >
                <Row alignment="end" spacing={6}>
                  <Text textStyle={{ fontSize: 28, fontWeight: "700" }}>
                    {`${rate}%`}
                  </Text>
                  <Text
                    textStyle={{ fontSize: 13, color: theme.textSecondary }}
                  >
                    {t("records.adherence")}
                  </Text>
                </Row>
                <ProgressBar
                  percent={rate / 100}
                  color={theme.primary}
                  track={theme.backgroundSelected}
                  height={8}
                />
                <Text textStyle={{ fontSize: 12, color: theme.textSecondary }}>
                  {t("records.summary", { total, taken, missed, skipped })}
                </Text>
              </Column>
            ) : null}

            {!loading ? (
              <DoseTimeline
                reminders={dayReminders}
                medications={medications}
                persons={persons}
                interactive={date === today}
                onChanged={reload}
                emptyText={t("records.empty")}
              />
            ) : null}
          </Column>
        </ScrollView>
      </Host>
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
    <Row
      testID={testID}
      alignment="center"
      style={{
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 8,
        opacity: disabled ? 0.3 : 1,
      }}
      onPress={disabled ? undefined : onPress}
    >
      <Text
        textStyle={{ fontSize: 20, color: theme.primary, fontWeight: "700" }}
      >
        {label}
      </Text>
    </Row>
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
