import { useObserve } from "expo-observe";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Linking } from "react-native";

import { ReminderCardStack } from "@/components/reminder-card-stack";
import { RnRoundIconButton } from "@/components/rn-round-icon-button";
import { ScreenScaffold, Padded } from "@/components/screen-scaffold";
import { SymbolIcon } from "@/components/symbol-icon";
import { memberFilterIcon } from "@/components/toolbar-icons";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useOnboardingGate } from "@/hooks/use-onboarding-gate";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, useTranslation } from "@/i18n";
import {
  isNotificationEnabled,
  requestNotificationPermission,
} from "@/lib/notifications";
import {
  todayKey,
  useMedications,
  useOpenReminders,
  usePersons,
  usePlans,
  type Person,
} from "@/lib/store";
import { StockPanel } from "@/screens/home/stock-panel";

/** 星期几的本地化名字交给 Intl，Hermes 自带完整 ICU */
function weekdayName(date: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  } catch {
    return "";
  }
}

/**
 * 首页（今天）：巨型日期 + 工具栏右上角的家庭成员筛选 + 提醒卡堆叠 + 药品库存。
 */
export function Home() {
  const t = useTranslation();
  const router = useRouter();
  const checkingOnboarding = useOnboardingGate();
  const { markInteractive } = useObserve();
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
  const reload = useCallback(() => {
    reloadMedications();
    reloadPersons();
    reloadPlans();
    reloadReminders();
  }, [reloadMedications, reloadPersons, reloadPlans, reloadReminders]);

  // null = 全部成员；选中某人时提醒卡堆叠收窄到这个人
  const [personId, setPersonId] = useState<string | null>(null);
  const activePersonId =
    personId !== null && persons.some((person) => person.id === personId)
      ? personId
      : null;

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    if (!checkingOnboarding && !loading) markInteractive();
  }, [checkingOnboarding, loading, markInteractive]);

  const stackReminders = useMemo(
    () =>
      activePersonId === null
        ? reminders
        : reminders.filter((r) => r.personId === activePersonId),
    [activePersonId, reminders],
  );

  // 首屏加载没结束时不渲染内容，避免空列表闪一下再刷出来
  if (checkingOnboarding || loading) return null;

  return (
    <>
      <Stack.Title large>{t("home.title")}</Stack.Title>
      <MemberFilterToolbar
        persons={persons}
        personId={activePersonId}
        onSelect={setPersonId}
      />
      <ScreenScaffold>
        <Padded>
          <HeroHeader />

          {medications.length === 0 ? (
            <FirstRunEmpty
              onAdd={() => {
                router.push("/(tabs)/medica/quick-add");
              }}
            />
          ) : (
            <>
              <NotificationBanner />

              {stackReminders.length > 0 ? (
                <ReminderCardStack
                  reminders={stackReminders}
                  medications={medications}
                  persons={persons}
                  plans={plans}
                  onChanged={reload}
                />
              ) : (
                <NoScheduleToday />
              )}

              <View style={{ marginTop: Spacing.four }}>
                <SectionTitle title={t("home.stockListTitle")} />
                {loading ? null : (
                  <StockPanel medications={medications} plans={plans} />
                )}
              </View>
            </>
          )}
        </Padded>
      </ScreenScaffold>
    </>
  );
}

/** 巨型日期头部：右侧是添加药品的圆形按钮 */
function HeroHeader() {
  const theme = useTheme();
  const t = useTranslation();
  const { language } = useI18n();
  const router = useRouter();
  const [year, month, day] = todayKey().split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = weekdayName(date, language === "zh" ? "zh-CN" : "en-US");

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: Spacing.three,
      }}
    >
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: Spacing.two,
          }}
        >
          <Text
            style={{
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
            style={{
              fontFamily: Fonts.sans,
              fontSize: 20,
              fontWeight: "600",
              color: theme.textSecondary,
              marginBottom: 2,
            }}
          >
            {t("home.monthDay", { month })}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "500",
            color: theme.textSecondary,
            marginTop: 2,
          }}
        >
          {t("home.weekdayToday", { weekday })}
        </Text>
      </View>
      <RnRoundIconButton
        testID="home-add-medication-button"
        label={t("common.add")}
        icon={{ ios: "plus", android: "add" }}
        size={44}
        iconSize={24}
        onPress={() => {
          router.push("/(tabs)/medica/form");
        }}
      />
    </View>
  );
}

/**
 * 家庭成员筛选：把提醒卡堆叠收窄到某个人。
 *
 * 放在系统工具栏右上角（`placement="right"`）而不是内容区里 —— 导航栏常驻、
 * 不随内容滚动，筛选状态随时可见可改。原生 iOS 版同样是导航栏右侧的
 * `UIMenu`（图标用 `line.3.horizontal.decrease.circle`），两端对齐。
 * 用 `Stack.Toolbar.Menu`（原生下拉菜单）而不是分段控件：成员数量不定，
 * `pickerStyle('segmented')` 到 4 段以上每段会被压成细条，菜单则无论几家
 * 人都只占一格、选项还能纵向滚动。选中项由 `isOn` 打勾。
 *
 * 只有一家以上成员才挂上去：单成员时筛选没有意义，导航栏也不留空按钮。
 * 工具栏按钮拿不到 `testID`（见 docs/conventions/data-state.md），只能靠
 * `accessibilityLabel` 与菜单项文案定位。
 */
function MemberFilterToolbar({
  persons,
  personId,
  onSelect,
}: {
  persons: Person[];
  personId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useTranslation();
  if (persons.length <= 1) return null;

  const selectedPerson = persons.find((person) => person.id === personId);
  const selectedName = selectedPerson?.name ?? t("home.all");

  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu
        icon={
          selectedPerson?.avatarUri
            ? { uri: selectedPerson.avatarUri }
            : memberFilterIcon
        }
        accessibilityLabel={t("home.member")}
        title={t("home.member")}
      >
        <Stack.Toolbar.Label>{selectedName}</Stack.Toolbar.Label>
        <Stack.Toolbar.MenuAction
          isOn={personId === null}
          onPress={() => {
            onSelect(null);
          }}
        >
          {t("home.all")}
        </Stack.Toolbar.MenuAction>
        {persons.map((person) => (
          <Stack.Toolbar.MenuAction
            key={person.id}
            isOn={personId === person.id}
            onPress={() => {
              onSelect(person.id);
            }}
          >
            {person.name}
          </Stack.Toolbar.MenuAction>
        ))}
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
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
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.rowGap,
        backgroundColor: theme.dangerSoft,
        padding: Spacing.three,
        borderRadius: Radius.card,
      }}
    >
      <SymbolIcon
        name={{ ios: "bell.slash.fill", android: "notifications_off" }}
        size={18}
        color={theme.danger}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>
          {t("home.notificationOff")}
        </Text>
        <Text style={{ fontSize: 12, color: theme.textSecondary }}>
          {t("home.notificationOffBody")}
        </Text>
      </View>
      <Pressable
        testID="home-notification-enable"
        onPress={() => {
          void enable();
        }}
      >
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: theme.danger,
          }}
        >
          {denied ? t("home.goSettings") : t("home.enable")}
        </Text>
      </Pressable>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Text style={{ fontSize: 17, fontWeight: "600", color: theme.text }}>
      {title}
    </Text>
  );
}

/**
 * 首次使用的首页空状态：一句价值主张 + 一个主操作 + 底部一句隐私承诺。
 */
function FirstRunEmpty({ onAdd }: { onAdd: () => void }) {
  const theme = useTheme();
  const t = useTranslation();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: Spacing.three,
        paddingTop: Spacing.five,
      }}
    >
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: 32,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolIcon
          name={{ ios: "cross.case.fill", android: "medical_information" }}
          size={56}
          color={theme.primary}
        />
      </View>
      <Text
        style={{
          fontSize: 22,
          fontWeight: "800",
          color: theme.text,
          textAlign: "center",
        }}
      >
        {t("home.emptyTitle")}
      </Text>
      <Text
        style={{
          fontSize: 14,
          lineHeight: 20,
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {t("home.emptyBody")}
      </Text>
      <Pressable
        testID="home-empty-add-button"
        onPress={onAdd}
        style={({ pressed }) => ({
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.two,
          borderRadius: Radius.card,
          borderCurve: "continuous",
          backgroundColor: pressed ? theme.primarySoft : theme.primary,
          alignItems: "center",
          justifyContent: "center",
          minHeight: 44,
        })}
      >
        <Text
          style={{ color: theme.onPrimary, fontSize: 15, fontWeight: "600" }}
        >
          {t("home.emptyAction")}
        </Text>
      </Pressable>
      <Text
        style={{
          fontSize: 12,
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {t("home.privacyNote")}
      </Text>
    </View>
  );
}

/** 有药品、但今天没有待处理提醒时的占位（区别于首次使用的空状态） */
function NoScheduleToday() {
  const theme = useTheme();
  const t = useTranslation();
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: Spacing.two,
        paddingVertical: Spacing.five,
      }}
    >
      <SymbolIcon
        name={{ ios: "calendar", android: "calendar_month" }}
        size={40}
        color={theme.textSecondary}
      />
      <Text
        style={{
          fontSize: 15,
          fontWeight: "600",
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {t("home.noSchedule")}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {t("home.noScheduleHint")}
      </Text>
    </View>
  );
}
