import { useObserve } from "expo-observe";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "tamagui";

import { HairLine, SectionCard } from "@/components/rn-section-card";
import { Padded, ScreenScaffold } from "@/components/screen-scaffold";
import { SymbolIcon } from "@/components/symbol-icon";
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

      {/* 家庭药箱是「短小固定的分组」（硬规则 10 的自己拼条款）：一张分组卡
         装下全部药品，不为它引 FlatList */}
      <ScreenScaffold>
        <FilterRow filter={filter} onSelect={setFilter} />

        {/* 首屏加载没结束时不显示空态：空列表闪一下再刷出内容最像「没做完」 */}
        {loading ? null : cards.length === 0 ? (
          // 空态不垂直居中：筛选题常驻顶部，居中会把它压到屏幕下半
          <View paddingTop={Spacing.six} paddingInline="screen">
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
          </View>
        ) : (
          <Padded>
            <View paddingTop="three">
              {/* 全部药品装进同一张分组卡：行与行之间用发丝线分隔，不给每行
               单独套白底圆角盒子（ui-design.md 的 Everything's a Card 反模式） */}
              <SectionCard tone="outline">
                {cards.map((card, index) => (
                  <View key={card.medication.id}>
                    {index > 0 ? <HairLine /> : null}
                    <MedicationRow
                      card={card}
                      onPress={() => {
                        router.push({
                          pathname: "/(tabs)/medica/detail",
                          params: { id: card.medication.id },
                        });
                      }}
                    />
                  </View>
                ))}
              </SectionCard>
            </View>
          </Padded>
        )}
      </ScreenScaffold>
    </>
  );
}

/**
 * 药品行：iOS 分组列表行。左「药名 + 类型/分类」右「库存值」，状态只由行尾
 * 数字的颜色承担 —— 不左侧色条、不缩略图图标块、不状态胶囊（那是设计稿的
 * dashboard 审美，与原生分组列表的语言不搭，见 ui-design.md 反模式表）。
 *
 * 按压反馈走 Tamagui 的 `press:` 子句（底色换成 backgroundSelected），
 * 不再需要 RN `Pressable` 的 style 函数。
 */
function MedicationRow({
  card,
  onPress,
}: {
  card: CardModel;
  onPress: () => void;
}) {
  const t = useTranslation();
  const { medication, level } = card;
  const stockColor = stockValueColor(level);

  return (
    <View
      testID={`medica-card-${medication.id}`}
      onPress={onPress}
      accessibilityRole="button"
      flexDirection="row"
      alignItems="center"
      gap="three"
      paddingInline="three"
      paddingBlock="rowGap"
      backgroundColor="transparent press:backgroundSelected"
    >
      <View flex={1} minWidth={0}>
        <Text numberOfLines={1} fontSize={16} fontWeight="600" color="text">
          {medication.name}
        </Text>
        <Text
          numberOfLines={1}
          fontSize={13}
          color="textSecondary"
          marginTop="half"
        >
          {t("medication.metaLine", {
            type: medicationTypeLabel(medication.type, t),
            category: medicationCategoryLabel(medication.category, t),
          })}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        fontSize={15}
        // 等宽数字：一列库存值（5/30、35/60）数字宽度一致，纵向扫读时不错行
        fontVariant={["tabular-nums"]}
        color={stockColor}
      >
        {level === "unset"
          ? t("medication.stockUnset")
          : `${medication.remainingQuantity}/${medication.totalQuantity}`}
      </Text>
    </View>
  );
}

/**
 * 行尾库存值的颜色：只有偏低 / 告急染色，充足与未设置都是次级灰。
 * 返回 Tamagui 的 token 名（`$` 前缀），由 Text 的 color prop 解析。
 * 档位判断（阈值、unset 的含义）见 entities.ts 的 stockLevel。
 */
function stockValueColor(level: StockLevel): string {
  if (level === "critical") return "dangerStrong";
  if (level === "low") return "warningStrong";
  return "textSecondary";
}

function EmptyState({ body }: { body: Path }) {
  // SymbolIcon 的 color 喂给原生的 SymbolView，只收真实色值；
  // 这里的 0.4 不透明度是算出来的值，不是设计 token
  const theme = useTheme();
  const t = useTranslation();
  const router = useRouter();

  return (
    <View alignItems="center" justifyContent="center" padding="three" gap="two">
      <SymbolIcon
        name={{ ios: "bookmark", android: "bookmark" }}
        size={56}
        color={withAlpha(theme.textSecondary, 0.4)}
      />
      <Text
        fontSize={17}
        fontWeight="700"
        color="textSecondary"
        textAlign="center"
      >
        {t("medication.emptyTitle")}
      </Text>
      <Text fontSize={13} color="textSecondary" textAlign="center">
        {t(body)}
      </Text>
      <View
        onPress={() => {
          router.push("/(tabs)/medica/quick-add");
        }}
        accessibilityRole="button"
        marginTop="two"
        paddingInline="three"
        paddingBlock="two"
        borderRadius="card"
        borderCurve="continuous"
        backgroundColor="primary press:primarySoft"
      >
        <Text color="onPrimary" fontSize={15} fontWeight="600">
          {t("common.add")}
        </Text>
      </View>
    </View>
  );
}
