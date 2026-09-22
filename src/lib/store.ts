import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

// ─── 实体定义 ───────────────────────────────────────────────

/** 药品类型：板装 / 瓶装 / 散装 */
export type MedicationType = "blister" | "bottle" | "loose";
/** 单位：片 / 粒 */
export type MedicationUnit = "tablet" | "pill";

/** 药品：家里的实际药品和库存 */
export type Medication = {
  id: string;
  name: string;
  type: MedicationType;
  unit: MedicationUnit;
  /** 总数量（入库时的数量） */
  totalQuantity: number;
  /** 当前剩余数量 */
  remainingQuantity: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

/** 用药人：家庭中的具体用药人 */
export type Person = {
  id: string;
  name: string;
  /** 头像底色（取姓名首字展示） */
  avatarColor: string;
  createdAt: string;
};

/** 用药配置：谁吃什么药、怎么吃 */
export type MedicationPlan = {
  id: string;
  medicationId: string;
  personId: string;
  /** 每次剂量（单位：药品单位，片/粒） */
  doseAmount: number;
  /** 每日具体服用时间 "HH:MM"，数组长度即每日次数 */
  times: string[];
  /** 开始日期 YYYY-MM-DD */
  startDate: string;
  /** 结束日期 YYYY-MM-DD，null 表示长期 */
  endDate: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReminderStatus = "pending" | "taken" | "skipped" | "missed";

/** 提醒：根据用药配置生成的某一次具体提醒 */
export type Reminder = {
  id: string;
  planId: string;
  medicationId: string;
  personId: string;
  /** 提醒日期 YYYY-MM-DD */
  date: string;
  /** 提醒时间 HH:MM */
  time: string;
  doseAmount: number;
  status: ReminderStatus;
  /** 已服用/跳过的处理时间 ISO */
  resolvedAt?: string;
  createdAt: string;
};

/** 服用记录：点击“已服用”后产生。
 *  name / time 为创建时的快照，药品或用料人被删除后历史记录仍可读。 */
export type MedicationUsage = {
  id: string;
  reminderId: string;
  planId: string;
  medicationId: string;
  personId: string;
  /** 快照：用药人姓名 */
  personName: string;
  /** 快照：药品名称 */
  medicationName: string;
  /** 快照：计划中的服用时间 "HH:MM" */
  time: string;
  /** 实际服用的数量 */
  amount: number;
  /** 是否漏服后补记 */
  late?: boolean;
  /** 实际服用时间 ISO */
  takenAt: string;
  createdAt: string;
};

export type AppData = {
  medications: Medication[];
  persons: Person[];
  plans: MedicationPlan[];
  reminders: Reminder[];
  usages: MedicationUsage[];
};

const EMPTY_DATA: AppData = {
  medications: [],
  persons: [],
  plans: [],
  reminders: [],
  usages: [],
};

// ─── 常量 ─────────────────────────────────────────────────

export const MEDICATION_TYPES: { value: MedicationType; label: string }[] = [
  { value: "blister", label: "板装" },
  { value: "bottle", label: "瓶装" },
  { value: "loose", label: "散装" },
];

export const MEDICATION_UNITS: { value: MedicationUnit; label: string }[] = [
  { value: "tablet", label: "片" },
  { value: "pill", label: "粒" },
];

export const PERSON_AVATAR_COLORS = [
  "#0F766E",
  "#D97706",
  "#DC2626",
  "#2563EB",
  "#7C3AED",
  "#DB2777",
];

/** 宽限期（分钟）：到点后这么久仍未处理才标记为漏服 */
export const GRACE_MINUTES = 60;

/** 提醒保留天数：更早的已处理提醒会被清理，服用记录永久保留 */
const REMINDER_KEEP_DAYS = 90;

/** 低库存阈值：按当前计划估算剩余可服用天数 ≤ 该值时视为库存不足 */
export const LOW_STOCK_DAYS = 3;

export function medicationTypeLabel(type: MedicationType): string {
  return MEDICATION_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function medicationUnitLabel(unit: MedicationUnit): string {
  return MEDICATION_UNITS.find((u) => u.value === unit)?.label ?? unit;
}

// ─── 日期/时间工具 ─────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → 本地 YYYY-MM-DD */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

/** YYYY-MM-DD ± n 天 */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

/** 解析 "YYYY-MM-DD" + "HH:MM" 为本地 Date */
export function parseDateTime(key: string, time: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hours, minutes, 0, 0);
}

/** 提醒的计划服用时间 */
export function reminderDueDate(reminder: Reminder): Date {
  return parseDateTime(reminder.date, reminder.time);
}

/** 提醒的漏服判定时间（计划时间 + 宽限期） */
export function reminderMissDate(reminder: Reminder): Date {
  return new Date(
    reminderDueDate(reminder).getTime() + GRACE_MINUTES * 60 * 1000,
  );
}

export function timeToDate(time: string): Date {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

export function dateToTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultTimes(count: number): string[] {
  return ["08:00", "12:00", "18:00", "21:00", "10:00", "15:00"].slice(0, count);
}

export function compareTime(a: string, b: string): number {
  return a.localeCompare(b);
}

// ─── 存储读写 ─────────────────────────────────────────────

const STORAGE_KEY = "rememberyao-data-v1";

let cache: AppData | null = null;
let writeQueue: Promise<void> = Promise.resolve();

/** 数据变更后的全局钩子（用于通知重排），由根布局注册 */
let postMutationHook: (() => void) | null = null;

export function setPostMutationHook(hook: (() => void) | null): void {
  postMutationHook = hook;
}

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 兼容旧数据：补全服用记录的快照字段 */
function normalizeData(data: AppData): AppData {
  if (data.usages.every((u) => u.medicationName && u.personName && u.time)) {
    return data;
  }
  const usages = data.usages.map((u) => {
    const medication = data.medications.find((m) => m.id === u.medicationId);
    const person = data.persons.find((p) => p.id === u.personId);
    const reminder = data.reminders.find((r) => r.id === u.reminderId);
    return {
      ...u,
      medicationName: u.medicationName ?? medication?.name ?? "已删除的药品",
      personName: u.personName ?? person?.name ?? "已删除的用药人",
      time: u.time ?? reminder?.time ?? "",
      late: u.late ?? false,
    };
  });
  return { ...data, usages };
}

async function readData(): Promise<AppData> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AppData) : EMPTY_DATA;
    cache = normalizeData({ ...EMPTY_DATA, ...parsed });
  } catch {
    cache = EMPTY_DATA;
  }
  return cache;
}

/** 串行写盘；单次失败重试一次，避免写队列被 rejection 污染 */
async function persist(payload: string, attempt = 0): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, payload);
  } catch (error) {
    if (attempt >= 1) throw error;
    await persist(payload, attempt + 1);
  }
}

async function writeData(data: AppData): Promise<void> {
  cache = data;
  const payload = JSON.stringify(data);
  writeQueue = writeQueue.catch(() => {}).then(() => persist(payload));
  try {
    await writeQueue;
  } catch {
    // 磁盘写入失败时保留内存态，下次变更会再次尝试落盘
    console.warn("数据写入失败，将在下次变更时重试");
  }
}

async function updateData(
  mutator: (data: AppData) => AppData,
): Promise<AppData> {
  const next = mutator(await readData());
  await writeData(next);
  postMutationHook?.();
  return next;
}

/** 读取（不经过 React）并同步提醒，供通知调度等非 UI 场景使用 */
export async function loadData(): Promise<AppData> {
  const raw = await readData();
  const synced = syncRemindersIn(raw);
  if (synced !== raw) {
    await writeData(synced);
    postMutationHook?.();
  }
  return synced;
}

// ─── 提醒生成与状态同步 ───────────────────────────────────

/** 提前生成的天数（含今天） */
const GENERATE_AHEAD_DAYS = 7;

/** 配置在指定日期是否生效 */
export function planActiveOnDate(plan: MedicationPlan, key: string): boolean {
  if (!plan.enabled) return false;
  if (key < plan.startDate) return false;
  if (plan.endDate && key > plan.endDate) return false;
  return true;
}

/** 配置的展示状态：停用 / 已结束 / 服用中 */
export function planStatusLabel(plan: MedicationPlan): string {
  if (!plan.enabled) return "已停用";
  if (plan.endDate && plan.endDate < todayKey()) return "已结束";
  return "服用中";
}

/**
 * 同步提醒（幂等，无变更时返回原引用）：
 * 1. 为每个生效中的配置生成 今天 ~ 今天+6天 的提醒（不重复生成）
 * 2. 超过宽限期仍未处理的提醒标记为“漏服”
 * 3. 清理过早的已处理提醒（服用记录永久保留）
 */
function syncRemindersIn(data: AppData): AppData {
  const today = todayKey();
  const existing = new Set(
    data.reminders.map((r) => `${r.planId}|${r.date}|${r.time}`),
  );
  const newReminders: Reminder[] = [];
  for (const plan of data.plans) {
    for (let i = 0; i < GENERATE_AHEAD_DAYS; i++) {
      const key = addDays(today, i);
      if (!planActiveOnDate(plan, key)) continue;
      for (const time of plan.times) {
        const idKey = `${plan.id}|${key}|${time}`;
        if (existing.has(idKey)) continue;
        existing.add(idKey);
        newReminders.push({
          id: genId(),
          planId: plan.id,
          medicationId: plan.medicationId,
          personId: plan.personId,
          date: key,
          time,
          doseAmount: plan.doseAmount,
          status: "pending",
          createdAt: nowIso(),
        });
      }
    }
  }

  const now = new Date();
  let missedChanged = false;
  const marked = data.reminders.map((r) => {
    if (r.status !== "pending") return r;
    if (reminderMissDate(r) < now) {
      missedChanged = true;
      return { ...r, status: "missed" as const, resolvedAt: nowIso() };
    }
    return r;
  });

  const cutoff = addDays(today, -REMINDER_KEEP_DAYS);
  const pruned = marked.filter((r) => r.date >= cutoff);
  const prunedChanged = pruned.length !== marked.length;

  if (newReminders.length === 0 && !missedChanged && !prunedChanged) {
    return data;
  }
  return { ...data, reminders: [...pruned, ...newReminders] };
}

export async function syncReminders(): Promise<void> {
  await updateData(syncRemindersIn);
}

// ─── 库存 ─────────────────────────────────────────────────

/** 按当前生效配置估算某药品的消耗与剩余天数 */
export function stockSummary(
  medication: Medication,
  plans: MedicationPlan[],
): { dailyDose: number; daysLeft: number | null; low: boolean } {
  const today = todayKey();
  const dailyDose = plans
    .filter(
      (p) => p.medicationId === medication.id && planActiveOnDate(p, today),
    )
    .reduce((sum, p) => sum + p.doseAmount * p.times.length, 0);
  const daysLeft =
    dailyDose > 0 ? Math.floor(medication.remainingQuantity / dailyDose) : null;
  return {
    dailyDose,
    daysLeft,
    low: daysLeft !== null && daysLeft <= LOW_STOCK_DAYS,
  };
}

/** 补货：增加总数量与剩余数量 */
export async function restockMedication(
  id: string,
  amount: number,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await updateData((data) => ({
    ...data,
    medications: data.medications.map((m) =>
      m.id === id
        ? {
            ...m,
            totalQuantity: m.totalQuantity + amount,
            remainingQuantity: m.remainingQuantity + amount,
            updatedAt: nowIso(),
          }
        : m,
    ),
  }));
}

// ─── 药品 CRUD ────────────────────────────────────────────

export async function addMedication(
  input: Omit<Medication, "id" | "createdAt" | "updatedAt">,
): Promise<Medication> {
  const now = nowIso();
  const medication: Medication = {
    ...input,
    id: genId(),
    createdAt: now,
    updatedAt: now,
  };
  await updateData((data) => ({
    ...data,
    medications: [medication, ...data.medications],
  }));
  return medication;
}

export async function updateMedication(
  id: string,
  patch: Partial<Omit<Medication, "id" | "createdAt">>,
): Promise<void> {
  await updateData((data) => ({
    ...data,
    medications: data.medications.map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: nowIso() } : m,
    ),
  }));
}

/** 删除药品：级联删除配置和提醒；服用记录作为历史永久保留 */
export async function deleteMedication(id: string): Promise<void> {
  await updateData((data) => {
    const planIds = new Set(
      data.plans.filter((p) => p.medicationId === id).map((p) => p.id),
    );
    return {
      ...data,
      medications: data.medications.filter((m) => m.id !== id),
      plans: data.plans.filter((p) => p.medicationId !== id),
      reminders: data.reminders.filter((r) => !planIds.has(r.planId)),
    };
  });
}

// ─── 用药人 CRUD ──────────────────────────────────────────

export async function addPerson(name: string): Promise<Person> {
  const now = nowIso();
  const next = await updateData((data) => {
    const person: Person = {
      id: genId(),
      name: name.trim(),
      // 头像底色按当前人数顺序取色，保证稳定不随机
      avatarColor:
        PERSON_AVATAR_COLORS[data.persons.length % PERSON_AVATAR_COLORS.length],
      createdAt: now,
    };
    return { ...data, persons: [...data.persons, person] };
  });
  return next.persons[next.persons.length - 1];
}

export async function updatePerson(id: string, name: string): Promise<void> {
  await updateData((data) => ({
    ...data,
    persons: data.persons.map((p) =>
      p.id === id ? { ...p, name: name.trim() } : p,
    ),
  }));
}

/** 删除用药人：级联删除配置和提醒；服用记录作为历史永久保留 */
export async function deletePerson(id: string): Promise<void> {
  await updateData((data) => {
    const planIds = new Set(
      data.plans.filter((p) => p.personId === id).map((p) => p.id),
    );
    return {
      ...data,
      persons: data.persons.filter((p) => p.id !== id),
      plans: data.plans.filter((p) => p.personId !== id),
      reminders: data.reminders.filter((r) => !planIds.has(r.planId)),
    };
  });
}

// ─── 用药配置 CRUD ────────────────────────────────────────

export async function addPlan(
  input: Omit<MedicationPlan, "id" | "createdAt" | "updatedAt">,
): Promise<MedicationPlan> {
  const now = nowIso();
  const plan: MedicationPlan = {
    ...input,
    id: genId(),
    createdAt: now,
    updatedAt: now,
  };
  await updateData((data) =>
    syncRemindersIn({ ...data, plans: [...data.plans, plan] }),
  );
  return plan;
}

/**
 * 更新配置：废弃该配置尚未处理的提醒，再按新配置重新生成。
 * 这样修改时间/剂量/停用都会立即反映到未来的提醒上；
 * 已服用/已跳过/已漏服的记录作为历史保留。
 */
export async function updatePlan(
  id: string,
  patch: Partial<Omit<MedicationPlan, "id" | "createdAt">>,
): Promise<void> {
  await updateData((data) => {
    const plans = data.plans.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p,
    );
    if (!plans.some((p) => p.id === id)) return data;
    const reminders = data.reminders.filter(
      (r) => !(r.planId === id && r.status === "pending"),
    );
    return syncRemindersIn({ ...data, plans, reminders });
  });
}

/** 删除配置：删除其提醒；服用记录作为历史永久保留 */
export async function deletePlan(id: string): Promise<void> {
  await updateData((data) => ({
    ...data,
    plans: data.plans.filter((p) => p.id !== id),
    reminders: data.reminders.filter((r) => r.planId !== id),
  }));
}

// ─── 提醒处理（核心闭环） ─────────────────────────────────

/**
 * 已服用：生成服用记录并扣减库存。
 * 待服用和漏服状态都可以补记（漏服补记会标记 late）。
 */
export async function takeReminder(id: string): Promise<void> {
  const takenAt = nowIso();
  await updateData((data) => {
    const reminder = data.reminders.find((r) => r.id === id);
    if (
      !reminder ||
      (reminder.status !== "pending" && reminder.status !== "missed")
    ) {
      return data;
    }
    const medication = data.medications.find(
      (m) => m.id === reminder.medicationId,
    );
    const person = data.persons.find((p) => p.id === reminder.personId);
    const usage: MedicationUsage = {
      id: genId(),
      reminderId: reminder.id,
      planId: reminder.planId,
      medicationId: reminder.medicationId,
      personId: reminder.personId,
      personName: person?.name ?? "已删除的用药人",
      medicationName: medication?.name ?? "已删除的药品",
      time: reminder.time,
      amount: reminder.doseAmount,
      late: reminder.status === "missed",
      takenAt,
      createdAt: takenAt,
    };
    return {
      ...data,
      reminders: data.reminders.map((r) =>
        r.id === id
          ? { ...r, status: "taken" as const, resolvedAt: takenAt }
          : r,
      ),
      usages: [usage, ...data.usages],
      medications: data.medications.map((m) =>
        m.id === reminder.medicationId
          ? {
              ...m,
              remainingQuantity: Math.max(
                0,
                m.remainingQuantity - reminder.doseAmount,
              ),
              updatedAt: takenAt,
            }
          : m,
      ),
    };
  });
}

/** 跳过本次提醒（待服用和漏服都可以标记为跳过），不扣减库存 */
export async function skipReminder(id: string): Promise<void> {
  const resolvedAt = nowIso();
  await updateData((data) => ({
    ...data,
    reminders: data.reminders.map((r) =>
      r.id === id && (r.status === "pending" || r.status === "missed")
        ? { ...r, status: "skipped" as const, resolvedAt }
        : r,
    ),
  }));
}

// ─── React Hook ───────────────────────────────────────────

export function useAppData() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const raw = await readData();
    const synced = syncRemindersIn(raw);
    if (synced !== raw) {
      await writeData(synced);
      setData(synced);
    } else {
      setData(raw);
    }
    setLoading(false);
  }, []);

  // 首次挂载时从 AsyncStorage 载入数据 —— 这正是 effect 的用途（与外部系统同步）。
  // reload() 是 async，setState 发生在 await 之后的微任务里，并非同步调用，
  // 不会引发级联渲染；react/set-state-in-effect 看不穿 async 边界，此处为误报
  // （oxlint 行内禁用对该规则无效，故在 .oxlintrc.json 用 overrides 关闭）。
  useEffect(() => {
    reload();
  }, [reload]);

  return { ...data, loading, reload };
}
