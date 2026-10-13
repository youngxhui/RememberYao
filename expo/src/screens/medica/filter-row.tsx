import { Row, ScrollView } from "@expo/ui";

import { Chip } from "@/components/chip";
import { Spacing } from "@/constants/theme";
import { useTranslation, type Path } from "@/i18n";
import type { MedicationCategory } from "@/lib/store";

/** 药品库的筛选维度。`all` / `low` 是跨分类的两个快捷项，其余是用途分类 */
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
 * 用 universal `ScrollView direction="horizontal"`（两端都是原生滚动容器），不写
 * `RNHostView` island：chip 行不需要 flex，横向滚动也能交给原生容器，少一块 island
 * 就少一处「宿主实测宽度 → 喂进 RN 子树」的边界（原来那版要把
 * `useExpoUiContentWidth()` 的实测值减去屏幕边距再传进来）。两端垂直方向不同的
 * 原生滚动容器由系统按手势方向仲裁，真机上横滑、竖滑互不干扰。
 *
 * 5 个 chip 加间距约 440pt，比内容区（屏宽 − 2×`Spacing.screen`）宽，所以必须横滑。
 * 滑到底时末位 chip 与屏幕右缘的留白来自内层 `Row` 的 `padding`（首尾各 8pt），
 * 和外层 `Column` 的 `paddingHorizontal` 叠起来刚好让 chip 不顶边。
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
    <ScrollView direction="horizontal" showsIndicators={false}>
      {/* 整行补一圈内边距：液态玻璃的高光棱线外扩超出胶囊本身，紧贴 ScrollView
          边界会被裁掉一截；左右各 8pt 也让首尾 chip 不顶边 */}
      <Row spacing={Spacing.two} style={{ padding: Spacing.one }}>
        {MEDICA_FILTERS.map((item) => (
          <Chip
            key={item.key}
            testID={`medica-filter-${item.key}`}
            label={t(item.label)}
            active={filter === item.key}
            onPress={() => {
              onSelect(item.key);
            }}
          />
        ))}
      </Row>
    </ScrollView>
  );
}
