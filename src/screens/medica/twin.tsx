import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ScrollView as RNScrollView,
  TextInput as RNTextInput,
  // onLayout 是 RN View 专属 prop（Tamagui 的 View 类型不收），
  // 孪生的格子等分要数字宽度，只能留给 RN 父级实测
  View as RNView,
} from "react-native";
import { Text, View } from "tamagui";

import { GlassChip } from "@/components/glass-chip";
import { GlassHostButton } from "@/components/glass-host-button";
import { ProgressBarRn } from "@/components/progress-bar";
import { InputShell } from "@/components/rn-input-shell";
import { RnPicker } from "@/components/rn-picker";
import { SectionCard, SectionTitle } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { SymbolIcon } from "@/components/symbol-icon";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, useTranslation, type Language } from "@/i18n";
import {
  appendBlisterPacks,
  blisterSummary,
  consumeBlisterSlot,
  openBlisterTwin,
  packStatus,
  planActiveOnDate,
  restoreBlisterSlot,
  stockSummary,
  todayKey,
  undoUsage,
  voidBlisterSlot,
  useMedication,
  usePersons,
  usePacksForMedication,
  usePlansForMedication,
  useSlotsForMedication,
  useUsagesForMedication,
  type BlisterPack,
  type BlisterSlot,
} from "@/lib/store";
import {
  BlisterGrid,
  buildPillLook,
  SlotLegend,
  TwinFoilCard,
} from "@/screens/medica/twin-foil";

/**
 * 泡罩数字孪生：把一块实体药板逐格搬进 App。
 *
 * 整屏纯 RN。铝箔药板（金属渐变、泡罩受光、药饼球面）在 `twin-foil.tsx`，
 * 用 `expo-linear-gradient` + 同心圆分层近似早先 SwiftUI `background(_:in:)`
 * 的那套 linear / radial 渐变 —— 径向那部分没有真正的 radialGradient 可用，
 * 详见该文件顶部说明。板宽由 RN 父级 `onLayout` 实测喂入（格子等分要数字宽）。
 * 点格子弹出的 sheet 用 `@lodev09/react-native-true-sheet`（真原生 sheet：
 * iOS UISheetPresentationController / Android ModalBottomSheet，命令式
 * present/dismiss），是屏幕根的兄弟。
 *
 * 未开启孪生的板装药（存量数据）在这一屏承载开启表单：填规格 → 按当前
 * 剩余量补历史消耗格 → 立即可用。分配算法见 store.ts 的 planTwinBuild。
 */
export function MedicationTwin() {
  const t = useTranslation();
  // SymbolIcon 的 color 是原生 tintColor，收不到 Tamagui 的 token 名
  const theme = useTheme();
  const { language } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  // 按需读取：孪生页只要这味药、它的板 / 槽位 / 配置 / 服用记录，以及成员名单
  const {
    data: medication,
    loading: medicationLoading,
    reload: reloadMedication,
  } = useMedication(id);
  const {
    data: packs,
    loading: packsLoading,
    reload: reloadPacks,
  } = usePacksForMedication(id);
  const {
    data: blisterSlots,
    loading: slotsLoading,
    reload: reloadSlots,
  } = useSlotsForMedication(id);
  const {
    data: plans,
    loading: plansLoading,
    reload: reloadPlans,
  } = usePlansForMedication(id);
  const {
    data: usages,
    loading: usagesLoading,
    reload: reloadUsages,
  } = useUsagesForMedication(id);
  const {
    data: persons,
    loading: personsLoading,
    reload: reloadPersons,
  } = usePersons();
  const loading =
    medicationLoading ||
    packsLoading ||
    slotsLoading ||
    plansLoading ||
    usagesLoading ||
    personsLoading;
  const reload = useCallback(() => {
    reloadMedication();
    reloadPacks();
    reloadSlots();
    reloadPlans();
    reloadUsages();
    reloadPersons();
  }, [
    reloadMedication,
    reloadPacks,
    reloadSlots,
    reloadPlans,
    reloadUsages,
    reloadPersons,
  ]);

  const [selectedSeq, setSelectedSeq] = useState(1);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [specError, setSpecError] = useState(false);
  const [specRows, setSpecRows] = useState("3");
  const [specCols, setSpecCols] = useState("10");
  const [specPacks, setSpecPacks] = useState("1");
  // 铝箔岛的宽度：格子等分要数字宽（CELL_MIN/CELL_MAX），用格子父级
  // onLayout 实测，不再测 Host（孪生是 useExpoUiContentWidth 的最后一个调用方）
  const [gridWidth, setGridWidth] = useState(0);
  // 格子详情 sheet：@lodev09/react-native-true-sheet（真原生 sheet：
  // iOS UISheetPresentationController / Android ModalBottomSheet）。
  // 命令式 present/dismiss，index={-1} 初始关闭
  const sheetRef = useRef<TrueSheet>(null);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // 首屏还在读 SQLite：直接渲染会闪一下「药品不存在」
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "canvas" }}>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>{t("common.loading")}</Stack.Title>
      </View>
    );
  }

  if (!medication) {
    return (
      <View style={{ flex: 1, backgroundColor: "canvas" }}>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>{t("medication.notFound")}</Stack.Title>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 120,
          }}
        >
          <Text style={{ color: "textSecondary" }}>
            {t("medication.notFound")}
          </Text>
        </View>
      </View>
    );
  }

  const summary = blisterSummary(medication, packs, blisterSlots);
  const stock = stockSummary(medication, plans);
  // 泡里装什么：剂型 + 配色，整块药板共用一副面孔
  const pill = buildPillLook(medication);

  // 该药的板按 seq 升序；filter 产物是副本，原地排序不碰 store 数据
  const ownPacks = packs.filter((p) => p.medicationId === medication.id);
  // oxlint-disable-next-line unicorn/no-array-sort
  ownPacks.sort((a, b) => a.seq - b.seq);
  const pack: BlisterPack | undefined =
    ownPacks.find((p) => p.seq === selectedSeq) ??
    summary.openPack ??
    ownPacks[0];
  const packSlots = pack
    ? blisterSlots.filter((s) => s.packId === pack.id)
    : [];
  // oxlint-disable-next-line unicorn/no-array-sort
  packSlots.sort((a, b) => a.index - b.index);

  // 手动服用记在谁头上：默认该药当前生效配置的用药人，退回第一个成员
  const defaultPersonId =
    plans.find(
      (p) =>
        p.medicationId === medication.id && planActiveOnDate(p, todayKey()),
    )?.personId ??
    persons[0]?.id ??
    null;
  const activePersonId = personId ?? defaultPersonId;

  const activeSlot = activeSlotId
    ? blisterSlots.find((s) => s.id === activeSlotId)
    : undefined;
  const activeUsage = activeSlot?.usageId
    ? usages.find((u) => u.id === activeSlot.usageId)
    : undefined;

  const closeSheet = () => {
    // 命令式 dismiss：state 留给 onDidDismiss（关闭动画结束）清，
    // 这样 sheet 下滑消失时内容不会先一步被卸载
    void sheetRef.current?.dismiss();
  };

  const openSlotSheet = (slotId: string) => {
    setActiveSlotId(slotId);
    void sheetRef.current?.present(0);
  };

  const openTwin = async () => {
    const rows = Number.parseInt(specRows, 10);
    const cols = Number.parseInt(specCols, 10);
    const packCount = Number.parseInt(specPacks, 10);
    const valid =
      Number.isFinite(rows) &&
      Number.isFinite(cols) &&
      Number.isFinite(packCount) &&
      rows >= 1 &&
      cols >= 1 &&
      rows <= 12 &&
      cols <= 12 &&
      packCount >= 1 &&
      packCount <= 20;
    if (!valid) {
      setSpecError(true);
      return;
    }
    await openBlisterTwin(medication.id, { rows, cols, packCount });
    setSelectedSeq(1);
    setSpecError(false);
    await reload();
  };

  const runSlotAction = async (action: () => Promise<void>): Promise<void> => {
    await action();
    closeSheet();
    await reload();
  };

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>{medication.name}</Stack.Title>
      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          // 孪生页在 (tabs) 组内，尾部让开原生 tab 栏
          paddingBottom: BottomTabInset + Spacing.five,
        }}
      >
        <View style={{ gap: "three" }}>
          {summary.enabled ? (
            <>
              <TwinOverview
                full={summary.fullSlots}
                total={summary.totalSlots}
                daysLeft={stock.daysLeft}
                low={stock.low}
              />

              <PackSwitcher
                packs={ownPacks}
                slots={blisterSlots}
                selectedSeq={pack?.seq ?? 1}
                onSelect={setSelectedSeq}
              />

              {/* 铝箔药板：整块（含格子与图例）是纯 RN（见 twin-foil.tsx）。
                  宽度由父级实测喂进去 —— 格子等分要数字宽 */}
              {pack ? (
                <RNView
                  onLayout={(event) => {
                    setGridWidth(event.nativeEvent.layout.width);
                  }}
                >
                  {gridWidth > 0 ? (
                    <TwinFoilCard width={gridWidth}>
                      <BlisterGrid
                        pack={pack}
                        slots={packSlots}
                        gridWidth={gridWidth}
                        pill={pill}
                        medication={medication}
                        onSlotPress={openSlotSheet}
                      />
                      <SlotLegend pill={pill} />
                    </TwinFoilCard>
                  ) : null}
                </RNView>
              ) : null}

              {persons.length > 1 ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: "rowGap",
                  }}
                >
                  <SymbolIcon
                    name={{ ios: "person.2.fill", android: "group" }}
                    size={18}
                    color={theme.textSecondary}
                  />
                  <RnPicker
                    testID="twin-person-picker"
                    value={activePersonId ?? ""}
                    options={persons.map((person) => ({
                      label: person.name,
                      value: person.id,
                    }))}
                    onValueChange={setPersonId}
                    menuTitle={t("plan.person")}
                  />
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontSize: 12, color: "textSecondary" }}>
                    {t("twin.personHint")}
                  </Text>
                </View>
              ) : null}

              <GlassHostButton
                testID="twin-add-pack-button"
                label={t("twin.actionAddPack")}
                onPress={() => {
                  void appendBlisterPacks(medication.id, 1).then(reload);
                }}
              />
            </>
          ) : (
            <EnableTwinCard
              rows={specRows}
              cols={specCols}
              packCount={specPacks}
              specError={specError}
              onSubmit={() => {
                void openTwin();
              }}
              onInput={(field, value) => {
                if (field === "rows") setSpecRows(value);
                if (field === "cols") setSpecCols(value);
                if (field === "packs") setSpecPacks(value);
                setSpecError(false);
              }}
            />
          )}
        </View>
      </ScreenScaffold>

      {/* @lodev09/react-native-true-sheet：真原生 sheet（iOS
          UISheetPresentationController / Android ModalBottomSheet），
          放在屏幕根（Scaffold 外）。detents=['auto'] 内容自适应；
          index={-1} 初始关闭；下滑/点遮罩关闭是原生行为 */}
      <TrueSheet
        ref={sheetRef}
        detents={["auto"]}
        initialDetentIndex={-1}
        onDidDismiss={() => {
          setActiveSlotId(null);
        }}
      >
        {activeSlot && pack ? (
          <SlotSheet
            seq={pack.seq}
            slot={activeSlot}
            slotNumber={activeSlot.index + 1}
            personName={activeUsage?.personName ?? null}
            takenAt={activeUsage?.takenAt ?? null}
            late={activeUsage?.late ?? false}
            language={language}
            hasPerson={activePersonId !== null}
            onConsume={() => {
              void runSlotAction(async () => {
                if (!activePersonId) return;
                await consumeBlisterSlot(activeSlot.id, activePersonId);
              });
            }}
            onVoid={() => {
              void runSlotAction(async () => {
                await voidBlisterSlot(activeSlot.id);
              });
            }}
            onRestore={() => {
              void runSlotAction(async () => {
                await restoreBlisterSlot(activeSlot.id);
              });
            }}
            onUndo={() => {
              void runSlotAction(async () => {
                if (!activeSlot.usageId) return;
                await undoUsage(activeSlot.usageId);
              });
            }}
          />
        ) : null}
      </TrueSheet>
    </>
  );
}

/** 概览：剩余格数 + 进度条 + 预计天数。与详情页库存概览同一套语言 */
function TwinOverview({
  full,
  total,
  daysLeft,
  low,
}: {
  full: number;
  total: number;
  daysLeft: number | null;
  low: boolean;
}) {
  const t = useTranslation();
  const percent = total > 0 ? full / total : 0;
  const strong = low ? "dangerStrong" : "successStrong";

  return (
    <View
      style={{
        backgroundColor: "surface",
        borderWidth: 1,
        borderColor: "border",
        borderRadius: "card",
        borderCurve: "continuous",
        padding: "three",
        gap: "three",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: "two",
        }}
      >
        <Text
          style={{
            fontFamily: "system-ui",
            fontSize: 32,
            lineHeight: 34,
            fontWeight: "800",
            letterSpacing: -0.96,
            color: "text",
          }}
        >
          {String(full)}
        </Text>
        <Text style={{ fontSize: 15, color: "textSecondary" }}>
          {`/ ${total}`}
        </Text>
        <View style={{ flex: 1 }} />
        <Text
          style={{
            fontSize: 13,
            color: low && daysLeft !== null ? "danger" : "textSecondary",
          }}
        >
          {daysLeft !== null
            ? low
              ? t("medication.daysLeftHintLow", { days: daysLeft })
              : t("medication.daysLeftHint", { days: daysLeft })
            : t("medication.noEstimate")}
        </Text>
      </View>
      <ProgressBarRn
        percent={percent}
        color={strong}
        track="backgroundSelected"
        height={8}
      />
      <Text
        style={{
          fontSize: 12,
          color: low ? "danger" : "textSecondary",
        }}
      >
        {t("twin.summaryLine", { full, total })}
      </Text>
    </View>
  );
}

/** 板切换：横滑 chip 行。一盒多板，吃完一块自动落到下一块 */
function PackSwitcher({
  packs,
  slots,
  selectedSeq,
  onSelect,
}: {
  packs: BlisterPack[];
  slots: BlisterSlot[];
  selectedSeq: number;
  onSelect: (seq: number) => void;
}) {
  const t = useTranslation();

  return (
    <RNScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ padding: Spacing.one, gap: Spacing.two }}
    >
      {packs.map((pack) => {
        // 吃完的板在 chip 上标注出来，省得点进去才发现是空的
        const done =
          packStatus(slots.filter((s) => s.packId === pack.id)) === "consumed";
        return (
          <GlassChip
            key={pack.id}
            testID={`twin-pack-${pack.seq}`}
            label={
              done
                ? `${t("twin.packChip", { seq: pack.seq })} · ${t("twin.packStatusConsumed")}`
                : t("twin.packChip", { seq: pack.seq })
            }
            active={pack.seq === selectedSeq}
            onPress={() => {
              onSelect(pack.seq);
            }}
          />
        );
      })}
    </RNScrollView>
  );
}

/** 开启孪生的引导表单：规格 + 板数，一次建好整盒 */
function EnableTwinCard({
  rows,
  cols,
  packCount,
  specError,
  onSubmit,
  onInput,
}: {
  rows: string;
  cols: string;
  packCount: string;
  specError: boolean;
  onSubmit: () => void;
  /** 三个输入框共用：field 区分改的是哪一个，顺带清掉错误态 */
  onInput: (field: "rows" | "cols" | "packs", value: string) => void;
}) {
  const t = useTranslation();
  // 输入框是 RN TextInput，style 不解析 Tamagui 的 token 名
  const theme = useTheme();

  return (
    <View style={{ gap: "three" }}>
      <SectionTitle>{t("twin.enableTitle")}</SectionTitle>
      <SectionCard>
        <View style={{ gap: "three" }}>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 19,
              color: "textSecondary",
            }}
          >
            {t("twin.enableBody")}
          </Text>
          {/* 三列等分：RN 有 flex，直接 flex: 1，不再由宿主算数字宽度 */}
          <View style={{ flexDirection: "row", gap: "two" }}>
            {[
              {
                field: "rows" as const,
                testID: "twin-enable-rows-input",
                placeholder: t("twin.specRows"),
                value: rows,
              },
              {
                field: "cols" as const,
                testID: "twin-enable-cols-input",
                placeholder: t("twin.specCols"),
                value: cols,
              },
              {
                field: "packs" as const,
                testID: "twin-enable-packs-input",
                placeholder: t("twin.specPacks"),
                value: packCount,
              },
            ].map((item) => (
              <View key={item.testID} style={{ flex: 1 }}>
                <InputShell>
                  <RNTextInput
                    testID={item.testID}
                    placeholder={item.placeholder}
                    keyboardType="number-pad"
                    onChangeText={(text) => {
                      onInput(item.field, text);
                    }}
                    value={item.value}
                    style={{ fontSize: 15, color: theme.text, padding: 0 }}
                  />
                </InputShell>
              </View>
            ))}
          </View>
          {specError ? (
            <Text style={{ fontSize: 13, color: "danger" }}>
              {t("twin.specInvalid")}
            </Text>
          ) : null}
          <GlassHostButton
            testID="twin-enable-submit"
            label={t("twin.specSubmit")}
            onPress={onSubmit}
          />
        </View>
      </SectionCard>
    </View>
  );
}

/**
 * 格子详情 sheet 内容：TrueSheet 的 children 直接是 RN 视图（不需要
 * BottomSheetView 那类包装），样式内联 —— 一块一次性浮层不值得抽组件，
 * 四态的分支比样式更值得写注释。
 */
function SlotSheet({
  seq,
  slot,
  slotNumber,
  personName,
  takenAt,
  late,
  language,
  hasPerson,
  onConsume,
  onVoid,
  onRestore,
  onUndo,
}: {
  seq: number;
  slot: BlisterSlot;
  slotNumber: number;
  personName: string | null;
  takenAt: string | null;
  late: boolean;
  language: Language;
  hasPerson: boolean;
  onConsume: () => void;
  onVoid: () => void;
  onRestore: () => void;
  onUndo: () => void;
}) {
  const t = useTranslation();

  return (
    <View
      testID="twin-slot-sheet"
      style={{
        paddingHorizontal: "four",
        paddingTop: "two",
        paddingBottom: "five",
        gap: "three",
        backgroundColor: "surface",
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: "700", color: "text" }}>
        {t("twin.slotTitle", { seq, slot: slotNumber })}
      </Text>

      {slot.status === "full" ? (
        <>
          <Text style={{ fontSize: 14, color: "textSecondary" }}>
            {hasPerson ? t("twin.slotFull") : t("twin.noPerson")}
          </Text>
          <SheetButton
            testID="twin-consume-button"
            label={t("twin.actionConsume")}
            color={"primary"}
            borderColor={"primary"}
            disabled={!hasPerson}
            onPress={onConsume}
          />
          <SheetButton
            testID="twin-void-button"
            label={t("twin.actionVoid")}
            color={"danger"}
            borderColor={"border"}
            onPress={onVoid}
          />
        </>
      ) : null}

      {slot.status === "empty" && personName && takenAt ? (
        <>
          <Text style={{ fontSize: 14, color: "textSecondary" }}>
            {t("twin.slotTaken", {
              person: personName,
              datetime: formatTakenAt(takenAt, language),
            })}
          </Text>
          {late ? (
            <Text style={{ fontSize: 12, color: "warningStrong" }}>
              {t("twin.slotTakenLate")}
            </Text>
          ) : null}
          <SheetButton
            testID="twin-undo-button"
            label={t("twin.actionUndo")}
            color={"danger"}
            borderColor={"border"}
            onPress={onUndo}
          />
        </>
      ) : null}

      {slot.status === "empty" && !personName ? (
        <>
          <Text style={{ fontSize: 14, color: "textSecondary" }}>
            {t("twin.slotHistory")}
          </Text>
          <SheetButton
            testID="twin-restore-button"
            label={t("twin.actionRestore")}
            color={"primary"}
            borderColor={"primary"}
            onPress={onRestore}
          />
        </>
      ) : null}

      {slot.status === "void" ? (
        <>
          <Text style={{ fontSize: 14, color: "textSecondary" }}>
            {t("twin.slotVoid")}
          </Text>
          <SheetButton
            testID="twin-restore-button"
            label={t("twin.actionRestore")}
            color={"primary"}
            borderColor={"primary"}
            onPress={onRestore}
          />
        </>
      ) : null}
    </View>
  );
}

/** sheet 里的操作按钮：RN Pressable（TrueSheet 的 children 是 RN 视图） */
function SheetButton({
  testID,
  label,
  color,
  borderColor,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  color: string;
  borderColor: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <View
      testID={testID}
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      borderWidth={1}
      borderColor={borderColor}
      borderRadius="tile"
      backgroundColor="transparent press:backgroundSelected"
      opacity={disabled ? 0.4 : 1}
      paddingBlock="three"
    >
      <Text fontSize={16} fontWeight="600" color={color} textAlign="center">
        {label}
      </Text>
    </View>
  );
}

/** 服用时刻 → 「10月1日 08:30」。日期走 Intl，不硬编码语序 */
function formatTakenAt(iso: string, language: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    const day = new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
      month: language === "zh" ? "numeric" : "short",
      day: "numeric",
    }).format(date);
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return `${day} ${time}`;
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}
