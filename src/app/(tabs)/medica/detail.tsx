import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";
import { TextInput } from "react-native";
import { Text, View, XStack, YStack } from "tamagui";

import { AvatarMark } from "@/components/avatar";
import { GlassHostButton } from "@/components/glass-host-button";
import { SYMBOL_ICONS } from "@/components/icons";
import { InputShell } from "@/components/rn-input-shell";
import {
  HairLine,
  SectionCard,
  SectionTitle,
} from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { SymbolIcon, type SymbolIconName } from "@/components/symbol-icon";
import { editIcon } from "@/components/toolbar-icons";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, useTranslation } from "@/i18n";
import {
  appendBlisterPacks,
  blisterSummary,
  deleteMedication,
  medicationCategoryLabel,
  medicationTypeLabel,
  medicationUnitLabel,
  planActiveOnDate,
  planStatusLabel,
  restockMedication,
  stockLevel,
  stockSummary,
  todayKey,
  useMedication,
  usePersons,
  usePacksForMedication,
  usePlansForMedication,
  useSlotsForMedication,
  type Medication,
  type MedicationPlan,
  type Person,
} from "@/lib/store";

/**
 * 药品详情：库存摘要 → 基础信息 → 数字孪生 → 用药配置 → 补货 → 操作。
 *
 * 全屏同一套语言：canvas 底 + outline 白卡分组 + 发丝线，行首语义图标 +
 * 标签 / 值，与药品库列表、设置页同构。库存档位只由值的颜色承担，不做
 * 大数字、进度条、状态胶囊那套 dashboard 装饰（ui-design.md 反模式表）。
 *
 * 补货 / 添加配置 / 删除按钮保留系统玻璃（`GlassHostButton`：iOS `.glass`，
 * Android 实心），内容树与按压反馈走 Tamagui 原语 + token。
 */
export default function MedicationDetailScreen() {
  const router = useRouter();
  const t = useTranslation();
  const theme = useTheme();
  const { language } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    data: medication,
    loading: medicationLoading,
    reload: reloadMedication,
  } = useMedication(id);
  const {
    data: plans,
    loading: plansLoading,
    reload: reloadPlans,
  } = usePlansForMedication(id);
  const {
    data: packs,
    loading: packsLoading,
    reload: reloadPacks,
  } = usePacksForMedication(id);
  const {
    data: blisterSlots,
    loading: slotsLoading,
    reload: reloadSlots,
  } = useSlotsForMedication(id);
  const {
    data: persons,
    loading: personsLoading,
    reload: reloadPersons,
  } = usePersons();
  const loading =
    medicationLoading ||
    plansLoading ||
    packsLoading ||
    slotsLoading ||
    personsLoading;
  const reload = useCallback(() => {
    reloadMedication();
    reloadPlans();
    reloadPacks();
    reloadSlots();
    reloadPersons();
  }, [reloadMedication, reloadPlans, reloadPacks, reloadSlots, reloadPersons]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [restockError, setRestockError] = useState(false);
  const [restockAmount, setRestockAmount] = useState("");
  const [restockPackCount, setRestockPackCount] = useState("");

  useFocusEffect(
    useCallback(() => {
      reload();
      setConfirmDelete(false);
    }, [reload]),
  );

  if (loading) {
    return (
      <View flex={1} backgroundColor="$canvas">
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>{t("common.loading")}</Stack.Title>
      </View>
    );
  }

  if (!medication) {
    return (
      <View flex={1} backgroundColor="$canvas">
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>{t("medication.notFound")}</Stack.Title>
        <View
          flex={1}
          alignItems="center"
          justifyContent="center"
          paddingTop={120}
        >
          <Text color="$textSecondary" fontSize={15}>
            {t("medication.notFound")}
          </Text>
        </View>
      </View>
    );
  }

  const summary = stockSummary(medication, plans);
  const relatedPlans = plans;
  const twin = blisterSummary(medication, packs, blisterSlots);

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteMedication(medication.id);
    router.back();
  };

  const restock = async () => {
    const amount = Number.parseInt(restockAmount, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRestockError(true);
      return;
    }
    await restockMedication(medication.id, amount);
    setRestockAmount("");
    setRestockError(false);
    await reload();
  };

  const restockPacks = async () => {
    const count = Number.parseInt(restockPackCount, 10);
    if (!Number.isFinite(count) || count <= 0) {
      setRestockError(true);
      return;
    }
    await appendBlisterPacks(medication.id, count);
    setRestockPackCount("");
    setRestockError(false);
    await reload();
  };

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={editIcon}
          accessibilityLabel={t("common.edit")}
          onPress={() => {
            router.push({ pathname: "/(tabs)/medica/form", params: { id } });
          }}
        >
          <Stack.Toolbar.Label>{t("common.edit")}</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Title large>{medication.name}</Stack.Title>

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        {/* 区块之间 16（gap）+ 标题 paddingTop 8 = 标题距上一区块 24，
        标题距自己的卡 8 —— iOS 分组列表的「header 贴组」节奏 */}
        <View gap="three">
          <StockSummaryCard medication={medication} summary={summary} />

          {/* 标题与各自的卡包成一层：外层 gap 只作用于区块之间，
          标题到卡片只剩 SectionTitle 自己的 8px（同设置屏的结构） */}
          <View>
            <SectionTitle>{t("medication.sectionBasic")}</SectionTitle>
            <BasicInfo medication={medication} language={language} />
          </View>

          {medication.type === "blister" ? (
            <View>
              <SectionTitle>{t("medication.twinSection")}</SectionTitle>
              <TwinEntry
                medication={medication}
                enabled={twin.enabled}
                openSeq={twin.openPack?.seq ?? null}
                full={twin.fullSlots}
                total={twin.totalSlots}
              />
            </View>
          ) : null}

          <View>
            <SectionTitle>{t("plan.title")}</SectionTitle>
            <PlanSection
              plans={relatedPlans}
              persons={persons}
              medication={medication}
            />
          </View>

          <View>
            <SectionTitle>{t("medication.restock")}</SectionTitle>
            {twin.enabled ? (
              <SectionCard tone="outline">
                <View gap="three" padding="three">
                  <XStack alignItems="center" gap="rowGap">
                    <View flex={1}>
                      <InputShell>
                        <TextInput
                          testID="restock-packs-input"
                          placeholder={t("medication.restockPacksPlaceholder")}
                          keyboardType="number-pad"
                          onChangeText={(text) => {
                            setRestockPackCount(text);
                            setRestockError(false);
                          }}
                          value={restockPackCount}
                          style={{
                            fontSize: 15,
                            color: theme.text,
                            padding: 0,
                          }}
                        />
                      </InputShell>
                    </View>
                    <GlassHostButton
                      testID="restock-packs-submit-button"
                      label={t("medication.restockPacksSubmit")}
                      onPress={() => {
                        void restockPacks();
                      }}
                    />
                  </XStack>
                  {restockError ? (
                    <Text fontSize={13} color="$danger">
                      {t("medication.restockInvalid")}
                    </Text>
                  ) : null}
                  <Text fontSize={12} color="$textSecondary" lineHeight={18}>
                    {t("medication.restockPacksHint", {
                      perPack: twin.slotsPerPack,
                      unit: medicationUnitLabel(medication.unit, t),
                    })}
                  </Text>
                </View>
              </SectionCard>
            ) : (
              <SectionCard tone="outline">
                <View gap="three" padding="three">
                  <XStack alignItems="center" gap="rowGap">
                    <View flex={1}>
                      <InputShell>
                        <TextInput
                          testID="restock-amount-input"
                          placeholder={t("medication.restockPlaceholder")}
                          keyboardType="number-pad"
                          onChangeText={(text) => {
                            setRestockAmount(text);
                            setRestockError(false);
                          }}
                          value={restockAmount}
                          style={{
                            fontSize: 15,
                            color: theme.text,
                            padding: 0,
                          }}
                        />
                      </InputShell>
                    </View>
                    <GlassHostButton
                      testID="restock-submit-button"
                      label={t("medication.restockSubmit")}
                      onPress={() => {
                        void restock();
                      }}
                      tintColor={theme.primary}
                    />
                  </XStack>
                  {restockError ? (
                    <Text fontSize={13} color="$danger">
                      {t("medication.restockInvalid")}
                    </Text>
                  ) : null}
                  <Text fontSize={12} color="$textSecondary" lineHeight={18}>
                    {t("medication.restockHint")}
                  </Text>
                </View>
              </SectionCard>
            )}
          </View>

          <View gap="three" marginTop="three">
            <GlassHostButton
              testID="medication-add-plan-button"
              label={t("plan.formTitle")}
              tintColor={theme.primary}
              onPress={() => {
                router.push({
                  pathname: "/(tabs)/profile/plan-form",
                  params: { medicationId: medication.id },
                });
              }}
            />
            <GlassHostButton
              testID="medication-delete-button"
              label={
                confirmDelete
                  ? t("medication.deleteConfirmButton")
                  : t("medication.deleteButton")
              }
              onPress={() => {
                void remove();
              }}
              labelColor="$danger"
            />
            <View alignItems="center" paddingBlock="two">
              <Text fontSize={12} textAlign="center">
                {t("medication.deleteHint")}
              </Text>
            </View>
          </View>
        </View>
      </ScreenScaffold>
    </>
  );
}

/**
 * 数字孪生入口：已建板 → 进度卡，点进孪生页；未建板 → 引导卡（孪生页承载
 * 开启表单）。板装药独有，瓶装/散装不渲染这一区块。
 */
function TwinEntry({
  medication,
  enabled,
  openSeq,
  full,
  total,
}: {
  medication: Medication;
  enabled: boolean;
  openSeq: number | null;
  full: number;
  total: number;
}) {
  const t = useTranslation();
  const theme = useTheme();
  const router = useRouter();

  return (
    <View
      testID="medication-twin-entry"
      onPress={() => {
        router.push({
          pathname: "/(tabs)/medica/twin",
          params: { id: medication.id },
        });
      }}
      accessibilityRole="button"
      backgroundColor="$surface press:$backgroundSelected"
      borderWidth={1}
      borderColor="$border"
      borderRadius="card"
      borderCurve="continuous"
      padding="three"
    >
      <XStack alignItems="center" gap="rowGap">
        <SymbolIcon
          name={{ ios: "square.grid.2x2", android: "grid_view" }}
          size={22}
          color={theme.primary}
        />
        <YStack flex={1} minWidth={0}>
          <Text numberOfLines={1} fontSize={16} fontWeight="600" color="$text">
            {enabled ? t("medication.twinEntry") : t("medication.twinEnable")}
          </Text>
          <Text numberOfLines={1} fontSize={13} color="$textSecondary">
            {enabled
              ? openSeq !== null
                ? t("medication.twinProgressOpen", {
                    seq: openSeq,
                    full,
                    total,
                  })
                : t("medication.twinProgressDone")
              : t("medication.twinEnableHint")}
          </Text>
        </YStack>
        <SymbolIcon
          name="chevron.right"
          size={14}
          color={theme.textSecondary}
        />
      </XStack>
    </View>
  );
}

/**
 * 库存摘要：详情页的第一组、这屏的主角 —— 但主角感靠排位与字阶，不靠装饰。
 * 剩余 / 日均 / 约还能吃三行分组列表，档位只由值的颜色承担（告急染 danger），
 * 没有色条、大数字、进度条与状态胶囊：那套是 dashboard 审美，与分组列表的
 * 语言不搭（ui-design.md「原生感反模式」表的 Everything's a Card 同源问题）。
 */
function StockSummaryCard({
  medication,
  summary,
}: {
  medication: Medication;
  summary: ReturnType<typeof stockSummary>;
}) {
  const t = useTranslation();
  const level = stockLevel(medication);
  const unit = medicationUnitLabel(medication.unit, t);

  // 从没记过库存：不显示 0/0，一行提示说清补记后才会自动扣减
  if (level === "unset") {
    return (
      <SectionCard tone="outline">
        <View padding="three">
          <Text fontSize={14} color="$textSecondary">
            {t("medication.stockUnsetHint")}
          </Text>
        </View>
      </SectionCard>
    );
  }

  return (
    <SectionCard tone="outline">
      <FieldRow
        icon={SYMBOL_ICONS.stockBox}
        label={t("medication.remaining")}
        value={`${medication.remainingQuantity} / ${medication.totalQuantity} ${unit}`}
        emphasis
      />
      <HairLine />
      <FieldRow
        icon={SYMBOL_ICONS.dailyBolt}
        label={t("medication.dailyDose")}
        value={`${summary.dailyDose} ${unit}`}
      />
      <HairLine />
      <FieldRow
        icon={SYMBOL_ICONS.daysClock}
        label={t("medication.daysLeft")}
        value={
          summary.daysLeft !== null
            ? t("medication.daysValue", { days: summary.daysLeft })
            : t("medication.estimateUnknown")
        }
        valueColor={summary.low ? "$dangerStrong" : undefined}
      />
    </SectionCard>
  );
}

/**
 * 详情页字段行：行首语义图标（速记这一行的类别，不承载状态）+ 标签 + 值。
 * `emphasis` 给组内主角行（库存剩余），值升为主文本色 + 600 字重；
 * 值列一律等宽数字，多行纵向扫读不错行。
 */
function FieldRow({
  icon,
  label,
  value,
  emphasis = false,
  valueColor,
}: {
  icon?: SymbolIconName;
  label: string;
  value: string;
  emphasis?: boolean;
  valueColor?: string;
}) {
  const theme = useTheme();

  return (
    <XStack
      alignItems="center"
      gap="rowGap"
      paddingInline="three"
      paddingBlock="rowGap"
    >
      {icon ? (
        <SymbolIcon size={18} color={theme.textSecondary} name={icon} />
      ) : null}
      <Text flex={1} fontSize={15} color="$text">
        {label}
      </Text>
      <Text
        numberOfLines={2}
        flex={1}
        fontSize={15}
        fontWeight={emphasis ? "600" : "400"}
        color={valueColor ?? (emphasis ? "$text" : "$textSecondary")}
        textAlign="right"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </XStack>
  );
}

/**
 * 基础信息：类型 / 用途 / 规格 / 处方 / 有效期，未填写的字段不占位。
 * 单位与日均消耗属于库存语义，在头部库存摘要组，不在这里重复。
 * 有效期是例外：没记也要显示「未设置」—— 过期药吃下去比空一行糟得多。
 */
function BasicInfo({
  medication,
  language,
}: {
  medication: Medication;
  language: string;
}) {
  const t = useTranslation();
  const expired =
    medication.expiryDate !== null && medication.expiryDate < todayKey();

  const rows: {
    icon: SymbolIconName;
    label: string;
    value: string;
    valueColor?: string;
  }[] = [
    {
      icon: SYMBOL_ICONS.pillsRail,
      label: t("medication.type"),
      value: medicationTypeLabel(medication.type, t),
    },
    {
      icon: SYMBOL_ICONS.categoryTag,
      label: t("medication.categoryField"),
      value: medicationCategoryLabel(medication.category, t),
    },
  ];
  if (medication.specification) {
    rows.push({
      icon: SYMBOL_ICONS.specRuler,
      label: t("medication.specification"),
      value: medication.specification,
    });
  }
  rows.push({
    icon: SYMBOL_ICONS.prescriptionDoc,
    label: t("medication.prescription"),
    value: medication.prescription
      ? t("medication.prescriptionYes")
      : t("medication.prescriptionNo"),
    valueColor: medication.prescription ? "$warningStrong" : undefined,
  });
  rows.push({
    icon: SYMBOL_ICONS.calendar,
    label: t("medication.expiryDate"),
    value: medication.expiryDate
      ? expired
        ? `${formatDateKey(medication.expiryDate, language)} · ${t("medication.expired")}`
        : formatDateKey(medication.expiryDate, language)
      : t("medication.expiryUnset"),
    valueColor: expired ? "$dangerStrong" : undefined,
  });

  return (
    <SectionCard tone="outline">
      {rows.map((row, index) => (
        <View key={row.label}>
          {index > 0 ? <HairLine /> : null}
          <FieldRow
            icon={row.icon}
            label={row.label}
            value={row.value}
            valueColor={row.valueColor}
          />
        </View>
      ))}
      {medication.notes ? (
        <>
          <HairLine />
          <View paddingInline="three" paddingBlock="rowGap" gap="two">
            <Text fontSize={13} fontWeight="600" color="$textSecondary">
              {t("medication.notes")}
            </Text>
            <Text fontSize={15} lineHeight={21} color="$text">
              {medication.notes}
            </Text>
          </View>
        </>
      ) : null}
    </SectionCard>
  );
}

/** 用药配置：谁在什么时间吃这一款药。行点击进用药人详情 */
function PlanSection({
  plans,
  persons,
  medication,
}: {
  plans: MedicationPlan[];
  persons: Person[];
  medication: Medication;
}) {
  const t = useTranslation();
  const router = useRouter();
  const unit = medicationUnitLabel(medication.unit, t);

  if (plans.length === 0) {
    return (
      <SectionCard tone="outline">
        <View alignItems="center" padding="three" gap="two">
          <Text fontSize={13} color="$textSecondary" textAlign="center">
            {t("medication.noTakers")}
          </Text>
          <Text fontSize={12} color="$textSecondary" textAlign="center">
            {t("medication.noTakersHint")}
          </Text>
        </View>
      </SectionCard>
    );
  }

  return (
    <SectionCard tone="outline">
      {plans.map((plan, index) => {
        const person = persons.find((p) => p.id === plan.personId);
        return (
          <View key={plan.id}>
            {index > 0 ? <HairLine /> : null}
            <XStack
              testID={`medication-plan-${plan.id}`}
              onPress={() => {
                router.push({
                  pathname: "/(tabs)/profile/person-detail",
                  params: { id: plan.personId },
                });
              }}
              accessibilityRole="button"
              alignItems="center"
              gap="rowGap"
              paddingInline="three"
              paddingBlock="rowGap"
              backgroundColor="transparent press:$backgroundSelected"
            >
              <AvatarMark
                color={person?.avatarColor ?? "$primary"}
                name={person?.name ?? t("common.unknown")}
                uri={person?.avatarUri}
                size={36}
              />
              <YStack flex={1} minWidth={0}>
                <Text
                  numberOfLines={1}
                  fontSize={16}
                  fontWeight="600"
                  color="$text"
                >
                  {person?.name ?? t("common.unknown")}
                </Text>
                <Text
                  numberOfLines={2}
                  fontSize={13}
                  color="$textSecondary"
                  lineHeight={18}
                >
                  {t("medication.doseLine", { amount: plan.doseAmount, unit })}
                  {`\n${t("plan.perDay", { count: plan.times.length })} · ${plan.times.join(" / ")}`}
                </Text>
              </YStack>
              <PlanStatusText plan={plan} />
            </XStack>
          </View>
        );
      })}
    </SectionCard>
  );
}

/** 用药配置状态：服用中 / 已停用 / 已结束。只用文字色区分，不做胶囊 */
function PlanStatusText({ plan }: { plan: MedicationPlan }) {
  const t = useTranslation();
  const active = planActiveOnDate(plan, todayKey());

  return (
    <Text fontSize={13} color={active ? "$successStrong" : "$textSecondary"}>
      {planStatusLabel(plan, t)}
    </Text>
  );
}

/** 日期键转本地化日期：中文「2026年10月1日」，英文走 Intl 的 "Oct 1, 2026" */
function formatDateKey(key: string, language: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return formatDate(new Date(year, month - 1, day), language);
}

function formatDate(date: Date, language: string): string {
  try {
    return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: language === "zh" ? "numeric" : "short",
      day: "numeric",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
