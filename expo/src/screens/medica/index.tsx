import { useObserve } from "expo-observe";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
  FlatList,
} from "react-native";

import { ScreenScaffold } from "@/components/screen-scaffold";
import { SymbolIcon } from "@/components/symbol-icon";
import { addIcon } from "@/components/toolbar-icons";
import { Spacing, Radius } from "@/constants/theme";
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

/**
 * 列表筛选：分类维度互斥，「库存不足」跨分类。
 * 搜索词与筛选维度同时生效（AND）—— 先按维度收窄，再按药名收窄。
 * 纯函数：结果只由入参决定，方便以后补单元测试。
 */
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
      // 「库存不足」只收真的偏低 / 告急；未设置库存（unset）不算 ——
      // 快速添加的药还没记库存，不该被筛进「库存不足」
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

  // 深链可能直接落到本 tab：列表数据落地后记录一次可交互时刻。
  // 同一会话里只有第一次调用生效，正常从首页进来的会话不会重复记
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

      <ScreenScaffold scroll={false}>
        <RNView style={{ flex: 1 }}>
          <FilterRow filter={filter} onSelect={setFilter} />
          <FlatList
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            data={cards}
            keyExtractor={(item) => item.medication.id}
            renderItem={({ item }) => (
              <MedicationRow
                card={item}
                onPress={() => {
                  router.push({
                    pathname: "/(tabs)/medica/detail",
                    params: { id: item.medication.id },
                  });
                }}
              />
            )}
            ListEmptyComponent={
              !loading ? (
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
              ) : undefined
            }
          />
        </RNView>
      </ScreenScaffold>
    </>
  );
}

/**
 * 一行药。整行点击进详情。
 * 行内容只留三样：药名、`类型 · 分类`、行尾库存。
 */
function MedicationRow({
  card,
  onPress,
}: {
  card: CardModel;
  onPress: () => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const { medication, level } = card;

  const color =
    level === "critical"
      ? theme.dangerStrong
      : level === "low"
        ? theme.warningStrong
        : theme.textSecondary;

  return (
    <RNPressable
      testID={`medica-card-${medication.id}`}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
        paddingVertical: Spacing.three,
        paddingHorizontal: Spacing.screen,
        backgroundColor: pressed ? theme.backgroundSelected : theme.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      })}
    >
      <RNView style={{ flex: 1 }}>
        <RNText style={{ fontSize: 17, fontWeight: "600", color: theme.text }}>
          {medication.name}
        </RNText>
        <RNText
          style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}
        >
          {t("medication.metaLine", {
            type: medicationTypeLabel(medication.type, t),
            category: medicationCategoryLabel(medication.category, t),
          })}
        </RNText>
      </RNView>
      <RNText
        numberOfLines={1}
        style={{ fontSize: 15, color, fontWeight: "500" }}
      >
        {level === "unset"
          ? t("medication.stockUnset")
          : `${medication.remainingQuantity}/${medication.totalQuantity}`}
      </RNText>
    </RNPressable>
  );
}

/**
 * 空态：药箱清空 / 搜索无结果 / 分类无药 / 库存充足。
 *
 * RN 写法用外层 flex: 1 + alignItems/justifyContent center 居中，
 * 禁止再用 Spacer flexible（Expo UI 产物，RN 树里不存在）。
 */
function EmptyState({ body }: { body: Path }) {
  const theme = useTheme();
  const t = useTranslation();
  const router = useRouter();

  return (
    <RNView
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: Spacing.three,
      }}
    >
      <SymbolIcon
        name={{ ios: "bookmark", android: "bookmark" }}
        size={56}
        color={withAlpha(theme.textSecondary, 0.4)}
      />
      <RNText
        style={{
          fontSize: 17,
          fontWeight: "700",
          color: theme.textSecondary,
          textAlign: "center",
          marginTop: Spacing.three,
        }}
      >
        {t("medication.emptyTitle")}
      </RNText>
      <RNText
        style={{
          fontSize: 13,
          color: theme.textSecondary,
          textAlign: "center",
          marginTop: Spacing.one,
        }}
      >
        {t(body)}
      </RNText>
      <RNPressable
        onPress={() => {
          router.push("/(tabs)/medica/quick-add");
        }}
        style={({ pressed }) => ({
          marginTop: Spacing.three,
          paddingHorizontal: Spacing.three,
          paddingVertical: Spacing.two,
          borderRadius: Radius.card,
          borderCurve: "continuous",
          backgroundColor: pressed ? theme.primarySoft : theme.primary,
        })}
      >
        <RNText
          style={{ color: theme.onPrimary, fontSize: 15, fontWeight: "600" }}
        >
          {t("common.add")}
        </RNText>
      </RNPressable>
    </RNView>
  );
}
