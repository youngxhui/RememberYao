import { FlashList } from "@shopify/flash-list";
import { View } from "tamagui";

import { GlassChip, GlassChipRow } from "@/components/glass-chip";
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

export function FilterRow({
  filter,
  onSelect,
}: {
  filter: MedicaFilter;
  onSelect: (next: MedicaFilter) => void;
}) {
  const t = useTranslation();

  return (
    <GlassChipRow style={{ paddingVertical: Spacing.one }}>
      <FlashList
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: Spacing.screen }}
        horizontal
        data={MEDICA_FILTERS}
        renderItem={({ item }) => (
          <View marginRight="two">
            <GlassChip
              key={item.key}
              testID={`medica-filter-${item.key}`}
              label={t(item.label)}
              active={filter === item.key}
              onPress={() => {
                onSelect(item.key);
              }}
            />
          </View>
        )}
      />
    </GlassChipRow>
  );
}
