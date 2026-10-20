import {
  GlassContainer,
  GlassView,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { Button, Text, View } from "tamagui";

import { ContentGlass } from "@/components/content-glass";
import { GlassChip } from "@/components/glass-chip";
import {
  MiniArchive,
  archiveEntryFromMedication,
} from "@/components/mini-archive";
import { ReminderCardStack } from "@/components/reminder-card-stack";
import { RnRoundIconButton } from "@/components/rn-round-icon-button";
import {
  FullBleed,
  Padded,
  ScreenScaffold,
} from "@/components/screen-scaffold";
import { Radius, Spacing } from "@/constants/theme";
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
 * 调试屏陈列用的四档按钮配色。屏里要用 Button 就照这张表抄一份，
 * 或者直接用某一档 —— 不要在每个文件里各写一套颜色。
 * token 名见根目录 tamagui.config.ts（值来自 src/constants/theme.ts）。
 */
const BUTTON_VARIANTS = {
  primary: { backgroundColor: "$primary", color: "$onPrimary" },
  secondary: {
    backgroundColor: "$surface",
    color: "$text",
    borderWidth: 1,
    borderColor: "$border",
  },
  ghost: { backgroundColor: "transparent", color: "$primary" },
  destructive: { backgroundColor: "$danger", color: "$onDanger" },
} as const;

/**
 * Playground：调试屏，骨架与生产屏同构（ScreenScaffold + Padded），UI 原语走 Tamagui。
 * MiniArchive / ReminderCardStack 是 Reanimated 动画岛，内部仍是 RN 视图，
 * 挂在这棵树里正好对照验证手势与外层滚动是否冲突。
 */
export default function PlaygroundScreen() {
  const theme = useTheme();
  const router = useRouter();
  const t = useTranslation();
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
  const nativeSupported = isLiquidGlassAvailable();
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
  // Tamagui Button 陈列：回显按下了哪颗，以及 loading 那颗的演示状态
  const [lastPressed, setLastPressed] = useState<string>("（还没有）");
  const [saving, setSaving] = useState(false);

  // loading 演示：假造一次 1.5 秒的保存。定时器跟着 saving 走，离开屏幕即取消，
  // 不留在组件外回调里 setState
  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => setSaving(false), 1500);
    return () => clearTimeout(timer);
  }, [saving]);
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

      <ScreenScaffold>
        {/* 首屏加载没结束时不显示空态；组件自带「暂无药品档案」空态 */}
        {loading ? (
          <Padded>
            <Text style={{ color: "$textSecondary" }}>{t("home.loading")}</Text>
          </Padded>
        ) : (
          <>
            <Padded>
              {/* 这两个是真动作：借调试屏把 Tamagui Button 的两档配色用起来 */}
              <Button
                testID="playground-test-notification-button"
                onPress={() => {
                  void sendTestNotification();
                }}
                alignSelf="stretch"
                {...BUTTON_VARIANTS.primary}
              >
                {t("common.playgroundTestNotification")}
              </Button>

              <Button
                testID="playground-open-records"
                onPress={() => {
                  router.push("/records");
                }}
                alignSelf="stretch"
                marginBlockStart="two"
                {...BUTTON_VARIANTS.secondary}
              >
                {t("common.playgroundOpenRecords")}
              </Button>
            </Padded>

            {/* ─── Tamagui Button 陈列 ─── */}
            <Padded>
              <View style={{ marginTop: Spacing.five, gap: Spacing.four }}>
                <Text
                  style={[styles.sectionLabelText, { color: "$textSecondary" }]}
                >
                  {t("common.playgroundTamaguiButton")}
                </Text>

                {/* variant：四档各一颗，按下后回显到底下的状态行 */}
                <View style={{ gap: Spacing.two }}>
                  <Text
                    style={{
                      color: "$text",
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    variant
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: Spacing.two,
                      alignItems: "center",
                    }}
                  >
                    {(
                      ["primary", "secondary", "ghost", "destructive"] as const
                    ).map((buttonVariant) => (
                      <Button
                        key={buttonVariant}
                        testID={`playground-tamagui-button-${buttonVariant}`}
                        size="sm"
                        onPress={() =>
                          setLastPressed(`variant:${buttonVariant}`)
                        }
                        {...BUTTON_VARIANTS[buttonVariant]}
                      >
                        {buttonVariant}
                      </Button>
                    ))}
                  </View>
                </View>

                {/* size：三档，档位差在高度与内边距上 */}
                <View style={{ gap: Spacing.two }}>
                  <Text
                    style={{
                      color: "$text",
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    size
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: Spacing.two,
                      alignItems: "center",
                    }}
                  >
                    {(["sm", "md", "lg"] as const).map((size) => (
                      <GlassView
                        key={size}
                        isInteractive={true}
                        style={styles.glassButton3}
                      >
                        <Button
                          testID={`playground-tamagui-button-size-${size}`}
                          size={size}
                          onPress={() => setLastPressed(`size:${size}`)}
                          {...BUTTON_VARIANTS.primary}
                        >
                          {size}
                        </Button>
                      </GlassView>
                    ))}
                  </View>
                </View>

                {/* states：禁用与保存中。loading 那颗点一下真转 1.5 秒 */}
                <View style={{ gap: Spacing.two }}>
                  <Text
                    style={{
                      color: "$text",
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    states
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: Spacing.two,
                      alignItems: "center",
                    }}
                  >
                    <Button
                      testID="playground-tamagui-button-disabled"
                      disabled
                      accessibilityLabel="disabled"
                      onPress={() => {}}
                      {...BUTTON_VARIANTS.primary}
                    >
                      disabled
                    </Button>
                    <Button
                      testID="playground-tamagui-button-loading"
                      disabled={saving}
                      accessibilityLabel={saving ? "saving" : "loading"}
                      onPress={() => setSaving(true)}
                      {...BUTTON_VARIANTS.primary}
                    >
                      {saving ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.onPrimary}
                        />
                      ) : null}
                      {saving ? "saving" : "loading"}
                    </Button>
                  </View>
                  <Text style={{ color: "$textSecondary", fontSize: 13 }}>
                    {t("common.playgroundLastPressed", { target: lastPressed })}
                  </Text>
                </View>
              </View>
            </Padded>

            {/* ─── 液态玻璃组件演示 ─── */}
            <Padded>
              <View
                style={[styles.glassDemoContainer, { marginTop: Spacing.five }]}
              >
                {/* 渲染后端提示 */}
                <Text
                  style={[styles.sectionLabelText, { color: "$textSecondary" }]}
                >
                  {nativeSupported
                    ? "LiquidGlass: 原生 UIGlassEffect (iOS 26+)"
                    : "LiquidGlass: 不可用（需 iOS 26+，内容玻璃退化为实心底）"}
                </Text>

                {/* variant 切换 */}
                <View
                  style={{
                    flexDirection: "row",
                    gap: Spacing.two,
                    marginTop: Spacing.two,
                  }}
                >
                  {(["regular", "clear"] as const).map((v) => (
                    <View
                      key={v}
                      testID={`playground-glass-variant-${v}`}
                      onPress={() => setVariant(v)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: variant === v }}
                      paddingInline="three"
                      paddingBlock="two"
                      borderRadius="pill"
                      borderCurve="continuous"
                      // 实心底才能用透明度做按压反馈；这两颗是实色，不是玻璃
                      opacity="1 press:0.7"
                      backgroundColor={
                        variant === v
                          ? "$primary"
                          : withAlpha(theme.primary, 0.12)
                      }
                    >
                      <Text
                        fontSize={14}
                        fontWeight="600"
                        color={variant === v ? "$onPrimary" : "$primary"}
                      >
                        {v === "regular" ? "Regular" : "Clear"}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* glassView 版本 */}
                <View
                  testID="playground-glass-primary-button"
                  onPress={() => {
                    console.log("GlassView Button OnPress");
                  }}
                >
                  <GlassView isInteractive={true} style={styles.glassButton2}>
                    <Text>确认服药 GlassView</Text>
                  </GlassView>
                </View>
              </View>
            </Padded>

            {/* ─── 迁移组件展示 ─── */}
            <Padded>
              <View style={{ marginTop: Spacing.five, gap: Spacing.four }}>
                <Text
                  style={{
                    color: "$textSecondary",
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  迁移组件展示（第 0 批）
                </Text>

                {/* ContentGlass */}
                <View style={{ gap: Spacing.two }}>
                  <Text
                    style={{
                      color: "$text",
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    ContentGlass
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: Spacing.two,
                      alignItems: "center",
                    }}
                  >
                    {(["regular", "clear"] as const).map((v) => (
                      <View
                        key={v}
                        testID={`playground-content-glass-${v}`}
                        onPress={() => setGlassCardVariant(v)}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: glassCardVariant === v,
                        }}
                        paddingInline="three"
                        paddingBlock="two"
                        borderRadius="pill"
                        borderCurve="continuous"
                        opacity="1 press:0.7"
                        backgroundColor={
                          glassCardVariant === v
                            ? "$primary"
                            : withAlpha(theme.primary, 0.12)
                        }
                      >
                        <Text
                          fontSize={14}
                          fontWeight="600"
                          color={
                            glassCardVariant === v ? "$onPrimary" : "$primary"
                          }
                        >
                          {v === "regular" ? "Regular" : "Clear"}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <ContentGlass
                    variant={glassCardVariant}
                    tint={"$primary"}
                    cornerRadius={Radius.card}
                    style={{ padding: Spacing.three }}
                    fallbackStyle={{
                      backgroundColor: "$surface",
                      borderWidth: 1,
                      borderColor: "$border",
                    }}
                  >
                    <Text
                      style={{
                        color: "$text",
                        fontSize: 15,
                        fontWeight: "600",
                      }}
                    >
                      这是 ContentGlass 卡片
                    </Text>
                    <Text
                      style={{
                        color: "$textSecondary",
                        fontSize: 13,
                        marginTop: Spacing.one,
                      }}
                    >
                      原生玻璃 / 实心 fallback 自动切换
                    </Text>
                  </ContentGlass>
                </View>

                {/* GlassChip */}
                <View style={{ gap: Spacing.two }}>
                  <Text
                    style={{
                      color: "$text",
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    GlassChip
                  </Text>
                  <View
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
                  </View>
                </View>

                {/* RnRoundIconButton */}
                <View style={{ gap: Spacing.two }}>
                  <Text
                    style={{
                      color: "$text",
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    RnRoundIconButton
                  </Text>
                  <View
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
                  </View>
                </View>

                {/* ScreenScaffold 效果 */}
                <View style={{ gap: Spacing.two }}>
                  <Text
                    style={{
                      color: "$text",
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    ScreenScaffold（scroll={false}）
                  </Text>
                  <ScreenScaffold scroll={false}>
                    <Padded>
                      <View
                        style={{
                          backgroundColor: "$primarySoft",
                          padding: Spacing.two,
                          borderRadius: Radius.card,
                        }}
                      >
                        <Text style={{ color: "$primary", fontSize: 14 }}>
                          Padded 区块（内缩 {Spacing.screen}pt）
                        </Text>
                      </View>
                    </Padded>
                    <View style={{ height: Spacing.two }} />
                    <FullBleed>
                      <View
                        style={{
                          backgroundColor: "$warningSoft",
                          padding: Spacing.two,
                        }}
                      >
                        <Text style={{ color: "$warning", fontSize: 14 }}>
                          FullBleed 区块（顶到左右缘）
                        </Text>
                      </View>
                    </FullBleed>
                  </ScreenScaffold>
                </View>
              </View>
            </Padded>

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
            <Padded>
              <View style={{ marginTop: Spacing.five }}>
                <Text
                  style={{
                    color: "$textSecondary",
                    fontSize: 13,
                    marginBottom: Spacing.two,
                  }}
                >
                  {t("common.playgroundCardStack")}
                </Text>
                <ReminderCardStack
                  reminders={reminders}
                  medications={medications}
                  persons={persons}
                  plans={plans}
                  onChanged={reload}
                />
                {pendingCount === 0 ? (
                  <Text style={{ color: "$textSecondary", fontSize: 13 }}>
                    {t("common.playgroundEmpty")}
                  </Text>
                ) : null}
              </View>
            </Padded>
          </>
        )}
      </ScreenScaffold>
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
    paddingBlock: "two" + 2,
    // paddingInline: "three",
  },
  glassButtonNarrow: {
    alignSelf: "flex-start",
    paddingInline: "three" + 8,
  },
  glassButton2: {
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.two + 2,
  },
  glassButton3: {
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
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
