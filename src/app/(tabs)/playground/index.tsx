import { GlassContainer, GlassView } from "expo-glass-effect";
import { supportsNativeGlass } from "expo-liquid-glass-view";
import { Stack, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  StyleSheet,
  Text as RNText,
  View as RNView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ContentGlass } from "@/components/content-glass";
import { GlassChip } from "@/components/glass-chip";
import {
  MiniArchive,
  archiveEntryFromMedication,
} from "@/components/mini-archive";
import { ReminderCardStack } from "@/components/reminder-card-stack";
import { RnRoundIconButton } from "@/components/rn-round-icon-button";
import {
  ScreenScaffold,
  Padded,
  FullBleed,
} from "@/components/screen-scaffold";
import { Spacing, Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import { sendTestNotification } from "@/lib/notifications";
import {
  useMedications,
  useOpenReminders,
  usePersons,
  usePlans,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

/**
 * Playground：纯 RN 调试屏。
 * 刻意不用 Host / SwiftUI 组件 —— MiniArchive 嵌在 SwiftUI ScrollView 下
 * 触摸链路存疑，这里全用 RN 视图做隔离对照，便于定位交互问题。
 */
export default function PlaygroundScreen() {
  const theme = useTheme();
  const router = useRouter();
  const t = useTranslation();
  const insets = useSafeAreaInsets();
  const [variant, setVariant] = useState<"regular" | "clear">("regular");
  // 按需读取：调试屏陈列药品档案与牌堆，各取自己那份
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
  const {
    data: plans,
    loading: plansLoading,
    reload: reloadPlans,
  } = usePlans();
  const {
    data: reminders,
    loading: remindersLoading,
    reload: reloadReminders,
  } = useOpenReminders();
  const loading =
    medicationsLoading || personsLoading || plansLoading || remindersLoading;
  // 当前设备是否支持原生 UIGlassEffect（iOS 26+）
  const nativeSupported = supportsNativeGlass;
  // 牌堆里标记服用后刷新这一屏的查询（写操作已落库，重读即可）
  const reload = useCallback(() => {
    reloadMedications();
    reloadPersons();
    reloadPlans();
    reloadReminders();
  }, [reloadMedications, reloadPersons, reloadPlans, reloadReminders]);

  const [glassCardVariant, setGlassCardVariant] = useState<"regular" | "clear">(
    "regular",
  );
  const [activeChip, setActiveChip] = useState<string>("all");
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
            // 本屏在根 Stack 里且 headerShown: false，内容从 y=0 起排。不手动避开
            // 顶部的话第一块会落进状态栏 —— 那块区域的点击由系统接管，按钮永远按不到。
            // 底部跟安全区走：调试屏已不在 tab 组内，没有 tab 栏要避让
            paddingTop: insets.top + Spacing.two,
            paddingBottom: insets.bottom + Spacing.five,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 首屏加载没结束时不显示空态；组件自带「暂无药品档案」空态 */}
          {!loading ? (
            <>
              <RNPressable
                testID="playground-test-notification-button"
                accessibilityRole="button"
                onPress={() => {
                  void sendTestNotification();
                }}
                // style 必须是函数形式才拿得到 pressed —— 写成静态对象按压时毫无反馈
                style={({ pressed }) => ({
                  marginHorizontal: Spacing.three,
                  paddingVertical: Spacing.two,
                  borderRadius: 12,
                  borderCurve: "continuous",
                  alignItems: "center",
                  backgroundColor: theme.primary,
                  opacity: pressed ? 0.6 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
                android_ripple={{ color: withAlpha(theme.primary, 0.25) }}
              >
                <RNText
                  style={{
                    color: theme.onPrimary,
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                >
                  {t("common.playgroundTestNotification")}
                </RNText>
              </RNPressable>

              <RNPressable
                testID="playground-open-records"
                accessibilityRole="button"
                onPress={() => {
                  router.push("/records");
                }}
                style={({ pressed }) => ({
                  marginHorizontal: Spacing.three,
                  marginTop: Spacing.two,
                  paddingVertical: Spacing.two,
                  borderRadius: 12,
                  borderCurve: "continuous",
                  alignItems: "center",
                  backgroundColor: pressed
                    ? theme.backgroundElement
                    : theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                })}
              >
                <RNText
                  style={{
                    color: theme.text,
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                >
                  打开服药记录（临时入口）
                </RNText>
              </RNPressable>

              {/* ─── 液态玻璃组件演示 ─── */}
              <RNView
                style={[
                  {
                    marginTop: Spacing.five,
                    paddingHorizontal: Spacing.three,
                  },
                  styles.glassDemoContainer,
                ]}
              >
                {/* 渲染后端提示 */}
                <RNText
                  style={[
                    styles.sectionLabelText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {nativeSupported
                    ? "LiquidGlass: 原生 UIGlassEffect (iOS 26+)"
                    : "LiquidGlass: Metal 回退 / 降级为普通 View"}
                </RNText>

                {/* variant 切换 */}
                <RNView
                  style={{
                    flexDirection: "row",
                    gap: Spacing.two,
                    marginTop: Spacing.two,
                  }}
                >
                  {(["regular", "clear"] as const).map((v) => (
                    <RNPressable
                      key={v}
                      testID={`playground-glass-variant-${v}`}
                      onPress={() => setVariant(v)}
                      style={({ pressed }) => ({
                        paddingHorizontal: Spacing.three,
                        paddingVertical: Spacing.two,
                        borderRadius: 999,
                        borderCurve: "continuous",
                        backgroundColor:
                          variant === v
                            ? theme.primary
                            : withAlpha(theme.primary, 0.12),
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <RNText
                        style={{
                          color:
                            variant === v ? theme.onPrimary : theme.primary,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        {v === "regular" ? "Regular" : "Clear"}
                      </RNText>
                    </RNPressable>
                  ))}
                </RNView>

                {/* glassView 版本 */}
                <RNPressable
                  testID="playground-glass-primary-button"
                  onPress={() => {
                    console.log("GlassView Button OnPress");
                  }}
                >
                  <GlassView isInteractive={true} style={styles.glassButton2}>
                    <RNText>确认服药 GlassView</RNText>
                  </GlassView>
                </RNPressable>
              </RNView>

              {/* ─── 迁移组件展示 ─── */}
              <RNView
                style={{
                  marginTop: Spacing.five,
                  paddingHorizontal: Spacing.three,
                  gap: Spacing.four,
                }}
              >
                <RNText
                  style={{
                    color: theme.textSecondary,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  迁移组件展示（第 0 批）
                </RNText>

                {/* ContentGlass */}
                <RNView style={{ gap: Spacing.two }}>
                  <RNText
                    style={{
                      color: theme.text,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    ContentGlass
                  </RNText>
                  <RNView
                    style={{
                      flexDirection: "row",
                      gap: Spacing.two,
                      alignItems: "center",
                    }}
                  >
                    {(["regular", "clear"] as const).map((v) => (
                      <RNPressable
                        key={v}
                        testID={`playground-content-glass-${v}`}
                        onPress={() => setGlassCardVariant(v)}
                        style={({ pressed }) => ({
                          paddingHorizontal: Spacing.three,
                          paddingVertical: Spacing.two,
                          borderRadius: 999,
                          borderCurve: "continuous",
                          backgroundColor:
                            glassCardVariant === v
                              ? theme.primary
                              : withAlpha(theme.primary, 0.12),
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <RNText
                          style={{
                            color:
                              glassCardVariant === v
                                ? theme.onPrimary
                                : theme.primary,
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {v === "regular" ? "Regular" : "Clear"}
                        </RNText>
                      </RNPressable>
                    ))}
                  </RNView>
                  <ContentGlass
                    variant={glassCardVariant}
                    tint={theme.primary}
                    cornerRadius={Radius.card}
                    style={{ padding: Spacing.three }}
                    fallbackStyle={{
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                  >
                    <RNText
                      style={{
                        color: theme.text,
                        fontSize: 15,
                        fontWeight: "600",
                      }}
                    >
                      这是 ContentGlass 卡片
                    </RNText>
                    <RNText
                      style={{
                        color: theme.textSecondary,
                        fontSize: 13,
                        marginTop: Spacing.one,
                      }}
                    >
                      原生玻璃 / 实心 fallback 自动切换
                    </RNText>
                  </ContentGlass>
                </RNView>

                {/* GlassChip */}
                <RNView style={{ gap: Spacing.two }}>
                  <RNText
                    style={{
                      color: theme.text,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    GlassChip
                  </RNText>
                  <RNView
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: Spacing.two,
                    }}
                  >
                    <GlassContainer spacing={6} style={styles.containerStyle}>
                      {[
                        { id: "all", label: "全部" },
                        { id: "chronic", label: "慢性病" },
                        { id: "acute", label: "急性病" },
                        { id: "supplement", label: "补充剂" },
                      ].map((chip) => (
                        <GlassChip
                          key={chip.id}
                          testID={`playground-glass-chip-${chip.id}`}
                          label={chip.label}
                          active={activeChip === chip.id}
                          onPress={() => setActiveChip(chip.id)}
                        />
                      ))}
                    </GlassContainer>
                  </RNView>
                </RNView>

                {/* RnRoundIconButton */}
                <RNView style={{ gap: Spacing.two }}>
                  <RNText
                    style={{
                      color: theme.text,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    RnRoundIconButton
                  </RNText>
                  <RNView
                    style={{
                      flexDirection: "row",
                      gap: Spacing.three,
                      alignItems: "center",
                    }}
                  >
                    <RnRoundIconButton
                      testID="playground-round-icon-add"
                      label="添加"
                      icon={{ ios: "plus", android: "add" }}
                      size={44}
                      iconSize={24}
                      onPress={() => {}}
                    />
                    <RnRoundIconButton
                      testID="playground-round-icon-settings"
                      label="设置"
                      icon={{ ios: "gearshape", android: "settings" }}
                      size={36}
                      iconSize={20}
                      onPress={() => {}}
                    />
                  </RNView>
                </RNView>

                {/* ScreenScaffold 效果 */}
                <RNView style={{ gap: Spacing.two }}>
                  <RNText
                    style={{
                      color: theme.text,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    ScreenScaffold（scroll={false}）
                  </RNText>
                  <ScreenScaffold scroll={false}>
                    <Padded>
                      <RNView
                        style={{
                          backgroundColor: theme.primarySoft,
                          padding: Spacing.two,
                          borderRadius: Radius.card,
                        }}
                      >
                        <RNText style={{ color: theme.primary, fontSize: 14 }}>
                          Padded 区块（内缩 {Spacing.screen}pt）
                        </RNText>
                      </RNView>
                    </Padded>
                    <RNView style={{ height: Spacing.two }} />
                    <FullBleed>
                      <RNView
                        style={{
                          backgroundColor: theme.warningSoft,
                          padding: Spacing.two,
                        }}
                      >
                        <RNText style={{ color: theme.warning, fontSize: 14 }}>
                          FullBleed 区块（顶到左右缘）
                        </RNText>
                      </RNView>
                    </FullBleed>
                  </ScreenScaffold>
                </RNView>
              </RNView>

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

const styles = StyleSheet.create({
  glassDemoContainer: {
    gap: Spacing.four,
  },
  sectionLabelText: {
    fontSize: 13,
    fontWeight: "600",
  },
  glassButton: {
    alignItems: "center",
    paddingVertical: Spacing.two + 2,
    // paddingHorizontal: Spacing.three,
  },
  glassButtonNarrow: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.three + 8,
  },
  glassButton2: {
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.two + 2,
  },
  glassButtonLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
  tagPill: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 2,
    alignItems: "center",
  },
  tagLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  glassCard: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  cardSubtitle: {
    fontSize: 14,
  },
  containerStyle: {
    top: 200,
    left: 50,
    width: 250,
    height: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
});
