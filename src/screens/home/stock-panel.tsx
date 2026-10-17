import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { SYMBOL_ICONS } from "@/components/icons";
import { SymbolIcon } from "@/components/symbol-icon";
import { Fonts, Radius, Spacing } from "@/constants/theme";
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

export function StockPanel({ medications, plans }: StockPanelProps) {
  const theme = useTheme();
  const t = useTranslation();
  const { language } = useI18n();
  const router = useRouter();
  const rows = buildStockRows(medications, plans);
  const low = rows.filter((row) => row.low);

  return (
    <View style={{ gap: Spacing.two }}>
      {rows.length === 0 ? (
        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
          {t("home.stockListEmpty")}
        </Text>
      ) : (
        rows.map((row) => (
          <View
            key={row.medication.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.two,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: theme.text, fontSize: 14 }}
            >
              {`${row.medication.name} ${row.medication.remainingQuantity}${medicationUnitLabel(
                row.medication.unit,
                t,
              )}`}
            </Text>
            <StockBar percent={row.percent} low={row.low} />
            <Text
              style={{
                width: 72,
                textAlign: "right",
                color: row.low ? theme.warningStrong : theme.textSecondary,
                fontFamily: Fonts.mono,
                fontVariant: ["tabular-nums"],
                fontSize: 12,
                fontWeight: row.low ? "600" : "400",
              }}
            >
              {t("home.daysLeft", { days: row.daysLeft })}
            </Text>
          </View>
        ))
      )}

      {low.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.three,
            paddingHorizontal: Spacing.three,
            paddingVertical: 14,
            backgroundColor: withAlpha(theme.danger, 0.05),
            borderWidth: 1,
            borderColor: withAlpha(theme.danger, 0.28),
            borderRadius: Radius.card,
            borderCurve: "continuous",
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: Radius.pill,
              backgroundColor: withAlpha(theme.danger, 0.12),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SymbolIcon
              name={SYMBOL_ICONS.stockWarning}
              size={17}
              color={theme.dangerStrong}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                color: theme.dangerStrong,
                fontSize: 14,
                fontWeight: "600",
              }}
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
              style={{
                marginTop: 2,
                color: theme.textSecondary,
                fontFamily: Fonts.mono,
                fontSize: 12,
              }}
            >
              {t("home.lowRunsOut", {
                date: monthDay(addDays(todayKey(), low[0].daysLeft), language),
              })}
            </Text>
          </View>
          <Pressable
            testID="home-refill-button"
            accessibilityRole="button"
            accessibilityLabel={t("home.restock")}
            onPress={() => {
              router.push({
                pathname: "/(tabs)/medica/detail",
                params: { id: low[0].medication.id },
              });
            }}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: Spacing.three,
              borderRadius: Radius.pill,
              borderWidth: 1,
              borderColor: withAlpha(theme.dangerStrong, 0.3),
              backgroundColor: pressed
                ? withAlpha(theme.danger, 0.06)
                : theme.surface,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Text
              style={{
                color: theme.dangerStrong,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {t("home.restock")}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function StockBar({ percent, low }: { percent: number; low: boolean }) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, percent));
  return (
    <View
      style={{
        width: 72,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: 4,
          borderRadius: 2,
          backgroundColor: low ? theme.danger : theme.success,
        }}
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
