import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import {
  loadData,
  medicationUnitLabel,
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

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "用药提醒",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: BRAND_COLOR,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: ACTION_TAKEN,
      buttonTitle: "已服用",
      options: { opensAppToForeground: true },
    },
    {
      identifier: ACTION_SKIP,
      buttonTitle: "跳过",
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
 * - 未到点的提醒按计划时间触发
 * - 已到点但仍在宽限期内的提醒，改在宽限期结束时再提醒一次
 */
export async function rescheduleReminders(data: AppData): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now = Date.now();
  const medications = new Map(data.medications.map((m) => [m.id, m]));
  const persons = new Map(data.persons.map((p) => [p.id, p]));

  for (const reminder of data.reminders) {
    if (reminder.status !== "pending") continue;
    const due = reminderDueDate(reminder).getTime();
    const at = due > now ? due : reminderMissDate(reminder).getTime();
    if (at <= now) continue;
    const overdue = due <= now;
    const medication = medications.get(reminder.medicationId);
    const person = persons.get(reminder.personId);
    const content = {
      title: overdue ? "该吃药了（已超时）" : "该吃药了",
      body: `${person?.name ?? "家人"} · ${medication?.name ?? "药品"} ${
        reminder.doseAmount
      }${medication ? medicationUnitLabel(medication.unit) : ""}`,
      data: { reminderId: reminder.id },
      color: BRAND_COLOR,
      sound: true,
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

let syncChain: Promise<void> = Promise.resolve();

/** 读取最新数据并重排通知；串行执行，连续变更会合并为几次重排 */
export function syncNotificationsWithStore(): Promise<void> {
  syncChain = syncChain
    .then(async () => {
      const data = await loadData();
      await rescheduleReminders(data);
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
