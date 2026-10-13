import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { getTranslator } from "@/i18n";

import {
  dateToTime,
  inQuietHours,
  loadData,
  medicationUnitLabel,
  missedStreaks,
  reminderDueDate,
  reminderMissDate,
  skipReminder,
  takeReminder,
  type AppData,
} from "./store";

const CHANNEL_ID = "medication-reminders";
const CATEGORY_ID = "medication-reminder";
export const ACTION_TAKEN = "action-taken";
export const ACTION_SKIP = "action-skip";

const BRAND_COLOR = "#0F766E";

let initialized = false;

/**
 * 初始化通知能力：
 * - 前台收到通知时也展示横幅
 * - Android 注册高优先级渠道（震动、锁屏可见）
 * - 注册“已服用 / 跳过”操作按钮分类
 */
export async function initNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  await registerLocalizedNotificationTexts();
}

/**
 * 注册带文案的渠道与操作按钮分类。
 * 单独抽出来是因为语言切换后要重跑一次，否则通知栏仍显示旧语言的按钮。
 */
export async function registerLocalizedNotificationTexts(): Promise<void> {
  const t = getTranslator();

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t("notification.channelName"),
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: BRAND_COLOR,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: ACTION_TAKEN,
      buttonTitle: t("notification.actionTaken"),
      options: { opensAppToForeground: true },
    },
    {
      identifier: ACTION_SKIP,
      buttonTitle: t("notification.actionSkip"),
      options: { opensAppToForeground: true },
    },
  ]);
}

/** 当前是否已获得通知权限 */
export async function isNotificationEnabled(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/** 请求通知权限；已授权时直接返回 true */
export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * 按当前数据重排全部未来的提醒通知：
 * 先取消全部已调度通知，再为每个待服用提醒调度一条。
 * - 设置里的「通知」总开关关闭时，只清空不调度
 * - 未到点的提醒按计划时间触发
 * - 已到点但仍在宽限期内的提醒，改在宽限期结束时再提醒一次
 * - 命中「稍后提醒」的推迟时刻时，以推迟时刻为准（不早于原定提醒时间）
 * - 落在免打扰时段内的提醒仍然调度，但静音（只横幅不响铃）
 */
export async function rescheduleReminders(data: AppData): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const t = getTranslator();
  const now = Date.now();
  const medications = new Map(data.medications.map((m) => [m.id, m]));
  const persons = new Map(data.persons.map((p) => [p.id, p]));
  // 总开关关掉就到此为止：清空已排的，未来的也不再排。
  // 这里必须 return，否则会顺手把静音/免打扰的判断也跳过了
  if (!data.settings.notificationsEnabled) return;

  for (const reminder of data.reminders) {
    if (reminder.status !== "pending") continue;
    const due = reminderDueDate(reminder).getTime();
    const snoozed = reminder.snoozedUntil
      ? new Date(reminder.snoozedUntil).getTime()
      : 0;
    const at = Math.max(
      due > now ? due : reminderMissDate(reminder).getTime(),
      snoozed > now ? snoozed : 0,
    );
    if (at <= now) continue;
    const overdue = due <= now;
    const medication = medications.get(reminder.medicationId);
    const person = persons.get(reminder.personId);
    // 免打扰只压掉声音，不压掉通知本身 —— 漏服是安全相关的事，
    // 静默到「用户完全不知道漏了」比吵醒人更糟
    const silent =
      !data.settings.soundEnabled ||
      inQuietHours(data.settings, dateToTime(new Date(at)));
    const content = {
      title: overdue ? t("notification.titleOverdue") : t("notification.title"),
      body: t("notification.body", {
        person: person?.name ?? t("notification.defaultPerson"),
        medication: medication?.name ?? t("notification.defaultMedication"),
        amount: `${reminder.doseAmount}${
          medication ? medicationUnitLabel(medication.unit, t) : ""
        }`,
      }),
      data: { reminderId: reminder.id },
      color: BRAND_COLOR,
      sound: !silent,
      categoryIdentifier: CATEGORY_ID,
    };
    // Android 优先按精确闹钟调度（到点准时不延迟），不可用时退回普通调度
    const attempts =
      Platform.OS === "android"
        ? [{ delivery: "alarmClock" as const }, {}]
        : [{}];
    for (const attempt of attempts) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: reminder.id,
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: at,
            channelId: CHANNEL_ID,
            ...attempt,
          },
        });
        break;
      } catch {
        // 单条调度失败不影响其余提醒，下次同步会重试
      }
    }
  }
}

/**
 * playground 调试用：几秒后发一条形状与真实提醒一致的测试通知。
 *
 * 刻意不挂 reminderId —— 通知栏的「已服用 / 跳过」按钮仍会出现（可验证
 * 分类与文案重注册），但点了不会去改 store 里的真实数据。
 */
export async function sendTestNotification(delaySeconds = 5): Promise<void> {
  const t = getTranslator();
  await requestNotificationPermission();
  await Notifications.scheduleNotificationAsync({
    identifier: `test-${Date.now()}`,
    content: {
      title: t("notification.title"),
      body: t("notification.body", {
        person: t("notification.defaultPerson"),
        medication: t("notification.defaultMedication"),
        amount: "1",
      }),
      color: BRAND_COLOR,
      sound: true,
      categoryIdentifier: CATEGORY_ID,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: delaySeconds,
      repeats: false,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

let syncChain: Promise<void> = Promise.resolve();

/** 上一轮同步时已提醒过的「连续漏服」成员，避免每次重排都重复弹一条 */
let alertedStreaks = new Set<string>();

/**
 * 补一条「某人连续漏服」的即时通知。
 *
 * 与常规提醒分开：它不挂在某个具体剂量上，而是在重排时发现成员的漏服
 * 连击达到阈值就立刻发一次。用 `alertedStreaks` 记住已提醒的人，
 * 只有当连击「重新攒起来」时才会再响，避免每次重排都刷屏。
 */
async function notifyMissedStreaks(data: AppData): Promise<void> {
  const { missedAlertStreak, soundEnabled } = data.settings;
  const t = getTranslator();

  // 阈值关掉时清空记忆，用户重新打开后不会收到一串补发的提醒
  if (missedAlertStreak <= 0) {
    alertedStreaks = new Set();
    return;
  }
  if (!data.settings.notificationsEnabled) return;

  const streaks = missedStreaks(data.reminders, missedAlertStreak);
  // 本轮不再命中的成员（用户已经处理完了）从记忆里移除，
  // 这样下次重新攒够会正常再提醒
  for (const personId of alertedStreaks) {
    if (!streaks.has(personId)) alertedStreaks.delete(personId);
  }

  const fresh = [...streaks].filter((id) => !alertedStreaks.has(id));
  if (fresh.length === 0) return;
  alertedStreaks = streaks;

  const names = fresh
    .map((id) => data.persons.find((p) => p.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: `missed-streak-${fresh.join(",")}`,
      content: {
        title: t("notification.missedStreakTitle"),
        body: t("notification.missedStreakBody", {
          person: names.join("、"),
          count: missedAlertStreak,
        }),
        color: BRAND_COLOR,
        sound: soundEnabled,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
    });
  } catch {
    // 补发失败不影响常规提醒调度
  }
}

/** 读取最新数据并重排通知；串行执行，连续变更会合并为几次重排 */
export function syncNotificationsWithStore(): Promise<void> {
  syncChain = syncChain
    .then(async () => {
      const data = await loadData();
      await rescheduleReminders(data);
      await notifyMissedStreaks(data);
      return undefined;
    })
    .catch(() => {});
  return syncChain;
}

/**
 * 监听通知交互：点击“已服用 / 跳过”按钮后直接落库并重排通知。
 * 点击通知本体（打开 App）无需处理，由 App 内界面操作。
 */
export function addNotificationResponseListener(): { remove: () => void } {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const reminderId = response.notification.request.content.data?.reminderId;
    if (typeof reminderId !== "string") return;
    const action = response.actionIdentifier;
    if (action !== ACTION_TAKEN && action !== ACTION_SKIP) return;
    void (async () => {
      try {
        if (action === ACTION_TAKEN) {
          await takeReminder(reminderId);
        } else {
          await skipReminder(reminderId);
        }
      } finally {
        await syncNotificationsWithStore();
      }
    })();
  });
}
