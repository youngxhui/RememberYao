import { useObserve } from "expo-observe";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { HairLine, SectionCard } from "@/components/rn-section-card";
import { Padded, ScreenScaffold } from "@/components/screen-scaffold";
import { SymbolIcon } from "@/components/symbol-icon";
import { addIcon } from "@/components/toolbar-icons";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation, type Path } from "@/i18n";
import {
  medicationCategoryLabel,
  medicationTypeLabel,
  stockLevel,
  useMedications,
  type Medication,
  type StockLevel,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

import { FilterRow, type MedicaFilter } from "./filter-row";

type CardModel = {
  medication: Medication;
  level: StockLevel;
};

export function buildMedicationCards(
  medications: Medication[],
  filter: MedicaFilter,
  query: string,
): CardModel[] {
  const keyword = query.trim().toLowerCase();
  const cards: CardModel[] = [];
  for (const medication of medications) {
    const level = stockLevel(medication);
    if (filter === "low") {
      if (level === "ok" || level === "unset") continue;
    } else if (filter !== "all" && medication.category !== filter) {
      continue;
    }
    if (keyword && !medication.name.toLowerCase().includes(keyword)) continue;
    cards.push({ medication, level });
  }
  return cards;
}

export function Medica() {
  const router = useRouter();
  const t = useTranslation();
  const { markInteractive } = useObserve();
  const { data: medications, loading, reload } = useMedications();
  const [filter, setFilter] = useState<MedicaFilter>("all");
  const [query, setQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  useEffect(() => {
    if (!loading) markInteractive();
  }, [loading, markInteractive]);

  const cards = useMemo(
    () => buildMedicationCards(medications, filter, query),
    [medications, filter, query],
  );

  return (
    <>
      <Stack.Title large>{t("medication.listTitle")}</Stack.Title>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={addIcon}
          accessibilityLabel={t("common.add")}
          onPress={() => {
            router.push("/(tabs)/medica/quick-add");
          }}
        >
          <Stack.Toolbar.Label>{t("common.add")}</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <Stack.SearchBar
        placeholder={t("medication.searchPlaceholder")}
        onChangeText={(event) => {
          setQuery(event.nativeEvent.text);
        }}
      />

      {/* 家庭药箱是「短小固定的分组」（硬规则 10 的自己拼条款）：一张分组卡
          装下全部药品，不为它引 FlatList */}
      <ScreenScaffold>
        <FilterRow filter={filter} onSelect={setFilter} />

        {/* 首屏加载没结束时不显示空态：空列表闪一下再刷出内容最像「没做完」 */}
        {loading ? null : cards.length === 0 ? (
          // 空态不垂直居中：筛选题常驻顶部，居中会把它压到屏幕下半
          <View
            style={{
              paddingTop: Spacing.six,
              paddingHorizontal: Spacing.screen,
            }}
          >
            <EmptyState
              body={
                medications.length === 0
                  ? "medication.empty"
                  : query.trim()
                    ? "medication.emptySearch"
                    : filter === "low"
                      ? "medication.emptyLow"
                      : "medication.emptyCategory"
              }
            />
          </View>
        ) : (
          <Padded>
            <View style={{ paddingTop: Spacing.three }}>
              {/* 全部药品装进同一张分组卡：行与行之间用发丝线分隔，不给每行
              单独套白底圆角盒子（ui-design.md 的 Everything's a Card 反模式） */}
              <SectionCard tone="outline">
                {cards.map((card, index) => (
                  <View key={card.medication.id}>
                    {index > 0 ? <HairLine /> : null}
                    <MedicationRow
                      card={card}
                      onPress={() => {
                        router.push({
                          pathname: "/(tabs)/medica/detail",
                          params: { id: card.medication.id },
                        });
                      }}
                    />
                  </View>
                ))}
              </SectionCard>
            </View>
          </Padded>
        )}
      </ScreenScaffold>
    </>
  );
}

/**
 * 药品行：iOS 分组列表行。左「药名 + 类型/分类」右「库存值」，状态只由行尾
 * 数字的颜色承担 —— 不左侧色条、不缩略图图标块、不状态胶囊（那是设计稿的
 * dashboard 审美，与原生分组列表的语言不搭，见 ui-design.md 反模式表）。
 */
function MedicationRow({
  card,
  onPress,
}: {
  card: CardModel;
  onPress: () => void;
}) {
  const t = useTranslation();
  const theme = useTheme();
  const { medication, level } = card;
  const stockColor = useStockValueColor(level);

  return (
    <Pressable
      testID={`medica-card-${medication.id}`}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.rowGap,
        backgroundColor: pressed ? theme.backgroundSelected : "transparent",
      })}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 16, fontWeight: "600", color: theme.text }}
        >
          {medication.name}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 13,
            color: theme.textSecondary,
            marginTop: Spacing.half,
          }}
        >
          {t("medication.metaLine", {
            type: medicationTypeLabel(medication.type, t),
            category: medicationCategoryLabel(medication.category, t),
          })}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 15,
          // 等宽数字：一列库存值（5/30、35/60）数字宽度一致，纵向扫读时不错行
          fontVariant: ["tabular-nums"],
          color: stockColor,
        }}
      >
        {level === "unset"
          ? t("medication.stockUnset")
          : `${medication.remainingQuantity}/${medication.totalQuantity}`}
      </Text>
    </Pressable>
  );
}

/**
 * 行尾库存值的颜色：只有偏低 / 告急染色，充足与未设置都是次级灰。
 * 档位判断（阈值、unset 的含义）见 entities.ts 的 stockLevel。
 */
function useStockValueColor(level: StockLevel): string {
  const theme = useTheme();
  if (level === "critical") return theme.dangerStrong;
  if (level === "low") return theme.warningStrong;
  return theme.textSecondary;
}

function EmptyState({ body }: { body: Path }) {
  const theme = useTheme();
  const t = useTranslation();
  const router = useRouter();

  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: Spacing.three,
        gap: Spacing.two,
      }}
    >
      <SymbolIcon
        name={{ ios: "bookmark", android: "bookmark" }}
        size={56}
        color={withAlpha(theme.textSecondary, 0.4)}
      />
      <Text
        style={{
          fontSize: 17,
          fontWeight: "700",
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {t("medication.emptyTitle")}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        {t(body)}
      </Text>
      <Pressable
        onPress={() => {
          router.push("/(tabs)/medica/quick-add");
        }}
        style={({ pressed }) => ({
          marginTop: Spacing.two,
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.two,
          borderRadius: Radius.card,
          borderCurve: "continuous",
          backgroundColor: pressed ? theme.primarySoft : theme.primary,
        })}
      >
        <Text
          style={{ color: theme.onPrimary, fontSize: 15, fontWeight: "600" }}
        >
          {t("common.add")}
        </Text>
      </Pressable>
    </View>
  );
}
