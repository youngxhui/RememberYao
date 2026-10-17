import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  Text as RNText,
  TextInput as RNTextInput,
  View as RNView,
} from "react-native";

import { GlassChip } from "@/components/glass-chip";
import { GlassHostButton } from "@/components/glass-host-button";
import { ProgressBarRn } from "@/components/progress-bar";
import { InputShell } from "@/components/rn-input-shell";
import { RnPicker } from "@/components/rn-picker";
import { SectionCard, SectionTitle } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { SymbolIcon } from "@/components/symbol-icon";
import { BottomTabInset, Radius, Spacing } from "@/constants/theme";
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
      <RNView style={{ flex: 1, backgroundColor: theme.canvas }}>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>{t("common.loading")}</Stack.Title>
      </RNView>
    );
  }

  if (!medication) {
    return (
      <RNView style={{ flex: 1, backgroundColor: theme.canvas }}>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>{t("medication.notFound")}</Stack.Title>
        <RNView
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 120,
          }}
        >
          <RNText style={{ color: theme.textSecondary }}>
            {t("medication.notFound")}
          </RNText>
        </RNView>
      </RNView>
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
        <RNView style={{ gap: Spacing.three }}>
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
                <RNView
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Spacing.rowGap,
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
                  <RNView style={{ flex: 1 }} />
                  <RNText style={{ fontSize: 12, color: theme.textSecondary }}>
                    {t("twin.personHint")}
                  </RNText>
                </RNView>
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
        </RNView>
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
  const theme = useTheme();
  const t = useTranslation();
  const percent = total > 0 ? full / total : 0;
  const strong = low ? theme.dangerStrong : theme.successStrong;

  return (
    <RNView
      style={{
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: Radius.card,
        borderCurve: "continuous",
        padding: Spacing.three,
        gap: Spacing.three,
      }}
    >
      <RNView
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: Spacing.two,
        }}
      >
        <RNText
          style={{
            fontFamily: "system-ui",
            fontSize: 32,
            lineHeight: 34,
            fontWeight: "800",
            letterSpacing: -0.96,
            color: theme.text,
          }}
        >
          {String(full)}
        </RNText>
        <RNText style={{ fontSize: 15, color: theme.textSecondary }}>
          {`/ ${total}`}
        </RNText>
        <RNView style={{ flex: 1 }} />
        <RNText
          style={{
            fontSize: 13,
            color:
              low && daysLeft !== null ? theme.danger : theme.textSecondary,
          }}
        >
          {daysLeft !== null
            ? low
              ? t("medication.daysLeftHintLow", { days: daysLeft })
              : t("medication.daysLeftHint", { days: daysLeft })
            : t("medication.noEstimate")}
        </RNText>
      </RNView>
      <ProgressBarRn
        percent={percent}
        color={strong}
        track={theme.backgroundSelected}
        height={8}
      />
      <RNText
        style={{
          fontSize: 12,
          color: low ? theme.danger : theme.textSecondary,
        }}
      >
        {t("twin.summaryLine", { full, total })}
      </RNText>
    </RNView>
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
  const theme = useTheme();
  const t = useTranslation();

  return (
    <RNView style={{ gap: Spacing.three }}>
      <SectionTitle>{t("twin.enableTitle")}</SectionTitle>
      <SectionCard>
        <RNView style={{ gap: Spacing.three }}>
          <RNText
            style={{
              fontSize: 13,
              lineHeight: 19,
              color: theme.textSecondary,
            }}
          >
            {t("twin.enableBody")}
          </RNText>
          {/* 三列等分：RN 有 flex，直接 flex: 1，不再由宿主算数字宽度 */}
          <RNView style={{ flexDirection: "row", gap: Spacing.two }}>
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
              <RNView key={item.testID} style={{ flex: 1 }}>
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
              </RNView>
            ))}
          </RNView>
          {specError ? (
            <RNText style={{ fontSize: 13, color: theme.danger }}>
              {t("twin.specInvalid")}
            </RNText>
          ) : null}
          <GlassHostButton
            testID="twin-enable-submit"
            label={t("twin.specSubmit")}
            onPress={onSubmit}
          />
        </RNView>
      </SectionCard>
    </RNView>
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
  const theme = useTheme();
  const t = useTranslation();

  return (
    <RNView
      testID="twin-slot-sheet"
      style={{
        paddingHorizontal: Spacing.four,
        paddingTop: Spacing.two,
        paddingBottom: Spacing.five,
        gap: Spacing.three,
        backgroundColor: theme.surface,
      }}
    >
      <RNText style={{ fontSize: 17, fontWeight: "700", color: theme.text }}>
        {t("twin.slotTitle", { seq, slot: slotNumber })}
      </RNText>

      {slot.status === "full" ? (
        <>
          <RNText style={{ fontSize: 14, color: theme.textSecondary }}>
            {hasPerson ? t("twin.slotFull") : t("twin.noPerson")}
          </RNText>
          <SheetButton
            testID="twin-consume-button"
            label={t("twin.actionConsume")}
            color={theme.primary}
            borderColor={theme.primary}
            disabled={!hasPerson}
            onPress={onConsume}
          />
          <SheetButton
            testID="twin-void-button"
            label={t("twin.actionVoid")}
            color={theme.danger}
            borderColor={theme.border}
            onPress={onVoid}
          />
        </>
      ) : null}

      {slot.status === "empty" && personName && takenAt ? (
        <>
          <RNText style={{ fontSize: 14, color: theme.textSecondary }}>
            {t("twin.slotTaken", {
              person: personName,
              datetime: formatTakenAt(takenAt, language),
            })}
          </RNText>
          {late ? (
            <RNText style={{ fontSize: 12, color: theme.warningStrong }}>
              {t("twin.slotTakenLate")}
            </RNText>
          ) : null}
          <SheetButton
            testID="twin-undo-button"
            label={t("twin.actionUndo")}
            color={theme.danger}
            borderColor={theme.border}
            onPress={onUndo}
          />
        </>
      ) : null}

      {slot.status === "empty" && !personName ? (
        <>
          <RNText style={{ fontSize: 14, color: theme.textSecondary }}>
            {t("twin.slotHistory")}
          </RNText>
          <SheetButton
            testID="twin-restore-button"
            label={t("twin.actionRestore")}
            color={theme.primary}
            borderColor={theme.primary}
            onPress={onRestore}
          />
        </>
      ) : null}

      {slot.status === "void" ? (
        <>
          <RNText style={{ fontSize: 14, color: theme.textSecondary }}>
            {t("twin.slotVoid")}
          </RNText>
          <SheetButton
            testID="twin-restore-button"
            label={t("twin.actionRestore")}
            color={theme.primary}
            borderColor={theme.primary}
            onPress={onRestore}
          />
        </>
      ) : null}
    </RNView>
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
  const theme = useTheme();
  return (
    <RNPressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        borderWidth: 1,
        borderColor,
        borderRadius: Radius.tile,
        backgroundColor: pressed ? theme.backgroundSelected : "transparent",
        opacity: disabled ? 0.4 : 1,
        paddingVertical: Spacing.three,
      })}
    >
      <RNText
        style={{
          fontSize: 16,
          fontWeight: "600",
          color,
          textAlign: "center",
        }}
      >
        {label}
      </RNText>
    </RNPressable>
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
