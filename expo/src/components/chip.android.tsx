import { FilterChip, Text } from "@expo/ui/jetpack-compose";
import { testID as testIDModifier } from "@expo/ui/jetpack-compose/modifiers";

/**
 * 胶囊标签的 Android 实现：Material 3 官方 `FilterChip`（`@expo/ui/jetpack-compose`）。
 *
 * 曾经换成自造的 `Surface` + `Shape.Pill`，理由是「官方 FilterChip 只有文字点得动」。
 * 那个判断是误判：`SlotView`（`FilterChip.Label` 的载体）确实在 `ExpoComposeView.init`
 * 里被设成 `GONE` + `setWillNotDraw(true)`，但这是**所有**非 hosting 的
 * `ExpoComposeView` 的统一行为（`Surface` 自己也是）—— 它只是给 Compose 当测量源的
 * Android 子 view，GONE 的 view 根本不进触摸分发，不存在「吃掉点击」。
 * 整颗 chip 的点击由 `androidx.compose.material3.FilterChip` 自己的 `Surface(onClick)`
 * 处理，与 SlotView 无关。改用官方组件后，选中/按压动画、涟漪、无障碍、大字号
 * 全部由 Material 3 提供，不用自己拼。
 *
 * 取色照 design/medications.html 的 .chip：未选中 surface 底 + border 描边 + 次级
 * 文字；选中品牌色实心 + 反色文字。`border` 只有单一颜色（原生 `ChipBorder` 不区分
 * 选中态），所以选中态把描边也染成品牌色 —— 与底色同色即视觉上无描边，正好对上
 * 设计稿的 `.chip.active { border-color: var(--fg) }`。
 *
 * 字号 / 字重照设计稿（14px / 600）显式给出，否则会落到 Material 的 labelLarge；
 * 文字色不写，让 chip 经 `LocalContentColor` 按选中态自动切换。
 * 内边距与高度交给 Material 3（默认左右 16dp、高 32dp），不自己叠 —— 系统大字号
 * 下 chip 会跟着长高，这正是要的原生行为。
 *
 * testID：官方 chip 不吃 universal 的 testID prop，走 `Modifier.applyTestTag`
 * （Compose testTag → Android resource-id），Maestro 才点得到。
 */
export function Chip({
  testID,
  label,
  active,
  onPress,
}: {
  /** 只有可点的 chip 才是可交互控件，需要 testID 供端到端测试定位 */
  testID?: string;
  label: string;
  active: boolean;
  onPress?: () => void;
}) {
  return (
    <FilterChip
      selected={active}
      onClick={onPress}
      modifiers={testID ? [testIDModifier(testID)] : undefined}
    >
      <FilterChip.Label>
        <Text style={{ fontSize: 14, fontWeight: "600" }}>{label}</Text>
      </FilterChip.Label>
    </FilterChip>
  );
}
