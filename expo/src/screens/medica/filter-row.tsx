import { ScrollView, View } from "react-native";

import { GlassChip } from "@/components/glass-chip";
import { Spacing } from "@/constants/theme";
import { useTranslation, type Path } from "@/i18n";
import type { MedicationCategory } from "@/lib/store";

export type MedicaFilter = "all" | "low" | MedicationCategory;

/**
 * 筛选 chip 的顺序即视觉顺序：全部 → 三个用途分类 → 库存不足。
 * 键同时是 testID 后缀（`medica-filter-<key>`）。
 */
const MEDICA_FILTERS: { key: MedicaFilter; label: Path }[] = [
  { key: "all", label: "medication.filterAll" },
  { key: "chronic", label: "medication.categoryChronic" },
  { key: "acute", label: "medication.categoryAcute" },
  { key: "supplement", label: "medication.categorySupplement" },
  { key: "low", label: "medication.filterLow" },
];

/**
 * 分类筛选：横向可滑动的胶囊行（design/medications.html 的 .chip-row）。
 *
 * 关键：父容器是纵向 flex 时，横向 ScrollView 默认会被纵向拉伸，
 * 所以这里显式 `alignSelf: "flex-start"` 让它按内容高度决定自身高度。
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: Spacing.screen,
        paddingVertical: Spacing.one,
        alignItems: "center",
      }}
      style={{ alignSelf: "flex-start" }}
    >
      <View
        style={{ flexDirection: "row", gap: Spacing.two, alignItems: "center" }}
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
  );
}
