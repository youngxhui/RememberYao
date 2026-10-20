import { useObserve } from "expo-observe";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { Text, View, XStack, YStack } from "tamagui";

import { AvatarMark } from "@/components/avatar";
import { MiniArchive } from "@/components/mini-archive";
import { RnRoundIconButton } from "@/components/rn-round-icon-button";
import {
  ScreenScaffold,
  Padded,
  FullBleed,
} from "@/components/screen-scaffold";
import { settingsIcon } from "@/components/toolbar-icons";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  missedStreaks,
  SELF_PERSON_ID,
  todayKey,
  usePersons,
  usePlans,
  useReminderHistory,
  weekStartKey,
  weekStats,
  type MedicationPlan,
  type Person,
  type WeekStats,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

/**
 * 「待关注」的判定门槛：最近一次已处理的提醒是漏服就算一次。
 */
const WATCH_STREAK = 1;

/** 家庭成员卡右上角的健康徽章 */
type MemberTone = "ok" | "watch" | "none";

export function Profile() {
  const router = useRouter();
  const t = useTranslation();
  const { markInteractive } = useObserve();
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
  } = useReminderHistory();
  const loading = personsLoading || plansLoading || remindersLoading;
  const reload = useCallback(() => {
    reloadPersons();
    reloadPlans();
    reloadReminders();
  }, [reloadPersons, reloadPlans, reloadReminders]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    if (!loading) markInteractive();
  }, [loading, markInteractive]);

  const today = todayKey();
  const stats = useMemo(
    () => weekStats(reminders, weekStartKey(today), today),
    [reminders, today],
  );
  const watching = useMemo(
    () => missedStreaks(reminders, WATCH_STREAK),
    [reminders],
  );
  const planCounts = useMemo(() => enabledPlanCounts(plans), [plans]);
  const { self, familyMembers } = useMemo(() => {
    const found = persons.find((p) => p.id === SELF_PERSON_ID);
    return {
      self: found,
      familyMembers: persons.filter((p) => p.id !== SELF_PERSON_ID),
    };
  }, [persons]);

  if (loading) return null;

  return (
    <>
      <Stack.Title large>{t("profile.title")}</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={settingsIcon}
          accessibilityLabel={t("settings.title")}
          onPress={() => router.push("/profile/settings")}
        >
          <Stack.Toolbar.Label>{t("settings.title")}</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <ScreenScaffold>
        {/* 档案横排按设计稿通栏（不跟着其它区块内缩），横向才有完整行程可滑 */}
        <FullBleed>
          <MiniArchive
            entries={[]}
            onSelectEntry={(entry) => {
              router.push({
                pathname: "/(tabs)/medica/detail",
                params: { id: entry.id },
              });
            }}
          />
        </FullBleed>

        <Padded>
          {/* 首屏还在读数据时不给「0% / 0 / 0」的假数字，直接不渲染这一段 */}
          {!loading && <WeekOverview stats={stats} />}

          {/* 「自己」独立于家庭成员：App 的默认用户，不占家庭名额 */}
          {self && !loading ? (
            <SelfSection
              person={self}
              planCount={planCounts.get(self.id) ?? 0}
              tone={memberTone(self.id, planCounts, watching)}
            />
          ) : null}

          <FamilySection
            persons={familyMembers}
            loading={loading}
            planCounts={planCounts}
            watching={watching}
          />
        </Padded>
      </ScreenScaffold>
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
function WeekOverview({ stats }: { stats: WeekStats }) {
  const t = useTranslation();

  return (
    <YStack marginTop="three" gap="two">
      <XStack alignItems="center" gap="two">
        <SectionTitle title={t("profile.weekOverview")} />
        <View flex={1} />
        <Text fontSize={12} fontFamily="mono" color="textSecondary">
          {t("profile.plannedCount", { count: stats.planned })}
        </Text>
      </XStack>
      <XStack gap="cardGap">
        <StatCard
          value={`${stats.adherence}%`}
          label={t("profile.adherence")}
        />
        <StatCard value={String(stats.taken)} label={t("profile.onTime")} />
        <StatCard
          value={String(stats.missed)}
          label={t("profile.missed")}
          valueColor={stats.missed > 0 ? "danger" : undefined}
        />
      </XStack>
    </YStack>
  );
}

function StatCard({
  value,
  label,
  valueColor,
}: {
  value: string;
  label: string;
  valueColor?: string;
}) {
  return (
    <YStack
      flex={1}
      backgroundColor="surface"
      borderWidth={1}
      borderColor="border"
      borderRadius="card"
      borderCurve="continuous"
      paddingBlock="three"
      alignItems="center"
      gap="one"
    >
      <Text
        fontSize={28}
        lineHeight="30px"
        fontWeight="800"
        letterSpacing={-0.84}
        color={valueColor ?? "text"}
        textAlign="center"
      >
        {value}
      </Text>
      <Text
        fontSize={13}
        fontWeight="500"
        color="textSecondary"
        textAlign="center"
      >
        {label}
      </Text>
    </YStack>
  );
}

/**
 * 「自己」区块：App 的默认用户，只有一张卡、没有添加入口。
 */
function SelfSection({
  person,
  planCount,
  tone,
}: {
  person: Person;
  planCount: number;
  tone: MemberTone;
}) {
  const router = useRouter();
  const t = useTranslation();

  return (
    <YStack marginTop="four" gap="two">
      <SectionTitle title={t("profile.selfTitle")} />
      <MemberCard
        person={person}
        planCount={planCount}
        tone={tone}
        onPress={() => {
          router.push({
            pathname: "/(tabs)/profile/person-detail",
            params: { id: person.id },
          });
        }}
      />
    </YStack>
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
  const router = useRouter();
  const t = useTranslation();

  return (
    <YStack marginTop="four" gap="two">
      <XStack alignItems="center" gap="two">
        <SectionTitle title={t("profile.familyTitle")} />
        <View flex={1} />
        <RnRoundIconButton
          testID="profile-add-member-button"
          label={t("profile.addMember")}
          icon={{ ios: "plus", android: "add" }}
          size={36}
          iconSize={18}
          onPress={() => {
            router.push("/(tabs)/profile/persons");
          }}
        />
      </XStack>

      {loading ? null : persons.length === 0 ? (
        <Hint text={t("profile.emptyFamily")} />
      ) : (
        <YStack gap="cardGap">
          {persons.map((person) => (
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
          ))}
        </YStack>
      )}
    </YStack>
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
  const t = useTranslation();

  return (
    <XStack
      testID={`profile-member-${person.id}`}
      onPress={onPress}
      accessibilityRole="button"
      backgroundColor="surface press:backgroundSelected"
      borderWidth={1}
      borderColor="border"
      borderRadius="card"
      borderCurve="continuous"
      paddingInline="screen"
      paddingBlock="three"
      alignItems="center"
      gap="three"
    >
      <AvatarMark
        color={person.avatarColor}
        name={person.name}
        uri={person.avatarUri}
        size={44}
      />
      <YStack flex={1} minWidth={0}>
        <Text numberOfLines={1} fontSize={17} fontWeight="700" color="text">
          {person.name}
        </Text>
        <Text
          numberOfLines={1}
          fontSize={13}
          color="textSecondary"
          marginTop={2}
        >
          {t("person.planCount", { count: planCount })}
        </Text>
      </YStack>
      <MemberBadge tone={tone} />
    </XStack>
  );
}

function MemberBadge({ tone }: { tone: MemberTone }) {
  const theme = useTheme();
  const t = useTranslation();

  // 徽章底色是主题色掺白（算出来的值，不是 token），前景取对应的 *Strong 深色档
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
  ).toUpperCase();

  return (
    <View
      height={24}
      paddingInline="rowGap"
      borderRadius="pill"
      backgroundColor={withAlpha(toneStyle.background, 0.12)}
      alignItems="center"
      justifyContent="center"
    >
      <Text
        fontFamily="mono"
        fontSize={11}
        fontWeight="700"
        letterSpacing={0.44}
        color={toneStyle.foreground}
        textAlign="center"
      >
        {label}
      </Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text fontSize={17} fontWeight="700" color="text">
      {title}
    </Text>
  );
}

/** 区块下的居中说明文字（档案为空 / 还没有成员） */
function Hint({ text }: { text: string }) {
  return (
    <YStack alignItems="center" paddingBlock="three">
      <Text fontSize={13} color="textSecondary" textAlign="center">
        {text}
      </Text>
    </YStack>
  );
}
