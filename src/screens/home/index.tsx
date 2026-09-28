import {
  Column,
  Host,
  Icon,
  Picker,
  Row,
  ScrollView,
  Spacer,
  Text,
} from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Linking } from "react-native";

import { ReminderCardStackExpoUI } from "@/components/reminder-card-stack";
import { RoundIconButton } from "@/components/round-icon-button";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useExpoUiContentWidth } from "@/hooks/use-expo-ui-content-width";
import { useOnboardingGate } from "@/hooks/use-onboarding-gate";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, useTranslation } from "@/i18n";
import {
  isNotificationEnabled,
  requestNotificationPermission,
} from "@/lib/notifications";
import { todayKey, useAppData, type Person } from "@/lib/store";
import { StockPanelExpoUI } from "@/screens/home/stock-panel";

/**
 * `Picker` 里代表「全部」的哨兵值 —— `selectedValue` 不接受 null。
 * store 的 id 形如 `<时间戳>-<随机 base36>`，这个带下划线的前缀不可能撞上。
 */
const ALL_PERSONS = "__all__";

/** 星期几的本地化名字交给 Intl，Hermes 自带完整 ICU */
function weekdayName(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  } catch {
    return "";
  }
}

/**
 * 首页（今天）：巨型日期 + 家庭成员筛选 + 提醒卡堆叠 + 库存速览。
 * 视觉基准 = design/today.html。
 *
 * 整屏跑在 `Host` + 原生 `ScrollView` 里（Expo UI 为主），两块 RN island：
 *   1. 提醒卡堆叠（`ReminderCardStackExpoUI`）：Reanimated + BlurView 的手势组件；
 *   2. 库存速览（`StockPanelExpoUI`）：行内药名靠 `flex: 1` 撑开。
 *
 * 两块都靠 `useExpoUiContentWidth` 实测内容区宽度后经 `containerWidth` 喂进去 ——
 * matchContents 下 RN 自测拿不到父级宽度，牌堆位移会直接塌掉。
 * universal style 没有 flex，通栏行用 `Spacer flexible` 撑开。
 */
export function Home() {
  const theme = useTheme();
  const t = useTranslation();
  const router = useRouter();
  const checkingOnboarding = useOnboardingGate();
  const { reminders, medications, persons, plans, loading, reload } =
    useAppData();
  const {
    width: contentWidth,
    onHostLayout,
    onLayoutContent,
  } = useExpoUiContentWidth();
  // null = 全部成员；选中某人时提醒卡堆叠收窄到这个人
  const [personId, setPersonId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const stackReminders = useMemo(
    () =>
      personId === null
        ? reminders
        : reminders.filter((r) => r.personId === personId),
    [personId, reminders],
  );

  // 首屏加载没结束时不渲染内容，避免空列表闪一下再刷出来
  if (checkingOnboarding || loading) return null;

  // 两块 RN island 的可用宽度 = 内容区宽 − 屏幕左右边距
  const islandWidth =
    contentWidth > 0 ? contentWidth - Spacing.screen * 2 : undefined;

  return (
    <>
      <Stack.Title large>{t("home.title")}</Stack.Title>
      <Host
        seedColor={theme.primary}
        style={{ flex: 1 }}
        onLayout={onHostLayout}
        onLayoutContent={onLayoutContent}
      >
        {/* 底色铺在 ScrollView 背后：内容不满一屏时下方也得是 canvas */}
        <ScrollView
          showsIndicators={false}
          style={{ backgroundColor: theme.canvas }}
        >
          {/* 屏幕左右边距统一挂在这层 Column 上：与 design/today.html 的 .pad
              20px 一致，也让三块 RN island 的宽度都等于同一份 islandWidth */}
          <Column
            spacing={Spacing.four}
            style={{
              paddingHorizontal: Spacing.screen,
              paddingVertical: Spacing.three,
            }}
          >
            <HeroHeader
              onAddMedication={() => {
                router.push("/(tabs)/medica/add-options");
              }}
            />

            <NotificationBanner />

            <MemberFilter
              persons={persons}
              personId={personId}
              onSelect={setPersonId}
            />

            <ReminderCardStackExpoUI
              reminders={stackReminders}
              medications={medications}
              persons={persons}
              plans={plans}
              containerWidth={islandWidth}
              onChanged={reload}
            />

            <Column spacing={Spacing.two}>
              <SectionTitle title={t("home.stockTitle")} />
              {loading ? null : (
                <StockPanelExpoUI
                  medications={medications}
                  plans={plans}
                  containerWidth={islandWidth}
                />
              )}
            </Column>
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}

/** 巨型日期头部：右侧是添加药品的圆形按钮 */
function HeroHeader({ onAddMedication }: { onAddMedication: () => void }) {
  const theme = useTheme();
  const t = useTranslation();
  const { language } = useI18n();
  const [year, month, day] = todayKey().split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = weekdayName(date, language === "zh" ? "zh-CN" : "en-US");

  return (
    <Row alignment="end" spacing={Spacing.three}>
      <Column>
        {/* Row 的 alignment 只到 end，没有 baseline：56pt 与 20pt 靠底部对齐 */}
        <Row alignment="end" spacing={Spacing.two}>
          <Text
            textStyle={{
              fontFamily: Fonts.sans,
              fontSize: 56,
              lineHeight: 58,
              fontWeight: "800",
              letterSpacing: -2,
              color: theme.text,
            }}
          >
            {String(day)}
          </Text>
          <Text
            textStyle={{
              fontFamily: Fonts.sans,
              fontSize: 20,
              fontWeight: "600",
              color: theme.textSecondary,
            }}
          >
            {t("home.monthDay", { month })}
          </Text>
        </Row>
        <Text
          textStyle={{
            fontSize: 15,
            fontWeight: "500",
            color: theme.textSecondary,
          }}
        >
          {t("home.weekdayToday", { weekday })}
        </Text>
      </Column>
      <Spacer flexible />
      <RoundIconButton
        testID="home-add-medication-button"
        label={t("home.addMedication")}
        icon="plus"
        size={40}
        iconSize={20}
        onPress={onAddMedication}
      />
    </Row>
  );
}

/**
 * 家庭成员筛选：把时间线与牌堆收窄到某个人。
 *
 * 用 `@expo/ui` 的 `Picker`（`appearance="menu"` → 原生下拉菜单），不是分段控件：
 * 成员数量不定，`pickerStyle('segmented')` 到 4 段以上每段会被压成细条，
 * 菜单则无论几家人都只占一行、选项还能纵向滚动。
 *
 * 「全部」用哨兵值占位：`selectedValue` 只接受 string/number，不接受 null。
 */
function MemberFilter({
  persons,
  personId,
  onSelect,
}: {
  persons: Person[];
  personId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  if (persons.length <= 1) return null;

  return (
    // 必须显式 center：Row 默认是 start（iOS 映射成 HStack 的 .top），
    // 18pt 的图标会被顶到原生菜单 Picker（约 34pt 高的胶囊）的上沿而不是圆心。
    <Row alignment="center" spacing={Spacing.rowGap}>
      <Icon
        name="person.2.fill"
        size={18}
        color={theme.textSecondary}
        accessibilityLabel={t("home.member")}
      />
      <Picker<string>
        testID="home-member-picker"
        appearance="menu"
        selectedValue={personId ?? ALL_PERSONS}
        onValueChange={(value) => {
          onSelect(value === ALL_PERSONS ? null : value);
        }}
      >
        <Picker.Item label={t("home.all")} value={ALL_PERSONS} />
        {persons.map((person) => (
          <Picker.Item key={person.id} label={person.name} value={person.id} />
        ))}
      </Picker>
    </Row>
  );
}

/** 通知权限横幅：未授权时引导开启，否则到点没有提醒 */
function NotificationBanner() {
  const theme = useTheme();
  const t = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void isNotificationEnabled().then(setEnabled);
    }, []),
  );

  if (enabled !== false) return null;

  const enable = async () => {
    if (denied) {
      Linking.openSettings();
      return;
    }
    const ok = await requestNotificationPermission();
    setEnabled(ok);
    if (!ok) setDenied(true);
  };

  return (
    <Row
      alignment="center"
      spacing={Spacing.rowGap}
      style={{
        borderRadius: Radius.card,
        backgroundColor: theme.dangerSoft,
        padding: Spacing.three,
      }}
    >
      <Icon
        name="bell.slash.fill"
        size={18}
        color={theme.danger}
        accessibilityLabel={t("home.notificationOff")}
      />
      <Column>
        <Text
          textStyle={{ fontSize: 14, fontWeight: "600", color: theme.text }}
        >
          {t("home.notificationOff")}
        </Text>
        <Text textStyle={{ fontSize: 12, color: theme.textSecondary }}>
          {t("home.notificationOffBody")}
        </Text>
      </Column>
      <Spacer flexible />
      <Text
        testID="home-notification-enable"
        onPress={() => {
          void enable();
        }}
        textStyle={{
          fontSize: 13,
          fontWeight: "600",
          color: theme.danger,
        }}
      >
        {denied ? t("home.goSettings") : t("home.enable")}
      </Text>
    </Row>
  );
}

function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Text textStyle={{ fontSize: 17, fontWeight: "600", color: theme.text }}>
      {title}
    </Text>
  );
}
