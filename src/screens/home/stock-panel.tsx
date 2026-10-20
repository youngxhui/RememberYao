import { useRouter } from "expo-router";
import { Button, Text, View, XStack, YStack } from "tamagui";

import { SYMBOL_ICONS } from "@/components/icons";
import { SymbolIcon } from "@/components/symbol-icon";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, useTranslation, type Language } from "@/i18n";
import {
  addDays,
  medicationUnitLabel,
  stockLevel,
  stockSummary,
  todayKey,
  type Medication,
  type MedicationPlan,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

type StockRow = {
  medication: Medication;
  daysLeft: number;
  low: boolean;
  percent: number;
};

/** 首页库存速览：只展示参与服药的药品，按剩余天数升序取前三条 */
export function buildStockRows(
  medications: Medication[],
  plans: MedicationPlan[],
  max = 3,
): StockRow[] {
  const rows: StockRow[] = [];
  for (const medication of medications) {
    if (stockLevel(medication) === "unset") continue;
    const summary = stockSummary(medication, plans);
    if (summary.daysLeft === null) continue;
    const percent =
      medication.totalQuantity > 0
        ? medication.remainingQuantity / medication.totalQuantity
        : 0;
    const row = {
      medication,
      daysLeft: summary.daysLeft,
      low: summary.low,
      percent,
    };
    let i = 0;
    while (i < rows.length && rows[i].daysLeft <= row.daysLeft) i += 1;
    rows.splice(i, 0, row);
    if (rows.length > max) rows.pop();
  }
  return rows;
}

export type StockPanelProps = {
  medications: Medication[];
  plans: MedicationPlan[];
};

/**
 * 库存速览面板：Tamagui 树 + token 名。
 *
 * 半透明色（`withAlpha(theme.danger, …)`）仍是算出来的值而不是设计 token，
 * 所以继续走 `useTheme()` 取真实色值喂给样式 prop；`SymbolIcon` 的 color
 * 同理 —— 它把值交给原生 SymbolView，收不了 token 名。
 */
export function StockPanel({ medications, plans }: StockPanelProps) {
  const theme = useTheme();
  const t = useTranslation();
  const { language } = useI18n();
  const router = useRouter();
  const rows = buildStockRows(medications, plans);
  const low = rows.filter((row) => row.low);

  return (
    <YStack gap="two">
      {rows.length === 0 ? (
        <Text color="$textSecondary" fontSize={13}>
          {t("home.stockListEmpty")}
        </Text>
      ) : (
        rows.map((row) => (
          <XStack key={row.medication.id} alignItems="center" gap="two">
            <Text numberOfLines={1} flex={1} color="$text" fontSize={14}>
              {`${row.medication.name} ${row.medication.remainingQuantity}${medicationUnitLabel(
                row.medication.unit,
                t,
              )}`}
            </Text>
            <StockBar percent={row.percent} low={row.low} />
            <Text
              width={72}
              textAlign="right"
              color={row.low ? "$warningStrong" : "$textSecondary"}
              fontFamily="mono"
              style={{ fontVariant: ["tabular-nums"] }}
              fontSize={12}
              fontWeight={row.low ? "600" : "400"}
            >
              {t("home.daysLeft", { days: row.daysLeft })}
            </Text>
          </XStack>
        ))
      )}

      {low.length > 0 ? (
        <XStack
          alignItems="center"
          gap="three"
          paddingInline="three"
          paddingBlock={14}
          backgroundColor={withAlpha(theme.danger, 0.05)}
          borderWidth={1}
          borderColor={withAlpha(theme.danger, 0.28)}
          borderRadius="card"
          borderCurve="continuous"
        >
          <View
            width={32}
            height={32}
            borderRadius="pill"
            backgroundColor={withAlpha(theme.danger, 0.12)}
            alignItems="center"
            justifyContent="center"
          >
            <SymbolIcon
              name={SYMBOL_ICONS.stockWarning}
              size={17}
              color={theme.dangerStrong}
            />
          </View>
          <YStack flex={1} minWidth={0}>
            <Text
              numberOfLines={1}
              color="$dangerStrong"
              fontSize={14}
              fontWeight="600"
            >
              {low.length > 1
                ? t("home.lowMany", {
                    name: low[0].medication.name,
                    count: low.length,
                  })
                : t("home.lowOne", { name: low[0].medication.name })}
            </Text>
            <Text
              numberOfLines={2}
              marginTop={2}
              color="$textSecondary"
              fontFamily="mono"
              fontSize={12}
            >
              {t("home.lowRunsOut", {
                date: monthDay(addDays(todayKey(), low[0].daysLeft), language),
              })}
            </Text>
          </YStack>
          <Button
            testID="home-refill-button"
            accessibilityRole="button"
            accessibilityLabel={t("home.restock")}
            onPress={() => {
              router.push({
                pathname: "/(tabs)/medica/detail",
                params: { id: low[0].medication.id },
              });
            }}
            size={false}
            minHeight={44}
            paddingInline="three"
            borderRadius="pill"
            borderWidth={1}
            borderColor={withAlpha(theme.dangerStrong, 0.3)}
            backgroundColor="$surface press:$dangerSoft"
            color="$dangerStrong"
            fontSize={13}
            fontWeight="600"
          >
            {t("home.restock")}
          </Button>
        </XStack>
      ) : null}
    </YStack>
  );
}

function StockBar({ percent, low }: { percent: number; low: boolean }) {
  const clamped = Math.max(0, Math.min(1, percent));
  return (
    <View
      width={72}
      height={4}
      borderRadius={2}
      backgroundColor="$border"
      overflow="hidden"
    >
      <View
        width={`${clamped * 100}%`}
        height={4}
        borderRadius={2}
        backgroundColor={low ? "$danger" : "$success"}
      />
    </View>
  );
}

/** 日期键转本地化短日期：中文「9月5日」，英文走 Intl 的 "Sep 5" */
function monthDay(key: string, language: Language): string {
  const [y, m, d] = key.split("-").map(Number);
  if (language === "zh") return `${m}月${d}日`;
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(y, m - 1, d));
  } catch {
    return key;
  }
}
