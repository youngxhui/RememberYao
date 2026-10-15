import {
  Button,
  Column,
  Host,
  Icon,
  List,
  ListItem,
  Row,
  Spacer,
  Text,
} from "@expo/ui";
import { useObserve } from "expo-observe";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ICONS } from "@/components/icons";
import { addIcon } from "@/components/toolbar-icons";
import { Spacing } from "@/constants/theme";
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
 * 药品库：搜索 + 分类筛选 + 原生列表。
 *
 * 列表用 universal `List` + `ListItem`（iOS 是 SwiftUI `List`，Android 是 Material 3
 * `LazyColumn`，两端都是懒加载容器）：一味药就是一行原生行 —— 药名是 headline，
 * `类型 · 分类` 是 supportingText，行尾是 `剩余/总数`。不再自己拼卡片：缩略图、
 * 左侧色条、库存胶囊、描边圆角底全去掉，原生行的字号层级、分隔线与按压高亮已经
 * 把层次讲清楚了，再糊一层装饰只会把药名挤得更短。库存够不够只看行尾数字的颜色
 * （偏低 / 告急），完整状态在详情页。
 *
 * ⚠️ `List` 自己就是滚动容器，**不能再嵌进外层 `ScrollView`**（SwiftUI List 在
 * ScrollView 里会塌成零高、内容直接消失，项目记录过的真机 bug），所以本屏的滚动
 * 整体交给 `List`：分类筛选 chip 行是不随内容滚动的头部，排在 `List` 上面，
 * 由外层 `Column`（VStack / Compose Column）把剩余高度让给列表。
 *
 * 大标题走原生 `Stack.Title large`，搜索走原生 `Stack.SearchBar`（AGENTS 硬规则 13），
 * 都没有自己拼。
 */
export function Medica() {
  const router = useRouter();
  const theme = useTheme();
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

      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <Column spacing={Spacing.two}>
          <FilterRow filter={filter} onSelect={setFilter} />
          <MedicationList
            cards={cards}
            loading={loading}
            filter={filter}
            query={query}
            emptyCabinet={medications.length === 0}
          />
        </Column>
      </Host>
    </>
  );
}

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

function MedicationList({
  cards,
  loading,
  filter,
  query,
  emptyCabinet,
}: {
  cards: CardModel[];
  loading: boolean;
  filter: MedicaFilter;
  query: string;
  /** 整个药箱就是空的（而不是被筛选/搜索筛没了） */
  emptyCabinet: boolean;
}) {
  if (cards.length > 0) {
    return (
      <List>
        {cards.map((card) => (
          <MedicationRow key={card.medication.id} card={card} />
        ))}
      </List>
    );
  }
  // 首屏还在读数据时不渲染空态：空列表闪一下再刷出内容最像「没做完」
  if (loading) return null;
  return (
    <EmptyState
      body={
        emptyCabinet
          ? "medication.empty"
          : query.trim()
            ? "medication.emptySearch"
            : filter === "low"
              ? "medication.emptyLow"
              : "medication.emptyCategory"
      }
    />
  );
}

/**
 * 一行药。整行点击进详情（`ListItem` 的 onPress 覆盖整行矩形，含槽位间的空隙），
 * 行内容只留三样：药名、`类型 · 分类`、行尾库存。
 */
function MedicationRow({ card }: { card: CardModel }) {
  const router = useRouter();
  const t = useTranslation();
  const { medication, level } = card;

  return (
    <ListItem
      testID={`medica-card-${medication.id}`}
      onPress={() => {
        router.push({
          pathname: "/(tabs)/medica/detail",
          params: { id: medication.id },
        });
      }}
      supportingText={t("medication.metaLine", {
        type: medicationTypeLabel(medication.type, t),
        category: medicationCategoryLabel(medication.category, t),
      })}
      trailing={<StockValue medication={medication} level={level} />}
    >
      {medication.name}
    </ListItem>
  );
}

/**
 * 行尾库存：`剩余/总数`；从没记过库存（快速添加只建提醒那种）显示「未设置」。
 * 只给偏低 / 告急两档换文字色，不再有底色、图标和胶囊外框 —— 数字本身就是信息，
 * 颜色负责让「该补货了」在一屏里被看见。
 */
function StockValue({
  medication,
  level,
}: {
  medication: Medication;
  level: StockLevel;
}) {
  const t = useTranslation();
  const theme = useTheme();
  const color =
    level === "critical"
      ? theme.dangerStrong
      : level === "low"
        ? theme.warningStrong
        : theme.textSecondary;

  return (
    <Text numberOfLines={1} textStyle={{ fontSize: 15, color }}>
      {level === "unset"
        ? t("medication.stockUnset")
        : `${medication.remainingQuantity}/${medication.totalQuantity}`}
    </Text>
  );
}

function EmptyState({ body }: { body: Path }) {
  const theme = useTheme();
  const t = useTranslation();
  const router = useRouter();

  return (
    // 空态不再套在滚动容器里（`List` 才是滚动容器），上下各一颗弹性 Spacer 把它
    // 撑到筛选行下方的整块区域中间。
    <Column>
      <Spacer flexible />
      {/* 居中靠外层 Row 的左右弹性 Spacer，不是 Column 自己的 alignment="center"：
          VStack 按内容收缩并贴父容器-leading，center 只是在这个窄盒子里自居中，
          整块空态会挤在屏幕左侧（就是上报的那个 bug）。 */}
      <Row alignment="center">
        <Spacer flexible />
        <Column alignment="center" spacing={Spacing.two}>
          <Icon
            name={ICONS.bookmark}
            size={56}
            color={withAlpha(theme.textSecondary, 0.4)}
            accessibilityLabel={t(body)}
          />
          <Text
            textStyle={{
              fontSize: 17,
              fontWeight: "700",
              color: theme.textSecondary,
              textAlign: "center",
            }}
          >
            {t("medication.emptyTitle")}
          </Text>
          <Text
            textStyle={{
              fontSize: 13,
              color: theme.textSecondary,
              textAlign: "center",
            }}
          >
            {t(body)}
          </Text>
          <Button
            label={t("common.add")}
            onPress={() => {
              router.push("/(tabs)/medica/quick-add");
            }}
            modifiers={[]}
          />
        </Column>
        <Spacer flexible />
      </Row>
      <Spacer flexible />
    </Column>
  );
}
