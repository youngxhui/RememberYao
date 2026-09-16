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

/** 服用记录：点击“已服用”后产生 */
export type MedicationUsage = {
  id: string;
  reminderId: string;
  planId: string;
  medicationId: string;
  personId: string;
  /** 实际服用的数量 */
  amount: number;
  /** 实际服用时间 ISO */
  takenAt: string;
  createdAt: string;
};

type AppData = {
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
  return ["08:00", "13:00", "19:00", "21:00"].slice(0, count);
}

export function compareTime(a: string, b: string): number {
  return a.localeCompare(b);
}

// ─── 存储读写 ─────────────────────────────────────────────

const STORAGE_KEY = "rememberyao-data-v1";
const LEGACY_MEDICINES_KEY = "medicines";

let cache: AppData | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 旧版单实体“药品”数据，用于一次性迁移。 */
type LegacyMedicine = {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  quantity: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

async function migrateLegacy(data: AppData): Promise<AppData> {
  if (data.medications.length > 0) return data;
  try {
    const raw = await AsyncStorage.getItem(LEGACY_MEDICINES_KEY);
    if (!raw) return data;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return data;
    const medications = (parsed as LegacyMedicine[]).map((m) => {
      const quantity = Number.parseInt(m.quantity, 10);
      const safeQuantity = Number.isFinite(quantity) ? quantity : 0;
      const extraNotes = [m.dosage && `剂量：${m.dosage}`, m.frequency && `频次：${m.frequency}`]
        .filter(Boolean)
        .join("，");
      return {
        id: m.id,
        name: m.name,
        type: "bottle" as const,
        unit: "tablet" as const,
        totalQuantity: safeQuantity,
        remainingQuantity: safeQuantity,
        notes: [m.notes, extraNotes].filter(Boolean).join("\n"),
        createdAt: m.createdAt ?? nowIso(),
        updatedAt: m.updatedAt ?? nowIso(),
      };
    });
    await AsyncStorage.removeItem(LEGACY_MEDICINES_KEY);
    return { ...data, medications };
  } catch {
    return data;
  }
}

async function readData(): Promise<AppData> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AppData) : EMPTY_DATA;
    cache = await migrateLegacy({ ...EMPTY_DATA, ...parsed });
  } catch {
    cache = EMPTY_DATA;
  }
  return cache;
}

/** 串行写盘，避免并发读写交错。 */
async function writeData(data: AppData): Promise<void> {
  cache = data;
  writeQueue = writeQueue.then(() =>
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  );
  await writeQueue;
}

async function updateData(mutator: (data: AppData) => AppData): Promise<AppData> {
  const next = mutator(await readData());
  await writeData(next);
  return next;
}

// ─── 提醒生成与状态同步 ───────────────────────────────────

/** 提前生成的天数（含今天） */
const GENERATE_AHEAD_DAYS = 7;

function planActiveOnDate(plan: MedicationPlan, key: string): boolean {
  if (!plan.enabled) return false;
  if (key < plan.startDate) return false;
  if (plan.endDate && key > plan.endDate) return false;
  return true;
}

/**
 * 同步提醒：
 * 1. 为每个启用中的配置生成 今天 ~ 今天+7天 的提醒（幂等，不重复生成）
 * 2. 已过期仍未处理的提醒标记为“漏服”
 */
function syncRemindersIn(data: AppData): AppData {
  const today = todayKey();
  const existing = new Set(
    data.reminders.map((r) => `${r.planId}|${r.date}|${r.time}`)
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
  const updated = data.reminders.map((r) => {
    if (r.status !== "pending") return r;
    const [y, m, d] = r.date.split("-").map(Number);
    const [hh, mm] = r.time.split(":").map(Number);
    const scheduled = new Date(y, m - 1, d, hh, mm);
    return scheduled < now ? { ...r, status: "missed" as const } : r;
  });

  return { ...data, reminders: [...updated, ...newReminders] };
}

export async function syncReminders(): Promise<void> {
  await updateData(syncRemindersIn);
}

// ─── 药品 CRUD ────────────────────────────────────────────

export async function addMedication(
  input: Omit<Medication, "id" | "createdAt" | "updatedAt">
): Promise<Medication> {
  const now = nowIso();
  const medication: Medication = { ...input, id: genId(), createdAt: now, updatedAt: now };
  await updateData((data) => ({
    ...data,
    medications: [medication, ...data.medications],
  }));
  return medication;
}

export async function updateMedication(
  id: string,
  patch: Partial<Omit<Medication, "id" | "createdAt">>
): Promise<void> {
  await updateData((data) => ({
    ...data,
    medications: data.medications.map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: nowIso() } : m
    ),
  }));
}

/** 删除药品：级联删除相关配置、提醒和服用记录 */
export async function deleteMedication(id: string): Promise<void> {
  await updateData((data) => {
    const planIds = new Set(
      data.plans.filter((p) => p.medicationId === id).map((p) => p.id)
    );
    return {
      ...data,
      medications: data.medications.filter((m) => m.id !== id),
      plans: data.plans.filter((p) => p.medicationId !== id),
      reminders: data.reminders.filter((r) => !planIds.has(r.planId)),
      usages: data.usages.filter((u) => u.medicationId !== id),
    };
  });
}

// ─── 用药人 CRUD ──────────────────────────────────────────

export async function addPerson(name: string): Promise<Person> {
  const person: Person = {
    id: genId(),
    name: name.trim(),
    avatarColor:
      PERSON_AVATAR_COLORS[Math.floor(Math.random() * PERSON_AVATAR_COLORS.length)],
    createdAt: nowIso(),
  };
  await updateData((data) => ({ ...data, persons: [...data.persons, person] }));
  return person;
}

export async function updatePerson(id: string, name: string): Promise<void> {
  await updateData((data) => ({
    ...data,
    persons: data.persons.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)),
  }));
}

/** 删除用药人：级联删除其配置、提醒和服用记录 */
export async function deletePerson(id: string): Promise<void> {
  await updateData((data) => {
    const planIds = new Set(
      data.plans.filter((p) => p.personId === id).map((p) => p.id)
    );
    return {
      ...data,
      persons: data.persons.filter((p) => p.id !== id),
      plans: data.plans.filter((p) => p.personId !== id),
      reminders: data.reminders.filter((r) => !planIds.has(r.planId)),
      usages: data.usages.filter((u) => u.personId !== id),
    };
  });
}

// ─── 用药配置 CRUD ────────────────────────────────────────

export async function addPlan(
  input: Omit<MedicationPlan, "id" | "createdAt" | "updatedAt">
): Promise<MedicationPlan> {
  const now = nowIso();
  const plan: MedicationPlan = { ...input, id: genId(), createdAt: now, updatedAt: now };
  await updateData((data) => syncRemindersIn({ ...data, plans: [...data.plans, plan] }));
  return plan;
}

export async function updatePlan(
  id: string,
  patch: Partial<Omit<MedicationPlan, "id" | "createdAt">>
): Promise<void> {
  await updateData((data) =>
    syncRemindersIn({
      ...data,
      plans: data.plans.map((p) =>
        p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p
      ),
    })
  );
}

export async function deletePlan(id: string): Promise<void> {
  await updateData((data) => ({
    ...data,
    plans: data.plans.filter((p) => p.id !== id),
    reminders: data.reminders.filter((r) => r.planId !== id),
  }));
}

// ─── 提醒处理（核心闭环） ─────────────────────────────────

/** 已服用：生成服用记录并扣减库存 */
export async function takeReminder(id: string): Promise<void> {
  const takenAt = nowIso();
  await updateData((data) => {
    const reminder = data.reminders.find((r) => r.id === id);
    if (!reminder || reminder.status !== "pending") return data;
    const usage: MedicationUsage = {
      id: genId(),
      reminderId: reminder.id,
      planId: reminder.planId,
      medicationId: reminder.medicationId,
      personId: reminder.personId,
      amount: reminder.doseAmount,
      takenAt,
      createdAt: takenAt,
    };
    return {
      ...data,
      reminders: data.reminders.map((r) =>
        r.id === id ? { ...r, status: "taken", resolvedAt: takenAt } : r
      ),
      usages: [usage, ...data.usages],
      medications: data.medications.map((m) =>
        m.id === reminder.medicationId
          ? {
              ...m,
              remainingQuantity: Math.max(0, m.remainingQuantity - reminder.doseAmount),
              updatedAt: takenAt,
            }
          : m
      ),
    };
  });
}

/** 跳过本次提醒 */
export async function skipReminder(id: string): Promise<void> {
  const resolvedAt = nowIso();
  await updateData((data) => ({
    ...data,
    reminders: data.reminders.map((r) =>
      r.id === id && r.status === "pending"
        ? { ...r, status: "skipped", resolvedAt }
        : r
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

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...data, loading, reload };
}
