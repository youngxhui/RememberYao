import {
  Button,
  Column,
  Host,
  Icon,
  Row,
  ScrollView,
  Spacer,
  Text,
} from "@expo/ui";
import { useObserve } from "expo-observe";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking } from "react-native";

import { ICONS } from "@/components/icons";
import {
  nativeButtonModifiers,
  nativeLayout,
} from "@/components/native-layout";
import { ReminderCardStackExpoUI } from "@/components/reminder-card-stack";
import { memberFilterIcon } from "@/components/toolbar-icons";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useExpoUiContentWidth } from "@/hooks/use-expo-ui-content-width";
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
import { StockPanelExpoUI } from "@/screens/home/stock-panel";

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
 * 视觉基准 = design/today.html。
 *
 * 整屏跑在 `Host` + 原生 `ScrollView` 里（Expo UI 为主），两块 RN island：
 *   1. 提醒卡堆叠（`ReminderCardStackExpoUI`）：Reanimated + BlurView 的手势组件；
 *   2. 药品库存（`StockPanelExpoUI`）：行内药名靠 `flex: 1` 撑开。
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
  const { markInteractive } = useObserve();
  // 按需读取：这一屏只要未处理提醒 + 药品 + 成员 + 配置（库存估算用）
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
  const {
    width: contentWidth,
    onHostLayout,
    onLayoutContent,
  } = useExpoUiContentWidth();
  // null = 全部成员；选中某人时提醒卡堆叠收窄到这个人
  const [personId, setPersonId] = useState<string | null>(null);
  // 选中的人可能在「我的」里被删掉：按当前成员集合收敛，被删的人自动退回
  // 「全部」—— 否则工具栏标签找不到对应成员，提醒也被过虑成空列表
  const activePersonId =
    personId !== null && persons.some((person) => person.id === personId)
      ? personId
      : null;

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // 冷启动的主落点。加载期间本屏返回 null，所以「可交互」押在数据落地、
  // 内容真正画出来这一刻 —— 这也是 splash 背后那波首次读取的终点
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

  // 两块 RN island 的可用宽度 = 内容区宽 − 屏幕左右边距
  const islandWidth =
    contentWidth > 0 ? contentWidth - Spacing.screen * 2 : undefined;

  return (
    <>
      <Stack.Title large>{t("home.title")}</Stack.Title>
      {/* 成员筛选常驻系统导航栏右上角：不随内容滚走，也不必占内容区高度 */}
      <MemberFilterToolbar
        persons={persons}
        personId={activePersonId}
        onSelect={setPersonId}
      />
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
                  <ReminderCardStackExpoUI
                    reminders={stackReminders}
                    medications={medications}
                    persons={persons}
                    plans={plans}
                    containerWidth={islandWidth}
                    onChanged={reload}
                  />
                ) : (
                  <NoScheduleToday />
                )}

                <Column spacing={Spacing.two}>
                  <SectionTitle title={t("home.stockListTitle")} />
                  {loading ? null : (
                    <StockPanelExpoUI
                      medications={medications}
                      plans={plans}
                      containerWidth={islandWidth}
                    />
                  )}
                </Column>
              </>
            )}
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}

/** 巨型日期头部：右侧是添加药品的圆形按钮 */
function HeroHeader() {
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
    </Row>
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

  // iOS 上图标优先、label 只供无障碍朗读；两端图标分别走 SF Symbol 与
  // Material Symbols（src/components/toolbar-icons.ts）。选中某人时换成他的
  // 头像照片（工具栏图标槽只收图片源，正合照片；没有照片才退回通用图标）
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
        name={ICONS.bellSlash}
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

/**
 * 首次使用的首页空状态：一句价值主张 + 一个主操作 + 底部一句隐私承诺。
 *
 * 刻意不罗列药品库 / 图表 / 库存等在用户还没获得价值前看不懂的功能（产品方案
 * 第二节）：刚下载 App 的用户手里拿着一盒药，首页只需回答「怎么迈出第一步」。
 */
function FirstRunEmpty({ onAdd }: { onAdd: () => void }) {
  const theme = useTheme();
  const t = useTranslation();
  return (
    <Column
      alignment="center"
      spacing={Spacing.three}
      // 显式撑满：universal style 无 flex，通栏的空态要靠 fullWidth 才能让
      // 内部 alignment="center" 在整宽里居中、主按钮也才是通栏（同 FormSection）
      modifiers={[nativeLayout({ fullWidth: true })]}
      style={{ paddingTop: Spacing.five }}
    >
      <Column
        alignment="center"
        style={{
          width: 120,
          height: 120,
          borderRadius: 32,
        }}
      >
        <Spacer flexible />
        <Icon name={ICONS.medkit} size={56} color={theme.primary} />
        <Spacer flexible />
      </Column>
      <Text
        textStyle={{
          fontSize: 22,
          fontWeight: "800",
          color: theme.text,
          textAlign: "center",
        }}
      >
        {t("home.emptyTitle")}
      </Text>
      <Text
        textStyle={{
          fontSize: 14,
          lineHeight: 20,
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {t("home.emptyBody")}
      </Text>
      <Button
        testID="home-empty-add-button"
        label={t("home.emptyAction")}
        onPress={onAdd}
        modifiers={nativeButtonModifiers({ fullWidth: true })}
      />
      <Text
        textStyle={{
          fontSize: 12,
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {t("home.privacyNote")}
      </Text>
    </Column>
  );
}

/** 有药品、但今天没有待处理提醒时的占位（区别于首次使用的空状态） */
function NoScheduleToday() {
  const theme = useTheme();
  const t = useTranslation();
  return (
    <Column
      alignment="center"
      spacing={Spacing.two}
      modifiers={[nativeLayout({ fullWidth: true })]}
      style={{ paddingVertical: Spacing.five }}
    >
      <Icon name={ICONS.calendar} size={40} color={theme.textSecondary} />
      <Text
        textStyle={{
          fontSize: 15,
          fontWeight: "600",
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {t("home.noSchedule")}
      </Text>
      <Text
        textStyle={{
          fontSize: 13,
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {t("home.noScheduleHint")}
      </Text>
    </Column>
  );
}
