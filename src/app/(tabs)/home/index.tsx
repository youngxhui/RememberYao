import { Column, Host, Icon, Row, Spacer, Text } from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Linking } from "react-native";

import { nativeLayout } from "@/components/native-layout";
import { ProgressBar } from "@/components/progress-bar";
import { useOnboardingGate } from "@/hooks/use-onboarding-gate";
import { useTheme } from "@/hooks/use-theme";
import {
  isNotificationEnabled,
  requestNotificationPermission,
} from "@/lib/notifications";
import { stockSummary, todayKey, useAppData } from "@/lib/store";

export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const checkingOnboarding = useOnboardingGate();
  const { reminders, medications, persons, plans, loading, reload } =
    useAppData();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // 首次启动：检查引导页标记，未看过则跳转引导页
  if (checkingOnboarding) return null;

  const today = todayKey();
  const todays = reminders
    .filter((r) => r.date === today)
    // Hermes 没有 ES2023 的 toSorted()（运行时是 undefined，会红屏）；
    // 上游是 filter 产物，原地排序不会改动 store 数据
    // oxlint-disable-next-line unicorn/no-array-sort
    .sort((a, b) => a.time.localeCompare(b.time));
  const doneCount = todays.filter((r) => r.status === "taken").length;

  const lowStock = medications.filter((m) => stockSummary(m, plans).low);
  const stockMeds = medications
    .map((m) => ({ medication: m, summary: stockSummary(m, plans) }))
    .filter((item) => item.summary.daysLeft !== null)
    // 同上：Hermes 无 toSorted()，上游是 filter 产物，原地排序安全
    // oxlint-disable-next-line unicorn/no-array-sort
    .sort((a, b) => (a.summary.daysLeft ?? 0) - (b.summary.daysLeft ?? 0))
    .slice(0, 3);

  return (
    <>
      <Stack.Title large>{greeting(persons[0]?.name)}</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          onPress={() => {
            router.push("/(tabs)/medica/add-options");
          }}
        >
          <Stack.Toolbar.Icon sf="plus" />
          <Stack.Toolbar.Label>添加</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <Column spacing={16} style={{ padding: 16 }}>
          <Text textStyle={{ fontSize: 15, color: theme.textSecondary }}>
            {formatTodayLabel(today)}
          </Text>
          {loading ? (
            <Text textStyle={{ color: theme.textSecondary }}>正在加载…</Text>
          ) : (
            <>
              <Column spacing={8}>
                <Text textStyle={{ fontSize: 17, fontWeight: "700" }}>
                  {`今日服药 ${doneCount}/${todays.length}`}
                </Text>
                <ProgressBar
                  percent={todays.length > 0 ? doneCount / todays.length : 0}
                  color={theme.primary}
                  track={theme.backgroundSelected}
                />
              </Column>
              <NotificationBanner />
              {lowStock.length > 0 ? (
                <Column spacing={8}>
                  <Text textStyle={{ fontSize: 17, fontWeight: "700" }}>
                    库存提醒
                  </Text>
                  {stockMeds.map(({ medication, summary }) => (
                    <StockBrief
                      key={medication.id}
                      name={medication.name}
                      daysLeft={summary.daysLeft ?? 0}
                      low={summary.low}
                      percent={
                        medication.totalQuantity > 0
                          ? medication.remainingQuantity /
                            medication.totalQuantity
                          : 0
                      }
                      onPress={() => {
                        router.push({
                          pathname: "/(tabs)/medica/detail",
                          params: { id: medication.id },
                        });
                      }}
                    />
                  ))}
                </Column>
              ) : (
                <Text textStyle={{ color: theme.textSecondary }}>
                  暂无低库存药品
                </Text>
              )}
            </>
          )}
        </Column>
      </Host>
    </>
  );
}

/** 首页库存速览行 */
function StockBrief({
  name,
  daysLeft,
  low,
  percent,
  onPress,
}: {
  name: string;
  daysLeft: number;
  low: boolean;
  percent: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Column
      spacing={8}
      onPress={onPress}
      style={{
        backgroundColor: theme.backgroundElement,
        borderRadius: 14,
        padding: 12,
      }}
    >
      <Row alignment="center">
        <Text textStyle={{ fontSize: 14, fontWeight: "600" }}>{name}</Text>
        <Spacer />
        <Text
          textStyle={{
            fontSize: 12,
            color: low ? theme.danger : theme.textSecondary,
          }}
        >
          {`剩余 ${daysLeft} 天`}
        </Text>
      </Row>
      <ProgressBar
        percent={percent}
        color={low ? theme.danger : theme.success}
        track={theme.backgroundSelected}
      />
    </Column>
  );
}

/** 通知权限横幅：未授权时引导开启 */
function NotificationBanner() {
  const theme = useTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);

  const check = useCallback(() => {
    void isNotificationEnabled().then(setEnabled);
  }, []);

  useFocusEffect(
    useCallback(() => {
      check();
    }, [check]),
  );

  const enable = async () => {
    if (denied) {
      Linking.openSettings();
      return;
    }
    const ok = await requestNotificationPermission();
    setEnabled(ok);
    if (!ok) setDenied(true);
  };

  if (enabled !== false) return null;

  return (
    <Row
      spacing={8}
      alignment="center"
      style={{
        backgroundColor: theme.dangerSoft,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Icon name="bell.slash.fill" size={18} color={theme.danger} />
      <Column
        spacing={2}
        modifiers={[nativeLayout({ unconstrainedWidth: true })]}
      >
        <Text textStyle={{ fontSize: 14, fontWeight: "600" }}>通知未开启</Text>
        <Text textStyle={{ fontSize: 12, color: theme.textSecondary }}>
          开启通知后，到点会提醒用药
        </Text>
      </Column>
      <Text
        textStyle={{ fontSize: 13, color: theme.primary, fontWeight: "600" }}
        onPress={enable}
      >
        {denied ? "去设置" : "开启"}
      </Text>
    </Row>
  );
}

function greeting(name?: string): string {
  const hour = new Date().getHours();
  const hello =
    hour < 6
      ? "夜深了"
      : hour < 12
        ? "早上好"
        : hour < 14
          ? "中午好"
          : hour < 18
            ? "下午好"
            : "晚上好";
  return name ? `${hello}，${name}` : hello;
}

function formatTodayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const week = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `${y} 年 ${m} 月 ${d} 日 · 周${week}`;
}
