import { FlatList } from "react-native";

import { GlassChip } from "@/components/glass-chip";
import { Spacing } from "@/constants/theme";
import { useTranslation, type Path } from "@/i18n";
import type { MedicationCategory } from "@/lib/store";

export type MedicaFilter = "all" | "low" | MedicationCategory;

const MEDICA_FILTERS: { key: MedicaFilter; label: Path }[] = [
  { key: "all", label: "medication.filterAll" },
  { key: "chronic", label: "medication.categoryChronic" },
  { key: "acute", label: "medication.categoryAcute" },
  { key: "supplement", label: "medication.categorySupplement" },
  { key: "low", label: "medication.filterLow" },
];

/**
 * 横向 chip 行：改用 FlatList 承载，避免 UIScrollView 在纵向 flex
 * 容器里高度行为不可控。
 */
export function FilterRow({
  filter,
  onSelect,
}: {
  filter: MedicaFilter;
  onSelect: (next: MedicaFilter) => void;
}) {
  const t = useTranslation();

  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: Spacing.screen,
        alignItems: "center",
        gap: Spacing.two,
      }}
      style={{ height: 44 }}
      data={MEDICA_FILTERS}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => (
        <GlassChip
          testID={`medica-filter-${item.key}`}
          label={t(item.label)}
          active={filter === item.key}
          onPress={() => {
            onSelect(item.key);
          }}
        />
      )}
    />
  );
}
