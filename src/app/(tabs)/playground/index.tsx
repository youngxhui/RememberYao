import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import {
  ScrollView as RNScrollView,
  Text as RNText,
  View as RNView,
} from "react-native";

import {
  MiniArchive,
  archiveEntryFromMedication,
} from "@/components/mini-archive";
import { ReminderCardStack } from "@/components/reminder-card-stack";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import { useAppData } from "@/lib/store";

/**
 * Playground：纯 RN 调试屏。
 * 刻意不用 Host / SwiftUI 组件 —— MiniArchive 嵌在 SwiftUI ScrollView 下
 * 触摸链路存疑，这里全用 RN 视图做隔离对照，便于定位交互问题。
 */
export default function PlaygroundScreen() {
  const theme = useTheme();
  const router = useRouter();
  const t = useTranslation();
  const { medications, persons, plans, reminders, loading, reload } =
    useAppData();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const entries = medications.map((medication) =>
    archiveEntryFromMedication(medication, t),
  );
  // 与 ReminderCardStack 内部同口径，仅用于空态提示文案
  const pendingCount = reminders.filter(
    (r) => r.status === "pending" || r.status === "missed",
  ).length;

  return (
    <>
      <Stack.Title large>{t("tab.playground")}</Stack.Title>
      <RNView style={{ flex: 1, backgroundColor: theme.background }}>
        <RNScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            // padding: Spacing.three,
            // paddingBottom: Spacing.five,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {/* 首屏加载没结束时不显示空态；组件自带「暂无药品档案」空态 */}
          {!loading ? (
            <>
              <MiniArchive
                entries={entries}
                onSelectEntry={(entry) => {
                  router.push({
                    pathname: "/(tabs)/medica/detail",
                    params: { id: entry.id },
                  });
                }}
              />
              {/* 纯 RN 屏直接挂载即可（无需 RNHostView），
                  在这里对照验证 Pan 手势与外层滚动是否冲突 */}
              <RNView
                style={{
                  marginTop: Spacing.five,
                  paddingHorizontal: Spacing.three,
                }}
              >
                <RNText
                  style={{
                    color: theme.textSecondary,
                    fontSize: 13,
                    marginBottom: Spacing.two,
                  }}
                >
                  {t("common.playgroundCardStack")}
                </RNText>
                <ReminderCardStack
                  reminders={reminders}
                  medications={medications}
                  persons={persons}
                  plans={plans}
                  onChanged={reload}
                />
                {pendingCount === 0 ? (
                  <RNText style={{ color: theme.textSecondary, fontSize: 13 }}>
                    {t("common.playgroundEmpty")}
                  </RNText>
                ) : null}
              </RNView>
            </>
          ) : (
            <RNText style={{ color: theme.textSecondary }}>
              {t("home.loading")}
            </RNText>
          )}
        </RNScrollView>
      </RNView>
    </>
  );
}
