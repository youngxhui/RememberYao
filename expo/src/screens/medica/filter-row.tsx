import { ScrollView, View } from "react-native";

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
 * 横向 chip 行：外层 View 约束高度，避免 UIScrollView 在纵向 Yoga 里被拉满。
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
    <View style={{ alignSelf: "stretch" }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingVertical: Spacing.one,
          alignItems: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: Spacing.two,
            alignItems: "center",
          }}
        >
          {MEDICA_FILTERS.map((item) => (
            <GlassChip
              key={item.key}
              testID={`medica-filter-${item.key}`}
              label={t(item.label)}
              active={filter === item.key}
              onPress={() => {
                onSelect(item.key);
              }}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
