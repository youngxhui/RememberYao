import { RNHostView } from "@expo/ui";
import { useRouter } from "expo-router";
import { Pressable, Text as RNText, View as RNView } from "react-native";

import { SymbolIcon } from "@/components/symbol-icon";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, useTranslation, type Language } from "@/i18n";
import {
  addDays,
  medicationUnitLabel,
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
    // 手写插入保持升序：Hermes 没有 toSorted()，规则不允许原地排序 store 数据
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
  /** 岛内可用宽度（不含屏幕左右边距）。纯 RN 屏不传 */
  containerWidth?: number;
};

export function StockPanel({
  medications,
  plans,
  containerWidth,
}: StockPanelProps) {
  const theme = useTheme();
  const t = useTranslation();
  const { language } = useI18n();
  const router = useRouter();
  const rows = buildStockRows(medications, plans);
  const low = rows.filter((row) => row.low);

  return (
    // 宽度显式给出去：每行的药名是 `flex: 1`，父容器宽度不定时它会被压成 0
    <RNView style={{ gap: 10, width: containerWidth }}>
      <RNText
        style={{ color: theme.textSecondary, fontSize: 17, fontWeight: "600" }}
      >
        {t("home.stockListTitle")}
      </RNText>

      {rows.length === 0 ? (
        <RNText style={{ color: theme.textSecondary, fontSize: 13 }}>
          {t("home.stockListEmpty")}
        </RNText>
      ) : (
        rows.map((row) => (
          <RNView
            key={row.medication.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.two,
            }}
          >
            <RNText
              numberOfLines={1}
              style={{ flex: 1, color: theme.text, fontSize: 14 }}
            >
              {`${row.medication.name} ${row.medication.remainingQuantity}${medicationUnitLabel(
                row.medication.unit,
                t,
              )}`}
            </RNText>
            <StockBar percent={row.percent} low={row.low} />
            <RNText
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
            </RNText>
          </RNView>
        ))
      )}

      {low.length > 0 ? (
        <RNView
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginTop: Spacing.two,
            backgroundColor: withAlpha(theme.danger, 0.05),
            borderWidth: 1,
            borderColor: withAlpha(theme.danger, 0.28),
            borderRadius: Radius.card,
            borderCurve: "continuous",
            paddingHorizontal: Spacing.three,
            paddingVertical: 14,
          }}
        >
          <RNView
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
              name="exclamationmark.triangle.fill"
              size={17}
              color={theme.dangerStrong}
            />
          </RNView>
          <RNView style={{ flex: 1, minWidth: 0 }}>
            <RNText
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
            </RNText>
            <RNText
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
            </RNText>
          </RNView>
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
            <RNText
              style={{
                color: theme.dangerStrong,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {t("home.restock")}
            </RNText>
          </Pressable>
        </RNView>
      ) : null}
    </RNView>
  );
}

function StockBar({ percent, low }: { percent: number; low: boolean }) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, percent));
  return (
    <RNView
      style={{
        width: 72,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.border,
        overflow: "hidden",
      }}
    >
      <RNView
        style={{
          width: `${clamped * 100}%`,
          height: 4,
          borderRadius: 2,
          backgroundColor: low ? theme.danger : theme.success,
        }}
      />
    </RNView>
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

/** 放进 Expo UI 页面时用这个：行内药名靠 `flex: 1` 撑开，整块留成 RN island */
export function StockPanelExpoUI(props: StockPanelProps) {
  return (
    <RNHostView matchContents>
      <StockPanel {...props} />
    </RNHostView>
  );
}
