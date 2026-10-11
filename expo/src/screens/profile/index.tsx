import {
  Column,
  Host,
  ListItem,
  Row,
  ScrollView,
  Spacer,
  Text,
} from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";

import { AvatarMark } from "@/components/avatar";
import { MiniArchiveExpoUI } from "@/components/mini-archive";
import { RoundIconButton } from "@/components/round-icon-button";
import { roundedBox } from "@/components/rounded-box";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useExpoUiContentWidth } from "@/hooks/use-expo-ui-content-width";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  missedStreaks,
  todayKey,
  useAppData,
  weekStartKey,
  weekStats,
  type MedicationPlan,
  type Person,
  type WeekStats,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

/**
 * 「待关注」的判定门槛：最近一次已处理的提醒是漏服就算一次。
 *
 * 刻意不用 `settings.missedAlertStreak` —— 那是「要不要发通知」的偏好，
 * 拿它当徽章门槛会让关掉连续漏服提醒的人看不到家人的漏服。
 */
const WATCH_STREAK = 1;

/** 家庭成员卡右上角的健康徽章 */
type MemberTone = "ok" | "watch" | "none";

/**
 * 我的：档案横排 + 本周概览 + 家庭成员。
 * 视觉基准 = design/profile.html。
 *
 * 整屏跑在 `Host` + 原生 `ScrollView` 里（Expo UI 为主），RN 只留两个 island：
 *   1. Mini Archive 本身就是 Reanimated + BlurView 的横向滚动组件，走
 *      `MiniArchiveSwiftUI`（RNHostView matchContents），宽度由 Host 实测后经
 *      `containerWidth` 喂进去 —— matchContents 下 RN 自测拿不到父级宽度；
 *   2. 成员卡头像（AvatarMark）是 RN 子树，放进 `ListItem` 的 leading 槽，
 *      由 ListItem 自己包 RNHostView 托管，不在这一屏里搭桥。
 *
 * universal style 没有 flex，所以布局用两种写法补齐（详见
 * docs/conventions/expo-ui-layout.md）：
 *   - 通栏行用 `Spacer flexible` 把右端内容推到边；
 *   - 三等分统计卡按实测内容宽度算出固定卡宽，避免「窗口 − 内边距」猜错。
 *
 * 大标题走原生 `Stack.Title large`（就是设计稿的 hero-title），内容里只留副标题
 * 和右上角设置按钮，避免「我的」在同一屏出现两次。
 *
 * 原本底部的「设置 / 通知设置 / 隐私与数据」菜单卡已删：这三项最终都跳到
 * 同一个设置页，而右上角 toolbar 已经有设置入口，重复两遍没有意义。
 */
export function Profile() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
  const { persons, plans, reminders, loading, reload } = useAppData();
  const {
    width: contentWidth,
    onHostLayout,
    onLayoutContent,
  } = useExpoUiContentWidth();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const today = todayKey();
  // 「本周」只统计到今天：周一到周日的完整区间会把还没到的剂量算成应服未服
  const stats = useMemo(
    () => weekStats(reminders, weekStartKey(today), today),
    [reminders, today],
  );
  const watching = useMemo(
    () => missedStreaks(reminders, WATCH_STREAK),
    [reminders],
  );
  const planCounts = useMemo(() => enabledPlanCounts(plans), [plans]);

  // 三等分统计卡：卡宽 = 内容宽 − 两侧屏幕边距 − 两条卡片缝，再三等分
  const statCardWidth = Math.floor(
    (contentWidth - Spacing.screen * 2 - Spacing.cardGap * 2) / 3,
  );

  return (
    <>
      <Stack.Title large>{t("profile.title")}</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button onPress={() => router.push("/profile/settings")}>
          <Stack.Toolbar.Icon sf="gearshape" />
          <Stack.Toolbar.Label>设置</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host
        seedColor={theme.primary}
        style={{ flex: 1 }}
        onLayout={onHostLayout}
        onLayoutContent={onLayoutContent}
      >
        {/* 底色铺在 ScrollView 背后：内容不满一屏时下方也得是 canvas，
            而原生栈的导航栏底色不归这里管（与改造前一致） */}
        <ScrollView
          showsIndicators={false}
          style={{
            backgroundColor: theme.canvas,
            paddingTop: Spacing.three,
            paddingBottom: Spacing.five,
          }}
        >
          {/* 原生 ScrollView 会在「直接子元素」之间塞入约 56pt 的固定间距
              （真机实测，与 Column spacing 无关），所以所有区块必须收进同一个
              Column，区块间距交给各区块自己的 paddingTop 精确控制
              —— 首页（src/screens/home）同一套写法。
              外缘左右边距仍由各区块自己带：档案横排要通栏，不跟着内缩 */}
          <Column spacing={0}>
            {/* 档案横排按设计稿通栏（不跟着其它区块内缩），横向才有完整行程可滑 */}
            <MiniArchiveExpoUI
              containerWidth={contentWidth > 0 ? contentWidth : undefined}
              entries={[]}
              onSelectEntry={(entry) => {
                router.push({
                  pathname: "/(tabs)/medica/detail",
                  params: { id: entry.id },
                });
              }}
            />

            {/* 首屏还在读数据时不给「0% / 0 / 0」的假数字，直接不渲染这一段 */}
            {loading ? null : (
              <WeekOverview stats={stats} cardWidth={statCardWidth} />
            )}

            <FamilySection
              persons={persons}
              loading={loading}
              planCounts={planCounts}
              watching={watching}
            />
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}

/** 每人启用中的配置数，成员卡副标题与「未配置」徽章都取这里 */
function enabledPlanCounts(plans: MedicationPlan[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const plan of plans) {
    if (!plan.enabled) continue;
    counts.set(plan.personId, (counts.get(plan.personId) ?? 0) + 1);
  }
  return counts;
}

/** 本周概览：服药率 + 按时 + 漏服，数字全部来自 store 的纯函数统计 */
function WeekOverview({
  stats,
  cardWidth,
}: {
  stats: WeekStats;
  /** 三等分后的卡宽，由屏幕内容区实测宽度算出 */
  cardWidth: number;
}) {
  const theme = useTheme();
  const t = useTranslation();

  return (
    <Column
      spacing={Spacing.two}
      style={{ paddingTop: Spacing.two, paddingHorizontal: Spacing.screen }}
    >
      <Row alignment="center" spacing={Spacing.two}>
        <SectionTitle title={t("profile.weekOverview")} />
        <Spacer flexible />
        <Text
          textStyle={{
            fontSize: 12,
            fontFamily: Fonts.mono,
            color: theme.textSecondary,
          }}
        >
          {t("profile.plannedCount", { count: stats.planned })}
        </Text>
      </Row>
      <Row spacing={Spacing.cardGap}>
        <StatCard
          width={cardWidth}
          value={`${stats.adherence}%`}
          label={t("profile.adherence")}
        />
        <StatCard
          width={cardWidth}
          value={String(stats.taken)}
          label={t("profile.onTime")}
        />
        <StatCard
          width={cardWidth}
          value={String(stats.missed)}
          label={t("profile.missed")}
          // 0 次漏服不染色：满屏红字会把「一切正常」读成「出问题了」
          valueColor={stats.missed > 0 ? theme.danger : undefined}
        />
      </Row>
    </Column>
  );
}

function StatCard({
  width,
  value,
  label,
  valueColor,
}: {
  width: number;
  value: string;
  label: string;
  valueColor?: string;
}) {
  const theme = useTheme();
  const box = roundedBox({
    color: theme.border,
    background: theme.surface,
    radius: Radius.card,
    width: 1,
    // 三等分卡靠调用方算好的 width 定宽，不能再喂 frame(maxWidth: .infinity)
    fullWidth: false,
  });
  return (
    <Column
      alignment="center"
      spacing={Spacing.one}
      style={{
        ...box.style,
        width,
        paddingVertical: Spacing.three,
        paddingHorizontal: Spacing.rowGap,
      }}
      modifiers={box.modifiers}
    >
      {/* universal 的 Text 没有 fontVariant：等宽数字拿不到，
          数字位宽偶尔抖 1px，是这层 API 的已知代价 */}
      <Text
        textStyle={{
          fontSize: 28,
          lineHeight: 30,
          fontWeight: "800",
          letterSpacing: -0.84,
          color: valueColor ?? theme.text,
          textAlign: "center",
        }}
      >
        {value}
      </Text>
      <Text
        textStyle={{
          fontSize: 13,
          fontWeight: "500",
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Column>
  );
}

function FamilySection({
  persons,
  loading,
  planCounts,
  watching,
}: {
  persons: Person[];
  loading: boolean;
  planCounts: Map<string, number>;
  watching: Set<string>;
}) {
  const t = useTranslation();
  const router = useRouter();

  return (
    <Column
      spacing={Spacing.two}
      style={{ paddingTop: Spacing.four, paddingHorizontal: Spacing.screen }}
    >
      <Row alignment="center" spacing={Spacing.two}>
        <SectionTitle title={t("profile.familyTitle")} />
        <Spacer flexible />
        <RoundIconButton
          testID="profile-add-member-button"
          label={t("profile.addMember")}
          icon="plus"
          size={36}
          iconSize={18}
          onPress={() => {
            router.push("/(tabs)/profile/persons");
          }}
        />
      </Row>

      <Column spacing={Spacing.cardGap}>
        {/* 首屏还在读数据时不给「还没有成员」的假空态 */}
        {loading ? null : persons.length === 0 ? (
          <Hint text={t("profile.emptyFamily")} />
        ) : (
          persons.map((person) => (
            <MemberCard
              key={person.id}
              person={person}
              planCount={planCounts.get(person.id) ?? 0}
              tone={memberTone(person.id, planCounts, watching)}
              onPress={() => {
                router.push({
                  pathname: "/(tabs)/profile/person-detail",
                  params: { id: person.id },
                });
              }}
            />
          ))
        )}
      </Column>
    </Column>
  );
}

/** 徽章状态：没配药 → 未配置；最近一次已处理的是漏服 → 待关注；其余 → 正常 */
function memberTone(
  personId: string,
  planCounts: Map<string, number>,
  watching: Set<string>,
): MemberTone {
  if ((planCounts.get(personId) ?? 0) === 0) return "none";
  return watching.has(personId) ? "watch" : "ok";
}

/**
 * 成员卡：描边卡片里放一行 `ListItem`。
 * 整行点击热区、头像（RN 子树走 leading 槽的 RNHostView）和右端徽章
 * 都由原生行自己排，flex 那套不用再手工拼。
 */
function MemberCard({
  person,
  planCount,
  tone,
  onPress,
}: {
  person: Person;
  planCount: number;
  tone: MemberTone;
  onPress: () => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const box = roundedBox({
    color: theme.border,
    background: theme.surface,
    radius: Radius.card,
    width: 1,
  });

  return (
    <Column
      style={{
        ...box.style,
        padding: Spacing.three,
      }}
      modifiers={box.modifiers}
    >
      <ListItem
        testID={`profile-member-${person.id}`}
        onPress={onPress}
        leading={
          <AvatarMark color={person.avatarColor} name={person.name} size={44} />
        }
        supportingText={
          <Text
            numberOfLines={1}
            textStyle={{ fontSize: 13, color: theme.textSecondary }}
          >
            {t("person.planCount", { count: planCount })}
          </Text>
        }
        trailing={<MemberBadge tone={tone} />}
      >
        <Text
          numberOfLines={1}
          textStyle={{ fontSize: 17, fontWeight: "700", color: theme.text }}
        >
          {person.name}
        </Text>
      </ListItem>
    </Column>
  );
}

function MemberBadge({ tone }: { tone: MemberTone }) {
  const theme = useTheme();
  const t = useTranslation();

  const toneStyle = {
    ok: { background: theme.success, foreground: theme.successStrong },
    watch: { background: theme.warning, foreground: theme.warningStrong },
    none: { background: theme.textSecondary, foreground: theme.textSecondary },
  }[tone];

  const label = (
    tone === "ok"
      ? t("profile.badgeOk")
      : tone === "watch"
        ? t("profile.badgeWatch")
        : t("profile.badgeNoPlan")
  )
    // universal 的 Text 没有 textTransform，大写在 JS 侧补（中文不受影响）
    .toUpperCase();

  return (
    <Text
      style={{
        // 等价改造前的 minHeight 24 + 居中：文字交给 frame 的默认居中对齐，
        // 胶囊底色跟着同一块 frame 走
        height: 24,
        paddingHorizontal: Spacing.rowGap,
        borderRadius: Radius.pill,
        backgroundColor: withAlpha(toneStyle.background, 0.12),
      }}
      textStyle={{
        fontFamily: Fonts.mono,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.44,
        color: toneStyle.foreground,
        textAlign: "center",
      }}
    >
      {label}
    </Text>
  );
}

function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Text textStyle={{ fontSize: 17, fontWeight: "700", color: theme.text }}>
      {title}
    </Text>
  );
}

/** 区块下的居中说明文字（档案为空 / 还没有成员） */
function Hint({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Column
      style={{
        paddingHorizontal: Spacing.screen,
        paddingVertical: Spacing.three,
      }}
    >
      {/* VStack 不会拉伸子节点：左右各一个弹性 Spacer 才能把短文案压到中线 */}
      <Row alignment="center">
        <Spacer flexible />
        <Text
          textStyle={{
            fontSize: 13,
            color: theme.textSecondary,
            textAlign: "center",
          }}
        >
          {text}
        </Text>
        <Spacer flexible />
      </Row>
    </Column>
  );
}
