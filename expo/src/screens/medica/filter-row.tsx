import { ScrollView as RNScrollView, View as RNView } from "react-native";

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
 * RN ScrollView 自己就是原生横向滚动容器；chip 行排在内层横向 View 里，
 * 左右呼吸挂在外层 contentContainerStyle 的 paddingHorizontal 上（滚动时
 * 跟着内容走）：首颗 chip 不顶左边、滑到底时末颗 chip 与右缘之间也留得出呼吸。
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
    <RNScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: Spacing.screen,
        paddingVertical: Spacing.one,
      }}
    >
      <RNView style={{ flexDirection: "row", gap: Spacing.two }}>
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
      </RNView>
    </RNScrollView>
  );
}
