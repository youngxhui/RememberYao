import {
  BottomSheet,
  Button,
  Column,
  Host,
  Icon,
  Picker,
  Row,
  ScrollView,
  Spacer,
  Text,
  TextInput,
  useNativeState,
  type IconName,
  type ObservableState,
} from "@expo/ui";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from "react-native";

import { Chip } from "@/components/chip";
import { InputShell } from "@/components/input-shell";
import {
  nativeButtonModifiers,
  nativeContinuousShape,
  nativeGradientBackground,
} from "@/components/native-layout";
import { ProgressBar } from "@/components/progress-bar";
import { roundedBox } from "@/components/rounded-box";
import { SectionTitle } from "@/components/section-card";
import { BottomTabInset, Fonts, Radius, Spacing } from "@/constants/theme";
import { useExpoUiContentWidth } from "@/hooks/use-expo-ui-content-width";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, useTranslation, type Language } from "@/i18n";
import {
  appendBlisterPacks,
  blisterSummary,
  consumeBlisterSlot,
  openBlisterTwin,
  packStatus,
  pickPillTint,
  planActiveOnDate,
  restoreBlisterSlot,
  stockSummary,
  todayKey,
  undoUsage,
  voidBlisterSlot,
  useAppData,
  type BlisterPack,
  type BlisterSlot,
  type Medication,
  type PillTint,
} from "@/lib/store";
import { mixColor, withAlpha } from "@/utils/color";

/** 网格格子间距：等分宽度时扣掉的总间隙。取最小档让 10 列的窄板也放得下 */
const CELL_GAP = Spacing.one;

/** 格子尺寸上下限：下限保可点，上限防 3 列的板撑出巨型泡泡 */
const CELL_MIN = 26;
const CELL_MAX = 56;

/**
 * 光源方向：左上。所有径向渐变的中心都按它摆（泡罩受光面、药饼亮心、
 * 凹坑暗心），整板药的光才一致 —— 各处乱给中心会比不给更假。
 */
const LIGHT = { x: 0.36, y: 0.3 };

/** 泡里装的药：剂型（胶囊 / 药饼）+ 配色。由药品推导，见 buildPillLook */
type PillLook = {
  shape: "capsule" | "tablet";
  tint: PillTint;
};

/**
 * 药品 → 泡里的药长什么样。
 *
 * 剂型取 unit（粒 = 胶囊、片 = 片剂）：录入时已经选过，不重复提问。
 * 配色按药品 id 稳定取色 —— 同一盒药每次打开都是同一副面孔，
 * 换盒重录也不变（哈希同 pickAvatarColor）。
 */
function buildPillLook(medication: Medication): PillLook {
  return {
    shape: medication.unit === "pill" ? "capsule" : "tablet",
    tint: pickPillTint(medication.id),
  };
}

/**
 * 泡罩数字孪生：把一块实体药板逐格搬进 App。
 *
 * 布局沿药品详情页的既有结论：整屏 Expo UI（`Host` + 原生 `ScrollView`），
 * 区块收进同一个 `Column`；格子按 `useExpoUiContentWidth` 实测宽等分
 * （universal 没有 flex，等分靠算，同药品表单的两列字段）。点格子弹出的
 * `BottomSheet` 里是 RN 视图 —— universal BottomSheet 的 children 在各平台
 * 都是 RN 视图，这是组件本身的契约，不是绕路。
 *
 * 未开启孪生的板装药（存量数据）在这一屏承载开启表单：填规格 → 按当前
 * 剩余量补历史消耗格 → 立即可用。分配算法见 store.ts 的 openBlisterTwinIn。
 */
export function MedicationTwin() {
  const t = useTranslation();
  const theme = useTheme();
  const { language } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    medications,
    persons,
    plans,
    packs,
    blisterSlots,
    usages,
    loading,
    reload,
  } = useAppData();

  const [selectedSeq, setSelectedSeq] = useState(1);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [specError, setSpecError] = useState(false);

  const specRows = useNativeState("3");
  const specCols = useNativeState("10");
  const specPacks = useNativeState("1");

  const {
    width: contentWidth,
    onHostLayout,
    onLayoutContent,
  } = useExpoUiContentWidth();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // 首屏还在读 SQLite：此时 medications 是空的，直接渲染会闪一下「药品不存在」
  if (loading) {
    return (
      <>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Host style={{ flex: 1 }} />
      </>
    );
  }

  const medication = medications.find((m) => m.id === id);
  if (!medication) {
    return (
      <>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Host style={{ flex: 1 }}>
          <Row alignment="center" style={{ paddingTop: 120 }}>
            <Spacer flexible />
            <Text textStyle={{ color: theme.textSecondary }}>
              {t("medication.notFound")}
            </Text>
            <Spacer flexible />
          </Row>
        </Host>
      </>
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
    setActiveSlotId(null);
  };

  const openTwin = async () => {
    const rows = Number.parseInt(specRows.value, 10);
    const cols = Number.parseInt(specCols.value, 10);
    const packCount = Number.parseInt(specPacks.value, 10);
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

  // 开启表单三个输入框的等分宽：实测内容宽减去屏幕边距与列间距
  const gridWidth = Math.max(0, contentWidth - Spacing.screen * 2);
  const enableInputWidth = Math.max(
    0,
    Math.floor((gridWidth - Spacing.two * 2) / 3),
  );

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>{medication.name}</Stack.Title>
      <Host
        seedColor={theme.primary}
        style={{ flex: 1 }}
        onLayout={onHostLayout}
        onLayoutContent={onLayoutContent}
      >
        <ScrollView
          showsIndicators={false}
          style={{ backgroundColor: theme.canvas }}
        >
          <Column
            spacing={Spacing.three}
            style={{
              paddingHorizontal: Spacing.screen,
              paddingTop: Spacing.three,
              // 孪生页在 (tabs) 组内，尾部让开原生 tab 栏
              paddingBottom: BottomTabInset + Spacing.five,
            }}
          >
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

                {pack ? (
                  <BlisterGrid
                    pack={pack}
                    slots={packSlots}
                    gridWidth={gridWidth}
                    pill={pill}
                    medication={medication}
                    onSlotPress={setActiveSlotId}
                  />
                ) : null}

                <SlotLegend pill={pill} />

                {persons.length > 1 ? (
                  <Row alignment="center" spacing={Spacing.rowGap}>
                    <Icon
                      name="person.2.fill"
                      size={18}
                      color={theme.textSecondary}
                    />
                    <Picker<string>
                      testID="twin-person-picker"
                      appearance="menu"
                      selectedValue={activePersonId ?? ""}
                      onValueChange={setPersonId}
                    >
                      {persons.map((person) => (
                        <Picker.Item
                          key={person.id}
                          label={person.name}
                          value={person.id}
                        />
                      ))}
                    </Picker>
                    <Spacer flexible />
                    <Text
                      textStyle={{ fontSize: 12, color: theme.textSecondary }}
                    >
                      {t("twin.personHint")}
                    </Text>
                  </Row>
                ) : null}

                <Button
                  testID="twin-add-pack-button"
                  label={t("twin.actionAddPack")}
                  onPress={() => {
                    void appendBlisterPacks(medication.id, 1).then(reload);
                  }}
                  modifiers={nativeButtonModifiers({
                    style: "glass",
                    fullWidth: true,
                  })}
                />
              </>
            ) : (
              <EnableTwinCard
                inputWidth={enableInputWidth}
                rows={specRows}
                cols={specCols}
                packCount={specPacks}
                specError={specError}
                onSubmit={() => {
                  void openTwin();
                }}
                onInput={() => {
                  setSpecError(false);
                }}
              />
            )}
          </Column>
        </ScrollView>
      </Host>

      <BottomSheet
        isPresented={activeSlot !== undefined && pack !== undefined}
        onDismiss={closeSheet}
        testID="twin-slot-sheet"
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
      </BottomSheet>
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
  const box = roundedBox({
    color: theme.border,
    background: theme.surface,
    radius: Radius.card,
    width: 1,
  });

  return (
    <Column
      spacing={Spacing.three}
      style={{ ...box.style, padding: Spacing.three }}
      modifiers={box.modifiers}
    >
      <Row alignment="end" spacing={Spacing.two}>
        <Text
          textStyle={{
            fontFamily: Fonts.sans,
            fontSize: 32,
            lineHeight: 34,
            fontWeight: "800",
            letterSpacing: -0.96,
            color: theme.text,
          }}
        >
          {String(full)}
        </Text>
        <Text textStyle={{ fontSize: 15, color: theme.textSecondary }}>
          {`/ ${total}`}
        </Text>
        <Spacer flexible />
        <Text
          textStyle={{
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
        </Text>
      </Row>
      <ProgressBar
        percent={percent}
        color={strong}
        track={theme.backgroundSelected}
        height={8}
      />
      <Text
        textStyle={{
          fontSize: 12,
          color: low ? theme.danger : theme.textSecondary,
        }}
      >
        {t("twin.summaryLine", { full, total })}
      </Text>
    </Column>
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
    <ScrollView direction="horizontal" showsIndicators={false}>
      <Row spacing={Spacing.two} style={{ padding: Spacing.one }}>
        {packs.map((pack) => {
          // 吃完的板在 chip 上标注出来，省得点进去才发现是空的
          const done =
            packStatus(slots.filter((s) => s.packId === pack.id)) ===
            "consumed";
          return (
            <Chip
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
      </Row>
    </ScrollView>
  );
}

/** 泡罩网格：rows × cols 个格子，尺寸按实测内容宽等分 */
function BlisterGrid({
  pack,
  slots,
  gridWidth,
  pill,
  medication,
  onSlotPress,
}: {
  pack: BlisterPack;
  slots: BlisterSlot[];
  gridWidth: number;
  /** 泡里装什么药：剂型 + 配色，由药品决定（见 buildPillLook） */
  pill: PillLook;
  /** 药板上的印刷内容（药名 + 规格）来自药品本身 */
  medication: Medication;
  onSlotPress: (slotId: string) => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const cellSize = Math.min(
    CELL_MAX,
    Math.max(
      CELL_MIN,
      Math.floor((gridWidth - (pack.cols - 1) * CELL_GAP) / pack.cols),
    ),
  );
  const used = slots.filter((s) => s.status !== "full").length;
  // 窄板（列数少）算完会剩宽度：左右各一条弹性 Spacer 把网格压到中线，
  // 与药品库空态、详情页删除提示同一做法（universal 没有 margin: auto）
  const leftover = Math.max(
    0,
    gridWidth - (pack.cols * cellSize + (pack.cols - 1) * CELL_GAP),
  );
  const pad = leftover > 0 ? <Spacer flexible /> : null;
  const sheet = roundedBox({
    color: theme.foil.ring,
    background: theme.foil.base,
    radius: Radius.card,
    width: 1,
  });

  return (
    <Column spacing={Spacing.three}>
      <Row alignment="center">
        <Text textStyle={{ fontSize: 15, fontWeight: "700" }}>
          {t("twin.packChip", { seq: pack.seq })}
        </Text>
        <Spacer flexible />
        <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>
          {t("twin.packProgress", { used, total: slots.length })}
        </Text>
      </Row>
      {/* 整块是一张药板：铝箔纸（金属渐变）+ 热压封边，泡罩排在箔上 */}
      <Column
        spacing={CELL_GAP}
        style={{ ...sheet.style, padding: Spacing.two }}
        modifiers={[
          ...sheet.modifiers,
          ...nativeGradientBackground({
            shape: "sheet",
            radius: Radius.card,
            colors: theme.foil.metal,
          }),
        ]}
      >
        {/* 药板上的印刷：真泡罩卡一定印着药名与规格。等宽小字 + 字距 =
            油印感，也让它和界面文字区分开 */}
        <Text
          textStyle={{
            fontFamily: Fonts.mono,
            fontSize: 9,
            letterSpacing: 0.6,
            color: theme.textSecondary,
          }}
        >
          {medication.specification
            ? `${medication.name}  ${medication.specification}`
            : medication.name}
        </Text>
        {Array.from({ length: pack.rows }, (_row, rowIndex) => (
          <Row key={rowIndex} spacing={CELL_GAP}>
            {pad}
            {Array.from({ length: pack.cols }, (_col, colIndex) => {
              const slot = slots[rowIndex * pack.cols + colIndex];
              if (!slot) return null;
              return (
                <SlotCell
                  key={slot.id}
                  slot={slot}
                  seq={pack.seq}
                  size={cellSize}
                  pill={pill}
                  onPress={() => {
                    onSlotPress(slot.id);
                  }}
                />
              );
            })}
            {pad}
          </Row>
        ))}
      </Column>
    </Column>
  );
}

/** 格子：铝箔纸上的一泡。full 是凸起的泡罩，其余是服后/损坏留下的坑 */
function SlotCell({
  slot,
  seq,
  size,
  pill,
  onPress,
}: {
  slot: BlisterSlot;
  seq: number;
  size: number;
  pill: PillLook;
  onPress: () => void;
}) {
  const inset = sealInset(size);
  return (
    <Row
      testID={`twin-slot-${seq}-${slot.index}`}
      alignment="center"
      onPress={onPress}
      style={{ width: size, height: size }}
    >
      <Column alignment="center" style={{ width: size }}>
        {slot.status === "full" ? (
          <SealDisc size={size} tone="bubble">
            <Dome size={size - inset * 2} pill={pill} />
          </SealDisc>
        ) : (
          <SealDisc size={size} tone="hole">
            <SlotMark size={size - inset * 2} slot={slot} />
          </SealDisc>
        )}
      </Column>
    </Row>
  );
}

/** 热压封边的宽度：泡罩直径 = 格径 − 两倍封边。封边是平的，塑料泡从它中间凸起 */
function sealInset(size: number): number {
  return Math.max(2, Math.round(size * 0.07));
}

/**
 * 热压封边：泡罩压在铝箔上的那一圈平环。
 *
 * 服不服药它都在 —— 顶破的只是塑料，箔上的热压封口不会消失。所以 full 与
 * empty 共用这个外圈，只有圈里的东西不同：泡罩 or 坑。
 */
function SealDisc({
  size,
  tone,
  children,
}: {
  size: number;
  tone: "bubble" | "hole";
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const box = roundedBox({
    color: theme.foil.ring,
    background: tone === "bubble" ? theme.foil.shade : theme.foil.dent,
    radius: size / 2,
    width: 1,
    // 固定尺寸的小圆圈：fullWidth 的 frame(maxWidth: .infinity) 会顶掉 width
    fullWidth: false,
  });
  // 封边是平的，一道浅线性渐变就够；坑是凹的，径向渐变的暗心偏左上
  const gradient =
    tone === "bubble"
      ? nativeGradientBackground({
          shape: "circle",
          colors: theme.foil.seal,
        })
      : nativeGradientBackground({
          shape: "circle",
          colors: theme.foil.hole,
          center: LIGHT,
          startRadius: 0,
          endRadius: size / 2,
        });
  return (
    <Row
      alignment="center"
      style={{ ...box.style, width: size, height: size }}
      modifiers={[...box.modifiers, ...gradient]}
    >
      <Column alignment="center" style={{ width: size }}>
        {children}
      </Column>
    </Row>
  );
}

/**
 * 泡罩：被压出铝箔的透明塑料泡。
 *
 * 径向渐变的中心在左上（光源方向），向外一路压暗 —— 泡壁与箔面接近平行的
 * 角度受光最少，这就是塑料泡的体积。药有 0.94 的不透明度，泡的受光面会微微
 * 透上来，读作「药在塑料底下」而不是贴在泡面上。
 */
function Dome({ size, pill }: { size: number; pill: PillLook }) {
  const theme = useTheme();
  return (
    <Row
      alignment="center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.foil.highlight,
      }}
      modifiers={[
        ...nativeContinuousShape(size / 2),
        ...nativeGradientBackground({
          shape: "circle",
          colors: theme.foil.plastic,
          center: LIGHT,
          startRadius: 0,
          endRadius: size / 2,
        }),
      ]}
    >
      <Column
        alignment="center"
        // 药会沉到泡底：给一点上内边距，让药心比泡心低半个 padding。
        // 真实泡罩里药丸从不悬在泡正中，总是落底的
        style={{ width: size, paddingTop: Math.round(size * 0.05) }}
      >
        <PillMark look={pill} size={Math.round(size * 0.58)} />
      </Column>
    </Row>
  );
}

/** 坑里的状态标记：已服 / 历史消耗 / 损坏 */
function SlotMark({ size, slot }: { size: number; slot: BlisterSlot }) {
  const mark = slotMark(slot);
  const tint = useMarkTint(mark.tone);
  return (
    <Icon
      name={mark.icon}
      size={Math.max(9, Math.round(size * 0.42))}
      color={tint}
    />
  );
}

/** 坑里标记的语义档：已服 / 历史消耗 / 损坏。颜色走语义色，同库存胶囊 */
type MarkTone = "success" | "neutral" | "danger";

/** 语义档 → 颜色。hook 而不是常量表：要读 theme，且暗色下语义色会翻面 */
function useMarkTint(tone: MarkTone): string {
  const theme = useTheme();
  if (tone === "success") return theme.successStrong;
  if (tone === "danger") return theme.dangerStrong;
  return theme.textSecondary;
}

/** 槽位 → 坑里的标记。纯函数：只读状态，颜色由 useMarkTint 从 theme 取 */
function slotMark(slot: BlisterSlot): { icon: IconName; tone: MarkTone } {
  if (slot.status === "void") return { icon: "xmark", tone: "danger" };
  return slot.usageId
    ? { icon: "checkmark", tone: "success" }
    : { icon: "minus", tone: "neutral" };
}

/**
 * 泡里的药：胶囊（双色）或药饼（圆片）。
 *
 * 明暗不另存一套色板：胶囊的接缝、药饼的球面 shading 都由 tint 现算亮暗
 * 变体（mixColor）—— 换药片配色时不用重新推六套明暗。光源统一在左上，
 * 药饼的径向渐变中心就按它摆，整板药的光才是一致的。
 */
function PillMark({ look, size }: { look: PillLook; size: number }) {
  const { tint } = look;
  // 药在塑料泡底下：微微透出泡的受光面，而不是贴在泡面上
  const underPlastic = 0.94;

  if (look.shape === "capsule") {
    const height = Math.max(6, Math.round(size * 0.66));
    // 帽套在体上，接缝处比两色都暗一点（真实胶囊的套合位）
    const seam = mixColor(tint.cap, tint.body, 0.45);
    const glossHeight = Math.max(1, Math.round(height * 0.12));
    return (
      <Row
        style={{
          width: size,
          height,
          borderRadius: height / 2,
          backgroundColor: tint.body,
          opacity: underPlastic,
        }}
        modifiers={[
          ...nativeContinuousShape(height / 2),
          ...nativeGradientBackground({
            shape: "capsule",
            colors: [tint.cap, tint.cap, seam, tint.body, tint.body],
            start: { x: 0, y: 0.5 },
            end: { x: 1, y: 0.5 },
          }),
        ]}
      >
        {/* 明胶的蛋壳光泽：顶边一道细高光，只在上三分之一宽 */}
        <Column
          alignment="center"
          style={{
            width: size,
            paddingTop: Math.max(1, Math.round(height * 0.14)),
          }}
        >
          <Row
            style={{
              width: Math.round(size * 0.56),
              height: glossHeight,
              borderRadius: glossHeight / 2,
              backgroundColor: withAlpha("#FFFFFF", 0.55),
            }}
          />
        </Column>
      </Row>
    );
  }

  // 药饼：径向渐变当球面 shading（亮心在左上、边缘压暗），压痕是一道暗线
  const light = mixColor(tint.body, "#FFFFFF", 0.55);
  const mid = mixColor(tint.body, "#FFFFFF", 0.16);
  const edge = mixColor(tint.body, "#000000", 0.22);
  const scoreWidth = Math.max(2, Math.round(size * 0.5));
  return (
    <Row
      alignment="center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tint.body,
        opacity: underPlastic,
      }}
      modifiers={[
        ...nativeContinuousShape(size / 2),
        ...nativeGradientBackground({
          shape: "circle",
          colors: [light, mid, tint.body, edge],
          center: LIGHT,
          startRadius: 0,
          endRadius: size / 2,
        }),
      ]}
    >
      <Column alignment="center" style={{ width: size }}>
        <Row
          style={{
            width: scoreWidth,
            height: Math.max(1, Math.round(size * 0.05)),
            backgroundColor: mixColor(tint.body, "#000000", 0.32),
          }}
        />
      </Column>
    </Row>
  );
}

/** 图例：四种格子态的小样，直接复用格子视觉（缩到 14pt 的迷你药板） */
function SlotLegend({ pill }: { pill: PillLook }) {
  const theme = useTheme();
  const t = useTranslation();
  // 图例就是缩小版的真格子：封边 + 泡罩 / 封边 + 坑，不是色块示意
  const swatch = 16;
  const items: {
    key: string;
    label: string;
    node: React.ReactNode;
  }[] = [
    {
      key: "full",
      label: t("twin.legendFull"),
      node: (
        <SealDisc size={swatch} tone="bubble">
          <Dome size={swatch - sealInset(swatch) * 2} pill={pill} />
        </SealDisc>
      ),
    },
    {
      key: "taken",
      label: t("twin.legendTaken"),
      node: (
        <SealDisc size={swatch} tone="hole">
          <SlotMark
            size={swatch - sealInset(swatch) * 2}
            slot={LEGEND_SLOTS.taken}
          />
        </SealDisc>
      ),
    },
    {
      key: "history",
      label: t("twin.legendHistory"),
      node: (
        <SealDisc size={swatch} tone="hole">
          <SlotMark
            size={swatch - sealInset(swatch) * 2}
            slot={LEGEND_SLOTS.history}
          />
        </SealDisc>
      ),
    },
    {
      key: "void",
      label: t("twin.legendVoid"),
      node: (
        <SealDisc size={swatch} tone="hole">
          <SlotMark
            size={swatch - sealInset(swatch) * 2}
            slot={LEGEND_SLOTS.void}
          />
        </SealDisc>
      ),
    },
  ];

  return (
    <Row spacing={Spacing.three}>
      {items.map((item) => (
        <Row key={item.key} alignment="center" spacing={Spacing.half}>
          {item.node}
          <Text textStyle={{ fontSize: 11, color: theme.textSecondary }}>
            {item.label}
          </Text>
        </Row>
      ))}
    </Row>
  );
}

/** 图例用的三个假槽位：只借 slotMark 的形状与颜色，不落库 */
const LEGEND_SLOTS: Record<"taken" | "history" | "void", BlisterSlot> = {
  taken: {
    id: "legend-taken",
    packId: "legend",
    index: 0,
    status: "empty",
    usageId: "legend",
    consumedAt: null,
    consumedBy: null,
  },
  history: {
    id: "legend-history",
    packId: "legend",
    index: 0,
    status: "empty",
    usageId: null,
    consumedAt: null,
    consumedBy: null,
  },
  void: {
    id: "legend-void",
    packId: "legend",
    index: 0,
    status: "void",
    usageId: null,
    consumedAt: null,
    consumedBy: null,
  },
};

/** 开启孪生的引导表单：规格 + 板数，一次建好整盒 */
function EnableTwinCard({
  inputWidth,
  rows,
  cols,
  packCount,
  specError,
  onSubmit,
  onInput,
}: {
  /** 三个输入框的等分宽，由宿主实测内容宽算好传进来（universal 无 flex） */
  inputWidth: number;
  rows: ObservableState<string>;
  cols: ObservableState<string>;
  packCount: ObservableState<string>;
  specError: boolean;
  onSubmit: () => void;
  onInput: () => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const box = roundedBox({
    color: theme.border,
    background: theme.surface,
    radius: Radius.card,
    width: 1,
  });

  return (
    <Column spacing={Spacing.three}>
      <SectionTitle>{t("twin.enableTitle")}</SectionTitle>
      <Column
        spacing={Spacing.three}
        style={{ ...box.style, padding: Spacing.three }}
        modifiers={box.modifiers}
      >
        <Text
          textStyle={{
            fontSize: 13,
            lineHeight: 19,
            color: theme.textSecondary,
          }}
        >
          {t("twin.enableBody")}
        </Text>
        <Row spacing={Spacing.two}>
          <Column
            spacing={Spacing.one}
            style={inputWidth ? { width: inputWidth } : undefined}
          >
            <InputShell>
              <TextInput
                testID="twin-enable-rows-input"
                placeholder={t("twin.specRows")}
                keyboardType="number-pad"
                onChangeText={onInput}
                value={rows}
              />
            </InputShell>
          </Column>
          <Column
            spacing={Spacing.one}
            style={inputWidth ? { width: inputWidth } : undefined}
          >
            <InputShell>
              <TextInput
                testID="twin-enable-cols-input"
                placeholder={t("twin.specCols")}
                keyboardType="number-pad"
                onChangeText={onInput}
                value={cols}
              />
            </InputShell>
          </Column>
          <Column
            spacing={Spacing.one}
            style={inputWidth ? { width: inputWidth } : undefined}
          >
            <InputShell>
              <TextInput
                testID="twin-enable-packs-input"
                placeholder={t("twin.specPacks")}
                keyboardType="number-pad"
                onChangeText={onInput}
                value={packCount}
              />
            </InputShell>
          </Column>
        </Row>
        {specError ? (
          <Text textStyle={{ fontSize: 13, color: theme.danger }}>
            {t("twin.specInvalid")}
          </Text>
        ) : null}
        <Button
          testID="twin-enable-submit"
          label={t("twin.specSubmit")}
          onPress={onSubmit}
          modifiers={nativeButtonModifiers({ fullWidth: true })}
        />
      </Column>
    </Column>
  );
}

/**
 * 格子详情 sheet。children 是 RN 视图（BottomSheet 的契约），样式内联 ——
 * 一块一次性浮层不值得抽组件，四态的分支比样式更值得写注释。
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

/** sheet 里的操作按钮：RN Pressable（BottomSheet 的 children 是 RN 视图） */
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
