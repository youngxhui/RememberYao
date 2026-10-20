import { useObserve } from "expo-observe";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking } from "react-native";
import { Button, Text, View, XStack, YStack } from "tamagui";

import { ReminderCardStack } from "@/components/reminder-card-stack";
import { ScreenScaffold, Padded } from "@/components/screen-scaffold";
import { SymbolIcon } from "@/components/symbol-icon";
import { memberFilterIcon } from "@/components/toolbar-icons";
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
 *
 * 内容树走 Tamagui 原语（XStack / YStack / Text / Button）+ token 名，
 * 滚动容器与系统 chrome 不动；只有 `SymbolIcon` 这类原生视图仍要
 * `useTheme()` 取真实色值（见 tamagui.config.ts 顶部说明）。
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

  // 首屏加载没结束时不显示 empty 态，但必须给 loading 反馈。
  // 早年这里直接 return null：DB 慢和同步链卡死看起来一模一样（2026-10-20 真机
  // 截图：整块内容区空白，只有标题和 tab 栏），既违反四态规则也没法排查
  if (checkingOnboarding || loading) {
    return (
      <>
        <Stack.Title large>{t("home.title")}</Stack.Title>
        <ScreenScaffold>
          <Padded>
            <Text color="textSecondary">{t("home.loading")}</Text>
          </Padded>
        </ScreenScaffold>
      </>
    );
  }

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

              <YStack marginTop="four">
                <SectionTitle title={t("home.stockListTitle")} />
                {loading ? null : (
                  <StockPanel medications={medications} plans={plans} />
                )}
              </YStack>
            </>
          )}
        </Padded>
      </ScreenScaffold>
    </>
  );
}

/** 巨型日期头部 */
function HeroHeader() {
  const t = useTranslation();
  const { language } = useI18n();
  const [year, month, day] = todayKey().split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = weekdayName(date, language === "zh" ? "zh-CN" : "en-US");

  return (
    <XStack alignItems="flex-end" gap="three">
      <YStack flex={1} gap="half">
        <XStack alignItems="flex-end" gap="two">
          <Text
            fontSize={56}
            lineHeight={58}
            fontWeight="800"
            letterSpacing={-2}
            color="text"
          >
            {String(day)}
          </Text>
          <Text
            fontSize={20}
            fontWeight="600"
            color="textSecondary"
            marginBottom={2}
          >
            {t("home.monthDay", { month })}
          </Text>
        </XStack>
        <Text fontSize={15} fontWeight="500" color="textSecondary">
          {t("home.weekdayToday", { weekday })}
        </Text>
      </YStack>
    </XStack>
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
    <XStack
      alignItems="center"
      gap="rowGap"
      backgroundColor="dangerSoft"
      padding="three"
      borderRadius="card"
    >
      <SymbolIcon
        name={{ ios: "bell.slash.fill", android: "notifications_off" }}
        size={18}
        color={theme.danger}
      />
      <YStack flex={1}>
        <Text fontSize={14} fontWeight="600" color="text">
          {t("home.notificationOff")}
        </Text>
        <Text fontSize={12} color="textSecondary">
          {t("home.notificationOffBody")}
        </Text>
      </YStack>
      <Button
        testID="home-notification-enable"
        onPress={() => {
          void enable();
        }}
        size={false}
        padding={0}
        borderWidth={0}
        backgroundColor="transparent"
        color="danger"
        fontSize={13}
        fontWeight="600"
      >
        {denied ? t("home.goSettings") : t("home.enable")}
      </Button>
    </XStack>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text fontSize={17} fontWeight="600" color="text">
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
    <YStack
      alignItems="center"
      justifyContent="center"
      gap="three"
      paddingTop="five"
    >
      <View
        width={120}
        height={120}
        borderRadius={32}
        alignItems="center"
        justifyContent="center"
      >
        <SymbolIcon
          name={{ ios: "cross.case.fill", android: "medical_information" }}
          size={56}
          color={theme.primary}
        />
      </View>
      <Text fontSize={22} fontWeight="800" color="text" textAlign="center">
        {t("home.emptyTitle")}
      </Text>
      <Text
        fontSize={14}
        lineHeight={20}
        color="textSecondary"
        textAlign="center"
      >
        {t("home.emptyBody")}
      </Text>
      <Button
        testID="home-empty-add-button"
        onPress={onAdd}
        size={false}
        borderWidth={0}
        backgroundColor="primary press:primarySoft"
        color="onPrimary"
        borderRadius="card"
        borderCurve="continuous"
        paddingInline="three"
        paddingBlock="two"
        minHeight={44}
        fontSize={15}
        fontWeight="600"
      >
        {t("home.emptyAction")}
      </Button>
      <Text fontSize={12} color="textSecondary" textAlign="center">
        {t("home.privacyNote")}
      </Text>
    </YStack>
  );
}

/** 有药品、但今天没有待处理提醒时的占位（区别于首次使用的空状态） */
function NoScheduleToday() {
  const theme = useTheme();
  const t = useTranslation();
  return (
    <YStack
      alignItems="center"
      justifyContent="center"
      gap="two"
      paddingBlock="five"
    >
      <SymbolIcon
        name={{ ios: "calendar", android: "calendar_month" }}
        size={40}
        color={theme.textSecondary}
      />
      <Text
        fontSize={15}
        fontWeight="600"
        color="textSecondary"
        textAlign="center"
      >
        {t("home.noSchedule")}
      </Text>
      <Text fontSize={13} color="textSecondary" textAlign="center">
        {t("home.noScheduleHint")}
      </Text>
    </YStack>
  );
}
