import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { AvatarMark } from "@/components/avatar";
import { GlassHostButton } from "@/components/glass-host-button";
import { ProgressBarRn } from "@/components/progress-bar";
import { InputShell } from "@/components/rn-input-shell";
import {
  HairLine,
  InfoRow,
  SectionCard,
  SectionTitle,
} from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { SymbolIcon, type SymbolIconName } from "@/components/symbol-icon";
import { editIcon } from "@/components/toolbar-icons";
import { BottomTabInset, Radius, Spacing } from "@/constants/theme";
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
  type StockLevel,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

/** 药品缩略图边长，与药品库列表卡一致 */
const THUMB_SIZE = 52;

/**
 * 药品详情：库存概览 → 基础信息 → 数字孪生 → 用药配置 → 补货 → 操作。
 *
 * 补货按钮保留系统玻璃（iOS `.glass`，Android 实心），其余主按钮改 RN Pressable。
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
      <View style={{ flex: 1, backgroundColor: theme.canvas }}>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>{t("common.loading")}</Stack.Title>
      </View>
    );
  }

  if (!medication) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas }}>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>{t("medication.notFound")}</Stack.Title>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 120,
          }}
        >
          <Text style={{ color: theme.textSecondary, fontSize: 15 }}>
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
        <View style={{ gap: Spacing.four }}>
          <StockOverview medication={medication} summary={summary} />

          <SectionTitle>{t("medication.sectionBasic")}</SectionTitle>
          <BasicInfo
            medication={medication}
            summary={summary}
            language={language}
          />

          {medication.type === "blister" ? (
            <>
              <SectionTitle>{t("medication.twinSection")}</SectionTitle>
              <TwinEntry
                medication={medication}
                enabled={twin.enabled}
                openSeq={twin.openPack?.seq ?? null}
                full={twin.fullSlots}
                total={twin.totalSlots}
              />
            </>
          ) : null}

          <SectionTitle>{t("plan.title")}</SectionTitle>
          <PlanSection
            plans={relatedPlans}
            persons={persons}
            medication={medication}
          />

          <SectionTitle>{t("medication.restock")}</SectionTitle>
          {twin.enabled ? (
            <SectionCard>
              <View style={{ gap: Spacing.three, padding: Spacing.three }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Spacing.rowGap,
                  }}
                >
                  <View style={{ flex: 1 }}>
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
                        style={{ fontSize: 15, color: theme.text, padding: 0 }}
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
                </View>
                {restockError ? (
                  <Text style={{ fontSize: 13, color: theme.danger }}>
                    {t("medication.restockInvalid")}
                  </Text>
                ) : null}
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    lineHeight: 18,
                  }}
                >
                  {t("medication.restockPacksHint", {
                    perPack: twin.slotsPerPack,
                    unit: medicationUnitLabel(medication.unit, t),
                  })}
                </Text>
              </View>
            </SectionCard>
          ) : (
            <SectionCard>
              <View style={{ gap: Spacing.three, padding: Spacing.three }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Spacing.rowGap,
                  }}
                >
                  <View style={{ flex: 1 }}>
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
                        style={{ fontSize: 15, color: theme.text, padding: 0 }}
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
                </View>
                {restockError ? (
                  <Text style={{ fontSize: 13, color: theme.danger }}>
                    {t("medication.restockInvalid")}
                  </Text>
                ) : null}
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    lineHeight: 18,
                  }}
                >
                  {t("medication.restockHint")}
                </Text>
              </View>
            </SectionCard>
          )}

          <View style={{ gap: Spacing.three, marginTop: Spacing.three }}>
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
              labelColor={theme.danger}
            />
            <View
              style={{
                alignItems: "center",
                paddingVertical: Spacing.two,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
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
    <Pressable
      testID="medication-twin-entry"
      onPress={() => {
        router.push({
          pathname: "/(tabs)/medica/twin",
          params: { id: medication.id },
        });
      }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.backgroundSelected : theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: Radius.card,
        borderCurve: "continuous",
        padding: Spacing.three,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.rowGap,
        }}
      >
        <SymbolIcon
          name={{ ios: "square.grid.2x2", android: "grid_view" }}
          size={22}
          color={theme.primary}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontSize: 16, fontWeight: "600", color: theme.text }}
          >
            {enabled ? t("medication.twinEntry") : t("medication.twinEnable")}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 13, color: theme.textSecondary }}
          >
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
        </View>
        <SymbolIcon
          name="chevron.right"
          size={14}
          color={theme.textSecondary}
        />
      </View>
    </Pressable>
  );
}

/**
 * 库存概览：这一屏的主角。
 *
 * 数字用 32pt/800 而不是把「剩余」也写成一个标签 —— 剩余量与总量在同一行里
 * 读得出来，多一个标签只是多一行噪音。档位由左侧色条、进度条颜色、状态胶囊
 * 三处共同承担（同药品库列表卡）。
 */
function StockOverview({
  medication,
  summary,
}: {
  medication: Medication;
  summary: ReturnType<typeof stockSummary>;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const level = stockLevel(medication);
  const color = useStockColors(level);
  const unit = medicationUnitLabel(medication.unit, t);
  const percent =
    medication.totalQuantity > 0
      ? medication.remainingQuantity / medication.totalQuantity
      : 0;
  const spineHeight = THUMB_SIZE + Spacing.three * 2;

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: theme.surface,
        borderRadius: Radius.card,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: theme.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: 6,
          height: spineHeight,
          backgroundColor: color.strong,
        }}
      />
      <View style={{ flex: 1, padding: Spacing.three, gap: Spacing.three }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.rowGap,
          }}
        >
          <Thumb />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 17, fontWeight: "700", color: theme.text }}
            >
              {medication.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{ fontSize: 13, color: theme.textSecondary }}
            >
              {t("medication.metaLine", {
                type: medicationTypeLabel(medication.type, t),
                category: medicationCategoryLabel(medication.category, t),
              })}
            </Text>
          </View>
          <StockStatusPill level={level} />
        </View>

        {level === "unset" ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.two,
            }}
          >
            <SymbolIcon
              name={{ ios: "minus", android: "remove" }}
              size={15}
              color={theme.textSecondary}
            />
            <Text style={{ fontSize: 14, color: theme.textSecondary }}>
              {t("medication.stockUnsetHint")}
            </Text>
          </View>
        ) : (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                gap: Spacing.two,
              }}
            >
              <Text
                style={{
                  fontFamily: "system-ui",
                  fontSize: 32,
                  lineHeight: 34,
                  fontWeight: "800",
                  letterSpacing: -0.96,
                  color: theme.text,
                }}
              >
                {String(medication.remainingQuantity)}
              </Text>
              <Text style={{ fontSize: 15, color: theme.textSecondary }}>
                {`/ ${medication.totalQuantity} ${unit}`}
              </Text>
            </View>

            <ProgressBarRn
              percent={percent}
              color={color.strong}
              track={theme.backgroundSelected}
              height={8}
            />
          </>
        )}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.two,
          }}
        >
          <SymbolIcon
            name="clock"
            size={13}
            color={summary.low ? theme.danger : theme.textSecondary}
          />
          <Text
            style={{
              fontSize: 13,
              color: summary.low ? theme.danger : theme.textSecondary,
            }}
          >
            {summary.daysLeft !== null
              ? summary.low
                ? t("medication.daysLeftHintLow", { days: summary.daysLeft })
                : t("medication.daysLeftHint", { days: summary.daysLeft })
              : t("medication.noEstimate")}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** 缩略图：与药品库列表卡同一个药丸图标 + primarySoft 底 */
function Thumb() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: theme.primarySoft,
        borderWidth: 1,
        borderColor: theme.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SymbolIcon name="pills" size={24} color={theme.primary} />
    </View>
  );
}

/**
 * 状态胶囊：只有档位词（充足 / 偏低 / 告急），不带数量 —— 数量就在下面的
 * 大数字里，再抄一遍是冗余。两字标签也保证胶囊够窄，不会挤掉药名。
 */
function StockStatusPill({ level }: { level: StockLevel }) {
  const t = useTranslation();
  const color = useStockColors(level);

  return (
    <View
      style={{
        height: 24,
        paddingHorizontal: Spacing.rowGap,
        borderRadius: Radius.pill,
        backgroundColor: withAlpha(color.base, 0.12),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SymbolIcon name={STOCK_ICON[level]} size={13} color={color.strong} />
      <Text
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.44,
          color: color.strong,
          textAlign: "center",
        }}
      >
        {planStatusLabel({ active: level !== "unset" } as any, t).toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * 基础信息：标签 / 值行，未填写的字段不占位（规格、备注可空）。
 * 有效期是例外：没记也要显示「未设置」—— 过期药吃下去比空一行糟得多。
 */
function BasicInfo({
  medication,
  summary,
  language,
}: {
  medication: Medication;
  summary: ReturnType<typeof stockSummary>;
  language: string;
}) {
  const t = useTranslation();
  const theme = useTheme();
  const unit = medicationUnitLabel(medication.unit, t);
  const expired =
    medication.expiryDate !== null && medication.expiryDate < todayKey();

  const rows: { label: string; value: string; valueColor?: string }[] = [
    {
      label: t("medication.type"),
      value: medicationTypeLabel(medication.type, t),
    },
    {
      label: t("medication.categoryField"),
      value: medicationCategoryLabel(medication.category, t),
    },
  ];
  if (medication.specification) {
    rows.push({
      label: t("medication.specification"),
      value: medication.specification,
    });
  }
  rows.push({ label: t("medication.unit"), value: unit });
  if (summary.dailyDose > 0) {
    rows.push({
      label: t("medication.dailyDose"),
      value: t("medication.amountWithUnit", {
        amount: summary.dailyDose,
        unit,
      }),
    });
  }
  rows.push({
    label: t("medication.prescription"),
    value: medication.prescription
      ? t("medication.prescriptionYes")
      : t("medication.prescriptionNo"),
    valueColor: medication.prescription ? theme.warningStrong : undefined,
  });
  rows.push({
    label: t("medication.expiryDate"),
    value: medication.expiryDate
      ? expired
        ? `${formatDateKey(medication.expiryDate, language)} · ${t("medication.expired")}`
        : formatDateKey(medication.expiryDate, language)
      : t("medication.expiryUnset"),
    valueColor: expired ? theme.danger : undefined,
  });

  return (
    <SectionCard>
      {rows.map((row, index) => (
        <View key={row.label}>
          {index > 0 ? <HairLine /> : null}
          <InfoRow
            label={row.label}
            value={row.value}
            valueColor={row.valueColor}
          />
        </View>
      ))}
      {medication.notes ? (
        <>
          <HairLine />
          <View
            style={{
              paddingHorizontal: Spacing.three,
              paddingVertical: Spacing.rowGap,
              gap: Spacing.two,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: theme.textSecondary,
              }}
            >
              {t("medication.notes")}
            </Text>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 21,
                color: theme.text,
              }}
            >
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
  const theme = useTheme();
  const router = useRouter();
  const unit = medicationUnitLabel(medication.unit, t);

  if (plans.length === 0) {
    return (
      <SectionCard>
        <View
          style={{
            alignItems: "center",
            padding: Spacing.three,
            gap: Spacing.two,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: theme.textSecondary,
              textAlign: "center",
            }}
          >
            {t("medication.noTakers")}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: theme.textSecondary,
              textAlign: "center",
            }}
          >
            {t("medication.noTakersHint")}
          </Text>
        </View>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      {plans.map((plan, index) => {
        const person = persons.find((p) => p.id === plan.personId);
        return (
          <View key={plan.id}>
            {index > 0 ? <HairLine /> : null}
            <Pressable
              testID={`medication-plan-${plan.id}`}
              onPress={() => {
                router.push({
                  pathname: "/(tabs)/profile/person-detail",
                  params: { id: plan.personId },
                });
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: Spacing.rowGap,
                paddingHorizontal: Spacing.three,
                paddingVertical: Spacing.two,
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : "transparent",
              })}
            >
              <AvatarMark
                color={person?.avatarColor ?? theme.primary}
                name={person?.name ?? t("common.unknown")}
                uri={person?.avatarUri}
                size={36}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 16, fontWeight: "600", color: theme.text }}
                >
                  {person?.name ?? t("common.unknown")}
                </Text>
                <Text
                  numberOfLines={2}
                  style={{
                    fontSize: 13,
                    color: theme.textSecondary,
                    lineHeight: 18,
                  }}
                >
                  {t("medication.doseLine", { amount: plan.doseAmount, unit })}
                  {`\n${t("plan.perDay", { count: plan.times.length })} · ${plan.times.join(" / ")}`}
                </Text>
              </View>
              <PlanStatusPill plan={plan} />
            </Pressable>
          </View>
        );
      })}
    </SectionCard>
  );
}

/** 用药配置状态胶囊：服用中 / 已停用 / 已结束。停用与结束都不染色 */
function PlanStatusPill({ plan }: { plan: MedicationPlan }) {
  const t = useTranslation();
  const theme = useTheme();
  const active = planActiveOnDate(plan, todayKey());
  const tone = active ? theme.success : theme.textSecondary;
  const foreground = active ? theme.successStrong : theme.textSecondary;

  return (
    <View
      style={{
        height: 24,
        paddingHorizontal: Spacing.rowGap,
        borderRadius: Radius.pill,
        backgroundColor: withAlpha(tone, 0.12),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: "monospace",
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.44,
          color: foreground,
          textAlign: "center",
        }}
      >
        {planStatusLabel(plan, t).toUpperCase()}
      </Text>
    </View>
  );
}

/** 库存档位 → 语义色。`base` 做 12% 淡底（胶囊），`strong` 做文字与色条 */
function useStockColors(level: StockLevel): { base: string; strong: string } {
  const theme = useTheme();
  if (level === "critical") {
    return { base: theme.danger, strong: theme.dangerStrong };
  }
  if (level === "low") {
    return { base: theme.warning, strong: theme.warningStrong };
  }
  if (level === "unset") {
    return { base: theme.textSecondary, strong: theme.textSecondary };
  }
  return { base: theme.success, strong: theme.successStrong };
}

const STOCK_ICON: Record<StockLevel, SymbolIconName> = {
  ok: { ios: "checkmark.circle.fill", android: "check_circle" },
  low: { ios: "exclamationmark.triangle.fill", android: "warning" },
  critical: { ios: "exclamationmark.octagon.fill", android: "error" },
  unset: { ios: "minus.circle.fill", android: "do_not_disturb_on" },
};

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
