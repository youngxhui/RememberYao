import {
  Button,
  Column,
  Host,
  Icon,
  Row,
  ScrollView,
  Spacer,
  Text,
  type IconName,
} from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import { nativeLayout } from "@/components/native-layout";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation, type Path } from "@/i18n";
import {
  medicationCategoryLabel,
  medicationTypeLabel,
  stockLevel,
  useAppData,
  type Medication,
  type StockLevel,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

import { FilterRow, type MedicaFilter } from "./filter-row";

/** 药品缩略图边长（design/medications.html 的 .med-thumb 52px） */
const THUMB_SIZE = 52;

/**
 * 左侧状态色条的高度：跟着卡片内容走（缩略图 + 上下内边距），再高会被卡片
 * 自己的 borderRadius 裁掉。系统大字号下卡片会长高，色条仍是居中的 6pt 圆头条，
 * 不会破版。
 */
const SPINE_HEIGHT = THUMB_SIZE + Spacing.three * 2;

type CardModel = {
  medication: Medication;
  level: StockLevel;
};

/**
 * 药品库：搜索 + 分类筛选 + 药品卡片列表。
 * 视觉基准 = design/medications.html。
 *
 * 整屏是 Expo UI：`Host` + 原生纵向 `ScrollView`，分类筛选行是原生横向 `ScrollView`
 * （`FilterRow`），没有 RN island。卡片内部也不用 `flex` —— 药名与分类那列靠
 * `nativeLayout({ unconstrainedWidth })` 可压缩、行尾的状态胶囊按固有宽度排布并
 * 推到边（见 docs/conventions/expo-ui-layout.md）。
 *
 * 大标题走原生 `Stack.Title large`（就是设计稿的 hero-title），内容里从搜索栏
 * 直接进分类筛选行；搜索同样走原生的 `Stack.SearchBar`（AGENTS 硬规则 13），
 * 没有自己拼一个搜索框。
 * 设计稿 hero-title 那一行的副标题与「N 种」徽章已去掉：标题上移到导航栏之后，
 * 这两个元素只是设计稿的残留，药品数在列表里数得出来。
 *
 * 设计稿卡片右端还有个「更多」省略号按钮：它需要一个真能用的菜单，而
 * `@expo/ui` 的 universal 层没有 `Menu`（`swift-ui/Menu` 是 iOS-only，
 * `community/menu` 是自带 `Host` 的 RN 视图，不能嵌进这棵原生树）。
 * 整张卡的点击已经进详情，编辑与补货在详情页里，所以这里不放这个死控件。
 */
export function Medica() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
  const { medications, loading, reload } = useAppData();
  const [filter, setFilter] = useState<MedicaFilter>("all");
  const [query, setQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const cards = useMemo(
    () => buildMedicationCards(medications, filter, query),
    [medications, filter, query],
  );

  return (
    <>
      <Stack.Title large>{t("medication.listTitle")}</Stack.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          onPress={() => {
            router.push("/(tabs)/medica/add-options");
          }}
        >
          <Stack.Toolbar.Icon sf="plus" />
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
        {/* 底色铺在 ScrollView 背后：内容不满一屏时下方也得是 canvas */}
        <ScrollView
          showsIndicators={false}
          style={{ backgroundColor: theme.canvas }}
        >
          <Column
            spacing={Spacing.three}
            style={{
              paddingHorizontal: Spacing.screen,
            }}
          >
            <FilterRow filter={filter} onSelect={setFilter} />
            <MedicationList
              cards={cards}
              loading={loading}
              filter={filter}
              query={query}
              emptyCabinet={medications.length === 0}
            />
          </Column>
        </ScrollView>
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
      if (level === "ok") continue;
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
      <Column spacing={Spacing.rowGap}>
        {cards.map((card) => (
          <MedicationCard key={card.medication.id} card={card} />
        ))}
      </Column>
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

function MedicationCard({ card }: { card: CardModel }) {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
  const { medication, level } = card;
  const color = useStockColors(level);

  return (
    <Row
      testID={`medica-card-${medication.id}`}
      alignment="center"
      // spacing 必须显式给 0：HStack 不传 spacing 时是 SwiftUI 默认的 8pt，
      // 会把色条与内容之间撑出一条缝。设计稿的 .med-card 用 `border-left: 6px`
      // 造色条，色条紧贴卡片左沿、16px padding 紧接着量，所以这里也要 0。
      spacing={0}
      onPress={() => {
        router.push({
          pathname: "/(tabs)/medica/detail",
          params: { id: medication.id },
        });
      }}
      style={{
        // borderRadius 在 iOS 上是 clipShape：色条与内容都会被裁进卡片圆角里，
        // 所以不需要（universal style 也不支持）overflow: hidden
        borderRadius: Radius.card,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
      }}
    >
      <Row
        style={{
          width: 6,
          height: SPINE_HEIGHT,
          borderRadius: 3,
          backgroundColor: color.strong,
        }}
      />
      <Column style={{ padding: Spacing.three }}>
        <Row alignment="center" spacing={Spacing.rowGap}>
          <Thumb />
          <Column modifiers={[nativeLayout({ unconstrainedWidth: true })]}>
            <Text
              numberOfLines={1}
              textStyle={{
                fontSize: 17,
                fontWeight: "700",
                color: theme.text,
              }}
            >
              {medication.name}
            </Text>
            <Text
              numberOfLines={1}
              textStyle={{ fontSize: 13, color: theme.textSecondary }}
            >
              {t("medication.metaLine", {
                type: medicationTypeLabel(medication.type, t),
                category: medicationCategoryLabel(medication.category, t),
              })}
            </Text>
          </Column>
          <Spacer flexible />
          <StockPill medication={medication} level={level} />
        </Row>
      </Column>
    </Row>
  );
}

function Thumb() {
  const theme = useTheme();
  return (
    <Row
      alignment="center"
      style={{
        width: THUMB_SIZE,
        height: THUMB_SIZE,
        // 14 是设计稿 .med-thumb 的圆角，比通用的 Radius.tile 大一号
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.primarySoft,
      }}
    >
      {/* Row 的 frame 只把内容压到纵轴中线，横轴中线靠这层 Column */}
      <Column alignment="center" style={{ width: THUMB_SIZE }}>
        <Icon name="pills.fill" size={24} color={theme.primary} />
      </Column>
    </Row>
  );
}

/** 库存胶囊：`剩余/总数 · 状态`。设计稿的 .stock-pill */
function StockPill({
  medication,
  level,
}: {
  medication: Medication;
  level: StockLevel;
}) {
  const t = useTranslation();
  const color = useStockColors(level);

  return (
    <Row
      // 设计稿是 `flex-shrink: 0` + `white-space: nowrap`：状态胶囊永远单行、整颗不折行，
      // 药名那列压缩并截断。不锁固有宽度的话行内文字会先折成两行（设计稿 390pt 都放不下）
      // 或被截成「库存充…」，两种都比截断药名难看。
      modifiers={[nativeLayout({ idealWidth: true })]}
      alignment="center"
      spacing={5}
      style={{
        borderRadius: Radius.pill,
        backgroundColor: withAlpha(color.base, 0.12),
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
      }}
    >
      <Icon name={STOCK_ICON[level]} size={13} color={color.strong} />
      <Text
        numberOfLines={1}
        textStyle={{
          fontFamily: Fonts.mono,
          fontSize: 11,
          fontWeight: "600",
          color: color.strong,
        }}
      >
        {`${medication.remainingQuantity}/${medication.totalQuantity} · ${t(STOCK_LABEL[level])}`}
      </Text>
    </Row>
  );
}

function EmptyState({ body }: { body: Path }) {
  const theme = useTheme();
  const t = useTranslation();
  const router = useRouter();

  return (
    // 居中靠外层 Row 的左右弹性 Spacer，不是 Column 自己的 alignment="center"：
    // VStack 按内容收缩并贴父容器-leading，center 只是在这个窄盒子里自居中，
    // 整块空态会挤在屏幕左侧（就是上报的那个 bug）。
    // 也不能用 `nativeLayout({ fullWidth: true })` 的 maxWidth: Infinity ——
    // medica/form.tsx 的 PhotoScanArea 真机实测过，同位置下仍是小方块。
    // HStack + Spacer flexible 能撑满（同屏药品卡里把库存胶囊推到行尾的那对
    // `Spacer flexible` 就是这写法）。
    <Row alignment="center">
      <Spacer flexible />
      <Column
        alignment="center"
        spacing={Spacing.two}
        style={{ paddingTop: 60 }}
      >
        <Icon
          name="bookmark"
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
            router.push("/(tabs)/medica/add-options");
          }}
          modifiers={[]}
        />
      </Column>
      <Spacer flexible />
    </Row>
  );
}

/**
 * 库存状态 → 语义色。`base` 用于 12% 淡底（胶囊），`strong` 用于文字与左侧色条
 * —— 淡色档做实心会糊，与 AGENTS 里 `*Strong` 的约定一致。
 */
function useStockColors(level: StockLevel): { base: string; strong: string } {
  const theme = useTheme();
  if (level === "critical") {
    return { base: theme.danger, strong: theme.dangerStrong };
  }
  if (level === "low") {
    return { base: theme.warning, strong: theme.warningStrong };
  }
  return { base: theme.success, strong: theme.successStrong };
}

const STOCK_ICON: Record<StockLevel, IconName> = {
  ok: "checkmark.circle.fill",
  low: "exclamationmark.triangle.fill",
  critical: "exclamationmark.octagon.fill",
};

const STOCK_LABEL: Record<StockLevel, Path> = {
  ok: "medication.stockOk",
  low: "medication.stockLow",
  critical: "medication.stockCritical",
};
