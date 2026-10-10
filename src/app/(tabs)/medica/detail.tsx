import {
  Button,
  Column,
  Host,
  Icon,
  ListItem,
  Row,
  ScrollView,
  Spacer,
  Text,
  TextInput,
  useNativeState,
  type IconName,
} from "@expo/ui";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";

import { AvatarMark } from "@/components/avatar";
import { InputShell } from "@/components/input-shell";
import {
  nativeButtonModifiers,
  nativeLayout,
} from "@/components/native-layout";
import { ProgressBar } from "@/components/progress-bar";
import { roundedBox } from "@/components/rounded-box";
import {
  HairLine,
  InfoRow,
  SectionCard,
  SectionTitle,
} from "@/components/section-card";
import { BottomTabInset, Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, useTranslation, type Language, type Path } from "@/i18n";
import {
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
  useAppData,
  type Medication,
  type MedicationPlan,
  type Person,
  type StockLevel,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

/** 药品缩略图边长，与药品库列表卡一致（design/medications.html 的 .med-thumb 52px） */
const THUMB_SIZE = 52;

/** 左侧状态色条高度：跟着缩略图与卡片内边距走，同药品库列表卡 */
const SPINE_HEIGHT = THUMB_SIZE + Spacing.three * 2;

/**
 * 药品详情：库存概览 → 基础信息 → 用药配置 → 补货 → 操作。
 *
 * 整屏是 Expo UI（`Host` + 原生 `ScrollView`），没有 RN island（进度条走
 * `ProgressBar` 那一小块 `RNHostView`）。视觉上接着药品库列表卡往下说：左侧
 * 6pt 状态色条、缩略图、状态胶囊都是同一套语言，从列表点进来时是同一条线索。
 *
 * 布局上两条既有结论在这里继续生效：
 *   1. 原生 `ScrollView` 的直接子元素之间会插入约 56pt 的固定间距（profile
 *      真机实测），所以所有区块必须收进**同一个** `Column`，区块间距由各区块
 *      自己的 padding 与 `SectionTitle` 的 paddingTop 精确控制；
 *   2. `FieldGroup` / `List` 在 iOS 上是 SwiftUI Form / List，本身是滚动容器，
 *      嵌进外层 `ScrollView` 会塌成零高 —— 分组一律用 `SectionCard` 拼普通行。
 */
export default function MedicationDetailScreen() {
  const router = useRouter();
  const t = useTranslation();
  const theme = useTheme();
  const { language } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { medications, persons, plans, loading, reload } = useAppData();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [restockError, setRestockError] = useState(false);
  const restockAmount = useNativeState("");

  useFocusEffect(
    useCallback(() => {
      reload();
      setConfirmDelete(false);
    }, [reload]),
  );

  // 首屏还在读 SQLite：此时 medications 是空的，直接渲染会闪一下「药品不存在」
  if (loading) {
    return (
      <>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Host style={{ flex: 1 }} />
      </>
    );
  }

  const medication = medications.find((m) => m.id === id);

  if (!medication) {
    return (
      <>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Host style={{ flex: 1 }}>
          {/* 同药品库空态：VStack 按内容收缩贴 leading，单靠 alignment="center"
              只会让文案停在左上角。用 HStack + 左右弹性 Spacer 压到中线 */}
          <Row alignment="center" style={{ paddingTop: 120 }}>
            <Spacer flexible />
            <Text textStyle={{ color: theme.textSecondary }}>
              {t("medication.notFound")}
            </Text>
            <Spacer flexible />
          </Row>
        </Host>
      </>
    );
  }

  const summary = stockSummary(medication, plans);
  const relatedPlans = plans.filter((p) => p.medicationId === medication.id);

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteMedication(medication.id);
    router.back();
  };

  const restock = async () => {
    const amount = Number.parseInt(restockAmount.value, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRestockError(true);
      return;
    }
    await restockMedication(medication.id, amount);
    restockAmount.value = "";
    setRestockError(false);
    await reload();
  };

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          onPress={() => {
            router.push({ pathname: "/(tabs)/medica/form", params: { id } });
          }}
        >
          <Stack.Toolbar.Icon sf="square.and.pencil" />
          <Stack.Toolbar.Label>{t("common.edit")}</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Title large>{medication.name}</Stack.Title>
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <ScrollView
          showsIndicators={false}
          style={{ backgroundColor: theme.canvas }}
        >
          <Column
            spacing={0}
            style={{
              paddingHorizontal: Spacing.screen,
              paddingTop: Spacing.three,
              // 详情页在 (tabs) 组内，尾部必须让开原生 tab 栏，
              // 否则「删除药品」被压在 tab 栏底下点不到
              paddingBottom: BottomTabInset + Spacing.five,
            }}
          >
            <StockOverview medication={medication} summary={summary} />

            <SectionTitle>{t("medication.sectionBasic")}</SectionTitle>
            <BasicInfo
              medication={medication}
              summary={summary}
              language={language}
            />

            <SectionTitle>{t("plan.title")}</SectionTitle>
            <PlanSection
              plans={relatedPlans}
              persons={persons}
              medication={medication}
            />

            <SectionTitle>{t("medication.restock")}</SectionTitle>
            <SectionCard>
              <Column
                spacing={Spacing.three}
                style={{ padding: Spacing.three }}
              >
                <Row alignment="center" spacing={Spacing.rowGap}>
                  {/* 输入框列允许压缩（unconstrainedWidth），右侧按钮按固有宽度
                      排布 —— 同药品库卡片里「药名列 + 状态胶囊」那一行 */}
                  <Column
                    modifiers={[nativeLayout({ unconstrainedWidth: true })]}
                  >
                    <InputShell>
                      <TextInput
                        testID="restock-amount-input"
                        placeholder={t("medication.restockPlaceholder")}
                        keyboardType="number-pad"
                        onChangeText={() => {
                          setRestockError(false);
                        }}
                        value={restockAmount}
                      />
                    </InputShell>
                  </Column>
                  <Button
                    testID="restock-submit-button"
                    label={t("medication.restockSubmit")}
                    onPress={() => {
                      void restock();
                    }}
                    modifiers={nativeButtonModifiers({ style: "glass" })}
                  />
                </Row>
                {restockError ? (
                  <Text textStyle={{ fontSize: 13, color: theme.danger }}>
                    {t("medication.restockInvalid")}
                  </Text>
                ) : null}
                <Text textStyle={{ fontSize: 12, color: theme.textSecondary }}>
                  {t("medication.restockHint")}
                </Text>
              </Column>
            </SectionCard>

            <Column
              spacing={Spacing.three}
              style={{ paddingTop: Spacing.five }}
            >
              <Button
                testID="medication-add-plan-button"
                label={t("plan.formTitle")}
                onPress={() => {
                  router.push({
                    pathname: "/(tabs)/profile/plan-form",
                    params: { medicationId: medication.id },
                  });
                }}
                modifiers={nativeButtonModifiers({
                  style: "glass",
                  fullWidth: true,
                })}
              />
              {/* 文案在「删除药品 / 再次点击确认删除」之间切换，靠 testID 稳定定位 */}
              <Button
                testID="medication-delete-button"
                label={
                  confirmDelete
                    ? t("medication.deleteConfirmButton")
                    : t("medication.deleteButton")
                }
                onPress={() => {
                  remove();
                }}
                modifiers={nativeButtonModifiers({
                  style: "borderedProminent",
                  fullWidth: true,
                })}
              />
              <Row alignment="center">
                <Spacer flexible />
                <Text
                  textStyle={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {t("medication.deleteHint")}
                </Text>
                <Spacer flexible />
              </Row>
            </Column>
          </Column>
        </ScrollView>
      </Host>
    </>
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
  const box = roundedBox({
    color: theme.border,
    background: theme.surface,
    radius: Radius.card,
    width: 1,
  });

  return (
    <Row spacing={0} style={box.style} modifiers={box.modifiers}>
      {/* spacing 必须显式给 0：HStack 不传时是 SwiftUI 默认的 8pt，会在色条
          与内容之间撑出一条缝（同药品库卡片） */}
      <Row
        style={{
          width: 6,
          height: SPINE_HEIGHT,
          borderRadius: 3,
          backgroundColor: color.strong,
        }}
      />
      <Column spacing={Spacing.three} style={{ padding: Spacing.three }}>
        <Row alignment="center" spacing={Spacing.rowGap}>
          <Thumb />
          <Column modifiers={[nativeLayout({ unconstrainedWidth: true })]}>
            <Text
              numberOfLines={1}
              textStyle={{
                fontSize: 17,
                fontWeight: "700",
                color: theme.text,
              }}
            >
              {medication.name}
            </Text>
            <Text
              numberOfLines={1}
              textStyle={{ fontSize: 13, color: theme.textSecondary }}
            >
              {t("medication.metaLine", {
                type: medicationTypeLabel(medication.type, t),
                category: medicationCategoryLabel(medication.category, t),
              })}
            </Text>
          </Column>
          <Spacer flexible />
          <StockStatusPill level={level} />
        </Row>

        <Row alignment="end" spacing={Spacing.two}>
          <Text
            textStyle={{
              fontFamily: Fonts.sans,
              fontSize: 32,
              lineHeight: 34,
              fontWeight: "800",
              letterSpacing: -0.96,
              color: theme.text,
            }}
          >
            {String(medication.remainingQuantity)}
          </Text>
          <Text textStyle={{ fontSize: 15, color: theme.textSecondary }}>
            {`/ ${medication.totalQuantity} ${unit}`}
          </Text>
        </Row>

        <ProgressBar
          percent={percent}
          color={color.strong}
          track={theme.backgroundSelected}
          height={8}
        />

        <Row alignment="center" spacing={Spacing.two}>
          <Icon
            name="clock.fill"
            size={13}
            color={summary.low ? theme.danger : theme.textSecondary}
          />
          <Text
            textStyle={{
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
        </Row>
      </Column>
    </Row>
  );
}

/** 缩略图：与药品库列表卡同一个药丸图标 + primarySoft 底 */
function Thumb() {
  const theme = useTheme();
  const box = roundedBox({
    color: theme.border,
    background: theme.primarySoft,
    radius: 14,
    width: 1,
    // 固定尺寸的小盒子：fullWidth 的 frame(maxWidth: .infinity) 会把 style 里的
    // width / height 顶掉（omitUserOverridden 按 $type 去重）
    fullWidth: false,
  });
  return (
    <Row
      alignment="center"
      style={{
        ...box.style,
        width: THUMB_SIZE,
        height: THUMB_SIZE,
      }}
      modifiers={box.modifiers}
    >
      {/* Row 的 frame 只把内容压到纵轴中线，横轴中线靠这层 Column */}
      <Column alignment="center" style={{ width: THUMB_SIZE }}>
        <Icon name="pills.fill" size={24} color={theme.primary} />
      </Column>
    </Row>
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
    <Row
      // 胶囊按固有宽度排布、不参与压缩：同行药名放不下时让药名截断
      modifiers={[nativeLayout({ idealWidth: true })]}
      alignment="center"
      spacing={5}
      style={{
        borderRadius: Radius.pill,
        backgroundColor: withAlpha(color.base, 0.12),
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
      }}
    >
      <Icon name={STOCK_ICON[level]} size={13} color={color.strong} />
      <Text
        numberOfLines={1}
        textStyle={{
          fontFamily: Fonts.mono,
          fontSize: 11,
          fontWeight: "600",
          color: color.strong,
        }}
      >
        {t(STOCK_LABEL[level])}
      </Text>
    </Row>
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
  language: Language;
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
    <Column spacing={Spacing.two}>
      <SectionCard>
        {rows.map((row, index) => (
          <Column key={row.label}>
            {index > 0 ? <HairLine /> : null}
            <InfoRow
              label={row.label}
              value={row.value}
              valueColor={row.valueColor}
            />
          </Column>
        ))}
        {medication.notes ? (
          <>
            <HairLine />
            <Column
              spacing={Spacing.two}
              style={{
                paddingHorizontal: Spacing.three,
                paddingVertical: Spacing.rowGap,
              }}
            >
              <Text
                textStyle={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: theme.textSecondary,
                }}
              >
                {t("medication.notes")}
              </Text>
              <Text
                textStyle={{
                  fontSize: 15,
                  lineHeight: 21,
                  color: theme.text,
                }}
              >
                {medication.notes}
              </Text>
            </Column>
          </>
        ) : null}
      </SectionCard>
      {/* 录入 / 更新时间：同一次录入时只显示前者，不重复两行一样的日期 */}
      <Text
        style={{ paddingLeft: 4 }}
        textStyle={{ fontSize: 12, color: theme.textSecondary }}
      >
        {medication.updatedAt === medication.createdAt
          ? `${t("medication.createdAt")} ${formatTimestamp(medication.createdAt, language)}`
          : `${t("medication.createdAt")} ${formatTimestamp(medication.createdAt, language)} · ${t("medication.updatedAt")} ${formatTimestamp(medication.updatedAt, language)}`}
      </Text>
    </Column>
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
        <Column
          alignment="center"
          spacing={Spacing.two}
          style={{ padding: Spacing.three }}
        >
          <Text
            textStyle={{
              fontSize: 13,
              color: theme.textSecondary,
              textAlign: "center",
            }}
          >
            {t("medication.noTakers")}
          </Text>
          <Text
            textStyle={{
              fontSize: 12,
              color: theme.textSecondary,
              textAlign: "center",
            }}
          >
            {t("medication.noTakersHint")}
          </Text>
        </Column>
      </SectionCard>
    );
  }

  return (
    <SectionCard>
      {plans.map((plan, index) => {
        const person = persons.find((p) => p.id === plan.personId);
        return (
          <Column key={plan.id}>
            {index > 0 ? <HairLine /> : null}
            <ListItem
              testID={`medication-plan-${plan.id}`}
              onPress={() => {
                router.push({
                  pathname: "/(tabs)/profile/person-detail",
                  params: { id: plan.personId },
                });
              }}
              // AvatarMark 是 RN 子树，ListItem 的 leading 槽会自己包
              // RNHostView 托管（见 @expo/ui 的 ListItem 实现）
              leading={
                person ? (
                  <AvatarMark
                    color={person.avatarColor}
                    name={person.name}
                    size={36}
                  />
                ) : undefined
              }
              trailing={<PlanStatusPill plan={plan} />}
              supportingText={[
                t("medication.doseLine", { amount: plan.doseAmount, unit }),
                `${t("plan.perDay", { count: plan.times.length })} · ${plan.times.join(" / ")}`,
              ].join("\n")}
            >
              <Text
                numberOfLines={1}
                textStyle={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.text,
                }}
              >
                {person?.name ?? t("common.unknown")}
              </Text>
            </ListItem>
          </Column>
        );
      })}
    </SectionCard>
  );
}

/** 用药配置状态胶囊：服用中 / 已停用 / 已结束。停用与结束都不染色 */
function PlanStatusPill({ plan }: { plan: MedicationPlan }) {
  const theme = useTheme();
  const t = useTranslation();
  const active = planActiveOnDate(plan, todayKey());
  const tone = active ? theme.success : theme.textSecondary;
  const foreground = active ? theme.successStrong : theme.textSecondary;

  return (
    <Text
      style={{
        // 等价改造前的 minHeight 24 + 居中：文字交给 frame 的默认居中对齐，
        // 胶囊底色跟着同一块 frame 走（同 profile 的成员徽章）
        height: 24,
        paddingHorizontal: Spacing.rowGap,
        borderRadius: Radius.pill,
        backgroundColor: withAlpha(tone, 0.12),
      }}
      textStyle={{
        fontFamily: Fonts.mono,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.44,
        color: foreground,
        textAlign: "center",
      }}
    >
      {/* universal 的 Text 没有 textTransform，大写在 JS 侧补（中文不受影响） */}
      {planStatusLabel(plan, t).toUpperCase()}
    </Text>
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
  return { base: theme.success, strong: theme.successStrong };
}

const STOCK_ICON: Record<StockLevel, IconName> = {
  ok: "checkmark.circle.fill",
  low: "exclamationmark.triangle.fill",
  critical: "exclamationmark.octagon.fill",
};

const STOCK_LABEL: Record<StockLevel, Path> = {
  ok: "medication.stockOk",
  low: "medication.stockLow",
  critical: "medication.stockCritical",
};

/** 日期键转本地化日期：中文「2026年10月1日」，英文走 Intl 的 "Oct 1, 2026" */
function formatDateKey(key: string, language: Language): string {
  const [year, month, day] = key.split("-").map(Number);
  return formatDate(new Date(year, month - 1, day), language);
}

/** ISO 时间戳转本地化日期（录入 / 更新时间只精确到日） */
function formatTimestamp(iso: string, language: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return formatDate(date, language);
}

function formatDate(date: Date, language: Language): string {
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
