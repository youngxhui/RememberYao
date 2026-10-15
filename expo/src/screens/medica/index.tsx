import { useObserve } from "expo-observe";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, FlatList } from "react-native";

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

      <ScreenScaffold scroll={false}>
        <View style={{ flex: 1 }}>
          <FilterRow filter={filter} onSelect={setFilter} />
          <FlatList
            style={{ flex: 1 }}
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
            contentContainerStyle={
              cards.length === 0
                ? { flexGrow: 1, justifyContent: "center" }
                : undefined
            }
          />
        </View>
      </ScreenScaffold>
    </>
  );
}

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
    <Pressable
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
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: "600", color: theme.text }}>
          {medication.name}
        </Text>
        <Text
          style={{ fontSize: 13, color: theme.textSecondary, marginTop: 2 }}
        >
          {t("medication.metaLine", {
            type: medicationTypeLabel(medication.type, t),
            category: medicationCategoryLabel(medication.category, t),
          })}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        style={{ fontSize: 15, color, fontWeight: "500" }}
      >
        {level === "unset"
          ? t("medication.stockUnset")
          : `${medication.remainingQuantity}/${medication.totalQuantity}`}
      </Text>
    </Pressable>
  );
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
