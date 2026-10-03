import { RNHostView } from "@expo/ui";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  Text as RNText,
  View as RNView,
  StyleSheet,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cubicBezier,
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { reminderStatusMeta, toneColors } from "@/components/dose-timeline";
import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  addDays,
  medicationUnitLabel,
  stockSummary,
  takeReminder,
  todayKey,
  type Medication,
  type MedicationPlan,
  type Person,
  type Reminder,
} from "@/lib/store";
import { withAlpha } from "@/utils/color";

// ── 几何与节奏：与 design/today.html 的「提醒卡」区块同源 ──────────────
const CARD_RADIUS = Radius.promo;
/** 设计稿固定三张堆叠，更多待办交给时间线 */
const MAX_CARDS = 3;
/** 触发换卡的滑动距离（px） */
const THRESHOLD = 90;
/** 与设计稿一致：小于该位移视为点按，不劫持 */
const DEAD_ZONE = 6;
/** 点按顶卡时的浮起距离（px） */
const LIFT = 6;
/** 跟手阶段顶卡缩到的最小比例（设计稿 1 → 0.84） */
const FRONT_S_MIN = 0.84;
/** 三个槽位的静止位（设计稿 is-front / is-mid / is-back） */
const SLOT_Y = [0, 16, 32];
const SLOT_S = [1, 0.955, 0.91];
/** 沉底后牌的横向溢出补偿（设计稿 .promo-stack padding-bottom: 30px） */
const STACK_PAD_BOTTOM = 30;

// cubicBezier 供 CSS transition 用（同 mini-archive），withTiming 走 Easing.bezier
const SWAP_EASE = cubicBezier(0.65, 0, 0.35, 1); // 换卡沉底曲线
const REBOUND_EASE = cubicBezier(0.22, 1, 0.36, 1); // 弹回 / 浮起曲线
const LINEAR_EASE = cubicBezier(0, 0, 1, 1); // 指示器底色 linear

/** 换卡沉底：设计稿 swapping 620ms；reduced motion 下直接落位 */
const swapTiming = (reduced: boolean) => {
  "worklet";
  return {
    duration: reduced ? 0 : 620,
    easing: Easing.bezier(0.65, 0, 0.35, 1),
  };
};
/** 未过阈值弹回：设计稿 340ms */
const reboundTiming = (reduced: boolean) => {
  "worklet";
  return {
    duration: reduced ? 0 : 340,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  };
};
/** 点按浮起 / 松开回落：220ms */
const floatTiming = (reduced: boolean) => {
  "worklet";
  return {
    duration: reduced ? 0 : 220,
    easing: Easing.bezier(0.22, 1, 0.36, 1),
  };
};

// 磨砂卡的三层渐变方向（CSS 160deg / 135deg → 归一化坐标，同 mini-archive）
const GRAD_160 = { start: { x: 0.33, y: 0.03 }, end: { x: 0.67, y: 0.97 } };
const GRAD_135 = { start: { x: 0.15, y: 0.15 }, end: { x: 0.85, y: 0.85 } };

/** 设计稿 .promo-card 是 backdrop-filter: blur(16px) saturate(1.15)；
 * expo-blur 的 intensity（0–100）按观感校准（mini-archive：14px → 70，
 * 即约 5/px，这里 16px → 80）。saturate 无法表达，由上层 accent 染色补偿。
 * Android 上 expo-blur 无实时模糊、退化为半透明（本项目 Android 尚未接入） */
const CARD_BLUR_INTENSITY = 80;

/** 淘汰队列：只保留按（日期+时间）升序的前 max 条 pending/missed。
 * 手写插入而非 Array#sort —— Hermes 无 toSorted，规则不允许原地排序 */
const takeEarliest = (list: Reminder[], max: number): Reminder[] => {
  const out: Reminder[] = [];
  for (const reminder of list) {
    if (reminder.status !== "pending" && reminder.status !== "missed") {
      continue;
    }
    const key = reminder.date + reminder.time;
    let i = 0;
    while (
      i < out.length &&
      (out[i].date + out[i].time).localeCompare(key) <= 0
    ) {
      i += 1;
    }
    out.splice(i, 0, reminder);
    if (out.length > max) out.pop();
  }
  return out;
};

type CardItem = {
  reminder: Reminder;
  timeLabel: string;
  state: ReturnType<typeof reminderStatusMeta>;
  title: string;
  doseLine: string;
  personName: string;
  accent: string;
  freqLine: string;
  stockLine: string;
  stockLow: boolean;
};

export type ReminderCardStackProps = {
  /** 提醒全集即可，组件自行筛出 pending/missed 并按时间取前三张 */
  reminders: Reminder[];
  medications: Medication[];
  persons: Person[];
  plans: MedicationPlan[];
  /** 任意写操作（如标记服用）后的回调，供调用方 reload */
  onChanged?: () => void;
  /**
   * 岛内可用宽度（不含屏幕左右边距）。放进 `Host` 时由调用方实测后传入：
   * 牌堆靠 Reanimated 绝对位移排布，宽度猜错会直接错位。
   */
  containerWidth?: number;
};

/**
 * 提醒卡堆叠：接下来的待处理提醒上下堆叠，纵向滑动换卡。
 *
 * 交互与视觉基准 = design/today.html 的「提醒卡」区块：
 * - 顶卡跟手并逐步缩小，越过 90px 阈值后沉入牌堆后方，其余卡各前进一步；
 * - 右侧指示器固定原地不随卡片移动，仅高亮段与沉底同步 morph；
 * - 磨砂卡底 = expo-blur 实时背景模糊 + 半透明主题色叠染，每卡按用药人头像色区分家庭成员。
 *
 * 接入约定：纯 RN 树。直接挂在纯 RN 的滚动屏里（当前是 `src/screens/home`）；
 * 若要塞进 @expo/ui 的 Host / 原生 ScrollView，外层需用 RNHostView 承载
 * （与 MiniArchive 相同）；手势根视图已在 `src/app/_layout.tsx` 用
 * GestureHandlerRootView 补齐。
 */
export function ReminderCardStack({
  reminders,
  medications,
  persons,
  plans,
  onChanged,
  containerWidth,
}: ReminderCardStackProps) {
  const theme = useTheme();
  const t = useTranslation();
  const reduced = useReducedMotion();

  // order = 视觉顺序（首项为顶卡）。与数据解耦，换卡时手动轮转
  const [order, setOrder] = useState<string[]>([]);
  const [sinking, setSinking] = useState(false);
  const [midTop, setMidTop] = useState<number | null>(null);
  const [hostWidth, setHostWidth] = useState(0);
  const { width: windowWidth } = useWindowDimensions();

  // 换卡状态机全在 UI 线程：
  //   0 静止 | 1 跟手（顶卡随手指、其余卡 lerp 补位） | 2 已过阈值、正在沉底
  const dragY = useSharedValue(0);
  const prog = useSharedValue(0);
  const phase = useSharedValue(0);
  const press = useSharedValue(0);

  // 拖动过再松手要吞掉随之而来的点按，避免误触「已服用」（同设计稿吞 click）。
  // 用 state 承载：onStart 经 scheduleOnRN 写入，按钮 onPress 在 JS 线程读取
  const [moved, setMoved] = useState(false);

  // 只堆叠未处理提醒，按时间升序取前三张
  const visible = useMemo(
    () => takeEarliest(reminders, MAX_CARDS),
    [reminders],
  );
  const n = visible.length;

  // 视觉顺序与数据联动：渲染期剪掉已消失的提醒、补上新到的（不在 effect 里 setState）
  const finalOrder = useMemo(() => {
    const ids = visible.map((r) => r.id);
    const kept = order.filter((id) => ids.includes(id));
    return [...kept, ...ids.filter((id) => !kept.includes(id))];
  }, [order, visible]);

  const handleHostLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) setHostWidth((prev) => (prev === next ? prev : next));
  }, []);
  // 放进 Expo UI 树时宽度由宿主实测后传进来（matchContents 下 RN 自测不可信）；
  // 纯 RN 屏则用 onLayout 实测，首次拿不到时退回「窗口宽 − 屏幕左右内边距」
  const width =
    containerWidth ??
    (hostWidth > 0 ? hostWidth : windowWidth - Spacing.three * 2);

  // 指示器纵向位置 = 卡片中段（标题区）顶边。三张卡结构等高，
  // 各卡上报同一值，取最后一次即可
  const handleMidLayout = useCallback((event: LayoutChangeEvent) => {
    const y = Math.round(event.nativeEvent.layout.y);
    setMidTop((prev) => (prev === y ? prev : y));
  }, []);

  // 过阈值的 RN 线程副作用只做一次：顶卡沉底期间降层
  const commit = useCallback(() => {
    setSinking(true);
  }, []);

  // 松手轮转牌堆：前→后、其余各前进一步，与子卡的沉底目标严格互补。
  // 先按当前数据剪枝再轮转，陈旧 id 不会吞掉这次旋转
  const rotate = useCallback(() => {
    setOrder((prev) => {
      const ids = visible.map((r) => r.id);
      const kept = prev.filter((id) => ids.includes(id));
      const next = [...kept, ...ids.filter((id) => !kept.includes(id))];
      return next.length > 1 ? [...next.slice(1), next[0]] : next;
    });
    setSinking(false);
  }, [visible]);

  const floatCfg = useMemo(() => floatTiming(reduced), [reduced]);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-DEAD_ZONE, DEAD_ZONE])
        .onBegin(() => {
          "worklet";
          dragY.set(0);
          prog.set(0);
          phase.set(1);
          // 触摸即让顶卡浮起（设计稿 :active 的 translateY(-6px)）
          press.set(withTiming(1, floatCfg));
          scheduleOnRN(setMoved, false);
        })
        .onStart(() => {
          "worklet";
          // 已越过死区 = 拖动而非点按
          scheduleOnRN(setMoved, true);
        })
        .onUpdate((event) => {
          "worklet";
          if (phase.get() !== 1) return;
          const dy = event.translationY;
          dragY.set(dy);
          prog.set(Math.max(0, Math.min(1, Math.abs(dy) / THRESHOLD)));
          if (Math.abs(dy) >= THRESHOLD) {
            phase.set(2);
            scheduleOnRN(commit);
            // 阈值穿越 = 沉底开始：commit 触感与动画同帧
            scheduleOnRN(fireSwapHaptic);
          }
        })
        .onFinalize(() => {
          "worklet";
          press.set(withTiming(0, floatCfg));
          const current = phase.get();
          if (current === 2) {
            // phase 停在 2 直到下次触摸：静止位即轮转后的新槽位，
            // 子卡的沉底动画可在松手后继续跑完
            scheduleOnRN(rotate);
          } else if (current === 1) {
            phase.set(0); // 未过阈值：子卡各自动画弹回本槽位
          }
        }),
    [commit, dragY, floatCfg, phase, press, prog, rotate, setMoved],
  );

  // 单卡没有换卡语义，不挂手势（也无需指示器）
  if (n === 0) return null;

  const orderedReminders = finalOrder
    .map((id) => visible.find((r) => r.id === id))
    .filter((r): r is Reminder => r !== undefined);

  // 指示器高亮段 = 当前顶卡在可见列表中的下标，由 order 推导而非自由
  // 计数器：列表收缩 / 补充（标记服用、新提醒到达）时自动跟随，不会错位
  const activeSeg = Math.max(
    0,
    visible.findIndex((r) => r.id === orderedReminders[0]?.id),
  );

  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const toCardItem = (reminder: Reminder): CardItem => {
    const medication = medications.find((m) => m.id === reminder.medicationId);
    const person = persons.find((p) => p.id === reminder.personId);
    const plan = plans.find((p) => p.id === reminder.planId);
    const summary = medication ? stockSummary(medication, plans) : null;
    const unit = medication
      ? medicationUnitLabel(medication.unit, t)
      : t("medication.unitTablet");
    const notes = medication?.notes.trim() ?? "";
    const daysLeft = summary?.daysLeft ?? null;

    let timeLabel = reminder.time;
    if (reminder.date === tomorrow) {
      timeLabel = `${t("records.tomorrow")} ${reminder.time}`;
    } else if (reminder.date !== today) {
      const month = Number(reminder.date.slice(5, 7));
      const day = Number(reminder.date.slice(8, 10));
      timeLabel = t("records.monthDayTime", {
        month,
        day,
        time: reminder.time,
      });
    }

    let stockLine = t("plan.endDateUnlimited");
    if (daysLeft !== null) {
      stockLine = t("records.stockDaysLeft", { days: daysLeft });
    } else if (plan?.endDate) {
      const endMonth = Number(plan.endDate.slice(5, 7));
      const endDay = Number(plan.endDate.slice(8, 10));
      stockLine = t("records.untilDate", { month: endMonth, day: endDay });
    }

    return {
      reminder,
      timeLabel,
      // 状态与时间线共用 reminderStatusMeta / toneColors，语义一致
      state: reminderStatusMeta(reminder, new Date(), t),
      title: medication?.name ?? t("home.unknownMedication"),
      // store 没有「规格」字段，剂量行 = 单次剂量 + 备注（设计稿 500mg · 1片 · 晚餐后）
      doseLine: notes
        ? `${reminder.doseAmount}${unit} · ${notes}`
        : `${reminder.doseAmount}${unit}`,
      personName: person?.name ?? t("home.unknownPerson"),
      // 卡色 = 用药人头像色（设计稿 --promo-accent 的个性化位），按人区分
      accent: person?.avatarColor ?? theme.primary,
      freqLine: t("plan.perDay", { count: plan?.times.length ?? 1 }),
      stockLine,
      stockLow: summary?.low ?? false,
    };
  };

  const stack = (
    <RNView style={{ paddingBottom: STACK_PAD_BOTTOM }}>
      <StackIndicator
        ids={visible.map((r) => r.id)}
        active={activeSeg}
        top={midTop}
        reduced={reduced}
      />
      {orderedReminders.map((reminder, index) => (
        <StackCard
          key={reminder.id}
          item={toCardItem(reminder)}
          slot={index}
          n={n}
          sinking={sinking && index === 0}
          dragY={dragY}
          prog={prog}
          phase={phase}
          press={press}
          onMidLayout={handleMidLayout}
          moved={moved}
          onChanged={onChanged}
        />
      ))}
    </RNView>
  );

  return (
    <RNView onLayout={handleHostLayout}>
      <RNView style={{ width }}>
        {n >= 2 ? (
          <GestureDetector gesture={gesture}>{stack}</GestureDetector>
        ) : (
          stack
        )}
      </RNView>
    </RNView>
  );
}

/** 指示器分段几何：未激活 9×9 圆点，激活 6×70 长条 */
const SEG_DOT = 9;
const SEG_ACTIVE_W = 6;
const SEG_ACTIVE_H = 70;
const SEG_GAP = 8;

/** 第 index 个分段的静止 top：与「纵向 column + 间距 SEG_GAP」的排版
 *  逐像素一致。绝对定位下直接算出，动画期间不牵连兄弟节点重排 */
const segTop = (index: number, active: number): number => {
  let top = 0;
  for (let i = 0; i < index; i += 1) {
    top += (i === active ? SEG_ACTIVE_H : SEG_DOT) + SEG_GAP;
  }
  return top;
};

/** 换卡 commit（阈值穿越 = 牌开始沉底）的一次轻触反馈 */
function fireSwapHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/**
 * 牌堆指示器：固定在卡片右侧，不随卡片移动（用户可见行为的硬要求）。
 * 高亮段加长、其余段变点，是尺寸 morph 而非位移 —— 按 expo-animation 的
 * 属性规则，width/height 只允许落在「绝对定位且无子节点」的叶子节点上
 * （进度条豁免），所以每个分段都绝对定位：top 偏移与居中全部走 transform
 * （零布局），width/height 过渡不再推挤兄弟段。分段 top 与原
 * 「column + gap」排版逐像素一致，视觉与改动前无差。
 */
function StackIndicator({
  ids,
  active,
  top,
  reduced,
}: {
  ids: string[];
  active: number;
  /** 卡片中段顶边的实测 y；首帧未测得时不渲染，避免闪到左上角 */
  top: number | null;
  reduced: boolean;
}) {
  const theme = useTheme();
  if (ids.length < 2 || top === null) return null;
  return (
    <RNView
      pointerEvents="none"
      style={{
        position: "absolute",
        right: 27,
        top,
        // 显式宽度：分段绝对定位后 left:"50%" 需要容器有宽才能居中
        width: SEG_DOT,
        zIndex: 5,
      }}
    >
      {ids.map((id, index) => {
        const on = index === active;
        const w = on ? SEG_ACTIVE_W : SEG_DOT;
        return (
          <Animated.View
            key={id}
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: w,
              height: on ? SEG_ACTIVE_H : SEG_DOT,
              borderRadius: 999,
              backgroundColor: withAlpha(
                on ? theme.promo.ink : theme.promo.dot,
                on ? 0.82 : 0.62,
              ),
              borderWidth: 1,
              borderColor: theme.promo.edge,
              // 居中 + 分段偏移走 transform：过渡零布局
              transform: [
                { translateX: -w / 2 },
                { translateY: segTop(index, active) },
              ],
              transitionProperty: [
                "width",
                "height",
                "transform",
                "backgroundColor",
              ],
              transitionDuration: reduced ? [0, 0, 0, 0] : [620, 620, 620, 300],
              transitionTimingFunction: [
                SWAP_EASE,
                SWAP_EASE,
                SWAP_EASE,
                LINEAR_EASE,
              ],
            }}
          />
        );
      })}
    </RNView>
  );
}

function StackCard({
  item,
  slot,
  n,
  sinking,
  dragY,
  prog,
  phase,
  press,
  onMidLayout,
  moved,
  onChanged,
}: {
  item: CardItem;
  /** 在 order 中的位置：0 顶卡、1 中卡、2 后卡 */
  slot: number;
  n: number;
  sinking: boolean;
  dragY: SharedValue<number>;
  prog: SharedValue<number>;
  phase: SharedValue<number>;
  press: SharedValue<number>;
  onMidLayout: (event: LayoutChangeEvent) => void;
  /** 拖动过的那次触摸要吞掉点按 */
  moved: boolean;
  onChanged?: () => void;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const { reminder, state, accent } = item;

  // 每张卡自己的落位动画值；跟手阶段不经过它，直接读父级共享值
  const cy = useSharedValue(SLOT_Y[slot]);
  const cs = useSharedValue(SLOT_S[slot]);

  // 数据变化会让槽位平移（如标记服用后列表收缩），空闲态直接对齐新静止位。
  // 换卡轮转发生在 phase 2，此时动画目标已 = 新槽位静止位，不能覆盖
  useEffect(() => {
    if (phase.get() === 0) {
      cy.set(SLOT_Y[slot]);
      cs.set(SLOT_S[slot]);
    }
  }, [cy, cs, phase, slot]);

  // 跟手公式：与设计稿 pointermove 的三段 lerp 同构，顶卡叠加点按浮起
  const followY = () => {
    "worklet";
    if (slot === 0) return dragY.get() - LIFT * press.get();
    return interpolate(prog.get(), [0, 1], [SLOT_Y[slot], SLOT_Y[slot - 1]]);
  };
  const followS = () => {
    "worklet";
    if (slot === 0) return interpolate(prog.get(), [0, 1], [1, FRONT_S_MIN]);
    return interpolate(prog.get(), [0, 1], [SLOT_S[slot], SLOT_S[slot - 1]]);
  };

  // 离开跟手的两种情形：过阈值 → 沉到「轮转后」的槽位；未过 → 弹回本槽位。
  // 目标必须在 JS 轮转 order 之前按旧 slot 算好，(slot + n - 1) % n 恰好是轮转映射
  useAnimatedReaction(
    () => phase.get(),
    (current, previous) => {
      if (previous !== 1) return;
      const committed = current === 2;
      const target = committed ? (slot + n - 1) % n : slot;
      const timing = committed ? swapTiming(reduced) : reboundTiming(reduced);
      // 先捕获当前跟手位，再从该位发起过渡（cy 在跟手阶段是陈旧值）
      cy.set(followY());
      cs.set(followS());
      cy.set(withTiming(SLOT_Y[target], timing));
      cs.set(withTiming(SLOT_S[target], timing));
    },
  );

  const animatedStyle = useAnimatedStyle(() => {
    const following = phase.get() === 1;
    return {
      transform: [
        { translateY: following ? followY() : cy.get() },
        { scale: following ? followS() : cs.get() },
      ],
    };
  });

  // 顶卡在流内撑出堆叠高度（三卡结构等高，轮转不引起高度跳变）；
  // 沉底中的顶卡降到所有卡之下（设计稿 sinking 时 zIndex: 0）
  const zIndex = sinking ? 0 : MAX_CARDS - slot;
  const boxStyle =
    slot === 0
      ? { zIndex }
      : { position: "absolute" as const, top: 0, left: 0, right: 0, zIndex };

  const stateColors = toneColors(state.tone, theme);
  const handleTake = () => {
    // 拖动后吞掉松手的点按；下一次触摸 onBegin 会复位 moved
    if (moved) return;
    void (async () => {
      await takeReminder(reminder.id);
      onChanged?.();
    })();
  };

  return (
    <Animated.View
      testID={`stack-card-${reminder.id}`}
      pointerEvents={slot === 0 && !sinking ? "auto" : "none"}
      style={[boxStyle, animatedStyle]}
    >
      <RNView
        style={{
          borderRadius: CARD_RADIUS,
          borderCurve: "continuous",
          borderWidth: 1,
          // 棱线 = accent 与玻璃白边的近似混合
          borderColor: withAlpha(accent, 0.4),
          overflow: "hidden",
          // 阴影用 accent 染色（设计稿 0 18px 34px -18px）；RN 过渡不支持
          // boxShadow，按下加深阴影退化为仅位移浮起
          boxShadow: `0 18px 34px -18px ${withAlpha(accent, 0.42)}`,
          paddingTop: 20,
          paddingHorizontal: 26,
          paddingBottom: 18,
        }}
      >
        {/* 磨砂底：BlurView 实时模糊身后两张卡与页面背景（设计稿
            backdrop-filter: blur(16px) saturate(1.15)）。卡片只有 2D
            translate/scale，UIVisualEffectView 跟随移动不会出残影
            （mini-archive 是 rotateY 3D 期间才需要关掉） */}
        <BlurView
          intensity={CARD_BLUR_INTENSITY}
          style={StyleSheet.absoluteFill}
        />
        {/* 上叠半透明主题色（不透明度按设计稿 color-mix bg 76%/64%）+ accent 染色
            + 斜向白光泽；三者叠加即设计稿的磨砂卡底 */}
        <LinearGradient
          colors={[
            withAlpha(theme.promo.bg, 0.76),
            withAlpha(theme.promo.bg, 0.64),
          ]}
          start={GRAD_160.start}
          end={GRAD_160.end}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[withAlpha(accent, 0.09), withAlpha(accent, 0.13)]}
          start={GRAD_160.start}
          end={GRAD_160.end}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[theme.promo.sheen, "rgba(255,255,255,0)"]}
          locations={[0, 0.46]}
          start={GRAD_135.start}
          end={GRAD_135.end}
          style={StyleSheet.absoluteFill}
        />
        {/* 内高光：玻璃顶棱（设计稿 inset 0 1px 0） */}
        <RNView
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 1,
            backgroundColor: theme.promo.hi,
          }}
        />

        {/* 上段：提醒时间 + 状态徽章 */}
        <RNView
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <RNText
            style={{
              fontFamily: Fonts.mono,
              fontVariant: ["tabular-nums"],
              fontSize: 15,
              fontWeight: "500",
              color: theme.promo.sub,
            }}
          >
            {item.timeLabel}
          </RNText>
          <RNView
            style={{
              borderRadius: 999,
              paddingVertical: 4,
              paddingHorizontal: 10,
              backgroundColor: stateColors.soft,
            }}
          >
            <RNText
              style={{
                fontSize: 12,
                lineHeight: 16,
                fontWeight: "600",
                color: stateColors.color,
              }}
            >
              {state.label}
            </RNText>
          </RNView>
        </RNView>

        {/* 中段：药品名 + 剂量。固定行高给右侧指示器留轨道，
            右内边距避让指示器（右缘 9px 指示条） */}
        <RNView
          onLayout={onMidLayout}
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 22,
            marginBottom: 24,
            minHeight: 104,
          }}
        >
          <RNView style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
            <RNText
              numberOfLines={1}
              style={{
                fontSize: 34,
                lineHeight: 37,
                fontWeight: "800",
                letterSpacing: -1,
                color: theme.promo.ink,
              }}
            >
              {item.title}
            </RNText>
            <RNText
              numberOfLines={1}
              style={{
                marginTop: 8,
                fontSize: 14,
                lineHeight: 20,
                color: theme.promo.sub,
              }}
            >
              {item.doseLine}
            </RNText>
          </RNView>
        </RNView>

        <RNView
          style={{
            height: 1,
            marginBottom: 14,
            backgroundColor: theme.promo.line,
          }}
        />

        {/* 下段：用药人 + 每日频次 / 库存 + 反色主按钮 */}
        <RNView
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <RNView
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              backgroundColor: accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <RNText
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: "#FFFFFF",
              }}
            >
              {item.personName.slice(0, 1)}
            </RNText>
          </RNView>
          <RNView style={{ flex: 1, minWidth: 0 }}>
            <RNText
              numberOfLines={1}
              style={{
                fontSize: 16,
                lineHeight: 19,
                fontWeight: "700",
                color: theme.promo.ink,
              }}
            >
              {item.personName}
            </RNText>
            <RNText
              numberOfLines={1}
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: theme.promo.sub,
              }}
            >
              {item.freqLine}
            </RNText>
            <RNText
              numberOfLines={1}
              style={{
                fontSize: 13,
                lineHeight: 18,
                // 库存告急按项目语义色用 warning（HTML 稿此处为 danger）
                color: item.stockLow ? theme.warning : theme.promo.sub,
              }}
            >
              {item.stockLine}
            </RNText>
          </RNView>
          <Pressable
            testID={`stack-card-take-${reminder.id}`}
            accessibilityRole="button"
            onPress={handleTake}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
          >
            <Animated.View
              style={{
                minHeight: 44,
                paddingHorizontal: 26,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.promo.btnBg,
                transform: [{ scale: pressed ? 0.97 : 1 }],
                transitionProperty: "transform",
                transitionDuration: reduced ? 0 : 100,
                transitionTimingFunction: REBOUND_EASE,
              }}
            >
              <RNText
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.promo.btnFg,
                }}
              >
                {reminder.status === "missed"
                  ? t("reminder.lateTake")
                  : t("reminder.taken")}
              </RNText>
            </Animated.View>
          </Pressable>
        </RNView>
      </RNView>
    </Animated.View>
  );
}

/**
 * Expo UI 导入使用
 * @param param0
 * @returns
 */
export function ReminderCardStackExpoUI(props: ReminderCardStackProps) {
  return (
    <RNHostView matchContents>
      <ReminderCardStack {...props} />
    </RNHostView>
  );
}
