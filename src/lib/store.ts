import { useCallback, useEffect, useState } from "react";

import { replaceAll, selectAll, type PersistedData } from "@/db/repo";
import { getTranslator, type Path, type Translate } from "@/i18n";

// ─── 实体定义 ───────────────────────────────────────────────

/** 药品类型：板装 / 瓶装 / 散装 */
export type MedicationType = "blister" | "bottle" | "loose";
/** 药品用途分类：慢性病 / 临时用药 / 保健品（药品库列表按它筛选） */
export type MedicationCategory = "chronic" | "acute" | "supplement";
/** 单位：片 / 粒 */
export type MedicationUnit = "tablet" | "pill";

/** 药品：家里的实际药品和库存 */
export type Medication = {
  id: string;
  name: string;
  type: MedicationType;
  /** 用途分类。与 `type`（包装形式）是两个维度，不要混 */
  category: MedicationCategory;
  /** 规格，如 "10mg/片"。自由文本，没有统一取值表 */
  specification: string;
  unit: MedicationUnit;
  /** 总数量（入库时的数量） */
  totalQuantity: number;
  /** 当前剩余数量 */
  remainingQuantity: number;
  /** 有效期 "YYYY-MM-DD"，null 表示未记录 */
  expiryDate: string | null;
  /** 是否处方药 */
  prescription: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

/** 用药人：家庭中的具体用药人 */
/** 性别枚举；存库为 TEXT，UI 侧本地化 */
export type Gender = "male" | "female" | "other";

export type Person = {
  id: string;
  name: string;
  /** 头像底色（取姓名首字展示） */
  avatarColor: string;
  /** 性别；未填写为 undefined */
  gender?: Gender;
  /** 年龄（周岁）；未填写为 undefined */
  age?: number;
  /** 过敏原列表；空数组表示未填写 */
  allergies: string[];
  /** 基础病 / 慢性病史列表；空数组表示未填写 */
  underlyingConditions: string[];
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
  /** 「稍后提醒」：把本次通知推迟到该时刻再响 ISO。未设置时按计划时间提醒 */
  snoozedUntil?: string;
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

/**
 * 全局设置偏好。
 *
 * 独立于业务实体存在：这些开关影响通知调度，但不属于任何药品或用药人。
 * 默认值必须与 `src/db/schema.ts` 里 settings 各列的 `.default()` 保持一致 ——
 * 列默认值管「写库时没给值」，这里管「读不到行时给什么」，两边不同就会出现
 * 「重启前是 true、重启后变 false」这类只在开发期冒出来的怪问题。
 */
export type Settings = {
  /** 总开关：关闭后不再调度任何提醒通知 */
  notificationsEnabled: boolean;
  /** 稍后提醒间隔（分钟） */
  snoozeMinutes: number;
  /** 免打扰开始 "HH:MM"，null 表示不启用 */
  quietStart: string | null;
  /** 免打扰结束 "HH:MM" */
  quietEnd: string | null;
  /** 提醒到达时是否发声 / 震动 */
  soundEnabled: boolean;
  /** 同一成员连续漏服达到该次数时额外提醒；0 表示不提醒 */
  missedAlertStreak: number;
};

export const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  snoozeMinutes: 10,
  quietStart: null,
  quietEnd: null,
  soundEnabled: true,
  missedAlertStreak: 2,
};

/** 设置可选的稍后提醒间隔（分钟）。首项是设计稿给的默认值 10。 */
export const SNOOZE_OPTIONS: number[] = [10, 15, 30, 60];

/** 免打扰时段是否覆盖给定的 "HH:MM"（纯函数，供调度层判断）。
 *  跨零点的区间（如 22:00–07:00）要拆成两段比较，否则整段永远判为不在区间内。 */
export function inQuietHours(
  settings: Pick<Settings, "quietStart" | "quietEnd">,
  hhmm: string,
): boolean {
  const { quietStart, quietEnd } = settings;
  if (!quietStart || !quietEnd) return false;
  if (quietStart === quietEnd) return false;
  return quietStart < quietEnd
    ? hhmm >= quietStart && hhmm < quietEnd
    : hhmm >= quietStart || hhmm < quietEnd;
}

export type AppData = {
  medications: Medication[];
  persons: Person[];
  plans: MedicationPlan[];
  reminders: Reminder[];
  usages: MedicationUsage[];
  /** 全局设置偏好，恒为一条 */
  settings: Settings;
};

const EMPTY_DATA: AppData = {
  medications: [],
  persons: [],
  plans: [],
  reminders: [],
  usages: [],
  settings: DEFAULT_SETTINGS,
};

// ─── 常量 ─────────────────────────────────────────────────

/** 药品类型 / 单位：值是稳定的枚举键，展示文案走 i18n，不在这里写死 */
export const MEDICATION_TYPES: MedicationType[] = [
  "blister",
  "bottle",
  "loose",
];

/** 药品用途分类：首项同时是「添加药品」表单与建表列默认值 */
export const MEDICATION_CATEGORIES: MedicationCategory[] = [
  "chronic",
  "acute",
  "supplement",
];

/** 分类缺省值：与 `MEDICATION_CATEGORIES` 首项、`medications.category` 的列默认值一致 */
export const DEFAULT_MEDICATION_CATEGORY: MedicationCategory = "chronic";

export const MEDICATION_UNITS: MedicationUnit[] = ["tablet", "pill"];

export const PERSON_AVATAR_COLORS = [
  "#0F766E",
  "#D97706",
  "#DC2626",
  "#2563EB",
  "#7C3AED",
  "#DB2777",
];

/**
 * 姓名 → 取色索引：对姓名做稳定的 31 倍滚动 hash，再对色板长度取模。
 * 纯函数，同名恒得同色；只依赖 UTF-16 code unit，跨运行 / 跨语言稳定。
 * `Math.imul` + `| 0` 把中间结果压回 32 位有符号整数，避免长姓名累加成
 * 浮点后取模失真。
 */
function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (Math.imul(h, 31) + name.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * 按姓名 hash 从头像色板取色（重名同色）。替代早先按创建顺序轮询 ——
 * 姓名不变色就稳定，不会因为前面增删成员而变色。
 */
export function pickAvatarColor(name: string): string {
  return PERSON_AVATAR_COLORS[
    hashName(name.trim()) % PERSON_AVATAR_COLORS.length
  ];
}

/** 宽限期（分钟）：到点后这么久仍未处理才标记为漏服 */
export const GRACE_MINUTES = 60;

/** 提醒保留天数：更早的已处理提醒会被清理，服用记录永久保留 */
const REMINDER_KEEP_DAYS = 90;

/** 低库存阈值：按当前计划估算剩余可服用天数 ≤ 该值时视为库存不足 */
export const LOW_STOCK_DAYS = 3;

/** 枚举 → 翻译路径。查不到时回退到枚举值本身，不至于显示空 */
const TYPE_LABEL_PATH: Record<MedicationType, Path> = {
  blister: "medication.typeBlister",
  bottle: "medication.typeBottle",
  loose: "medication.typeLoose",
};

const UNIT_LABEL_PATH: Record<MedicationUnit, Path> = {
  tablet: "medication.unitTablet",
  pill: "medication.unitPill",
};

const CATEGORY_LABEL_PATH: Record<MedicationCategory, Path> = {
  chronic: "medication.categoryChronic",
  acute: "medication.categoryAcute",
  supplement: "medication.categorySupplement",
};

export function medicationTypeLabel(
  type: MedicationType,
  t: Translate,
): string {
  return t(TYPE_LABEL_PATH[type]);
}

export function medicationCategoryLabel(
  category: MedicationCategory,
  t: Translate,
): string {
  return t(CATEGORY_LABEL_PATH[category]);
}

export function medicationUnitLabel(
  unit: MedicationUnit,
  t: Translate,
): string {
  return t(UNIT_LABEL_PATH[unit]);
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

/** "YYYY-MM-DD" → 本地 Date（当天 00:00）。`parseDateTime` 的日期部分单独抽出来，
 *  给只需要日期的原生选择器用（有效期、开始/结束日期） */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
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

let cache: AppData | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let initPromise: Promise<AppData> | null = null;

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

/** 行 → 实体：把 snake_case 列名转回驼峰，解开 `times` 的 JSON，并收窄枚举字段 */
function fromRows(rows: PersistedData): AppData {
  return {
    medications: rows.medications.map((m) => ({
      ...m,
      type: m.type as MedicationType,
      // 枚举列在库里是自由 TEXT，读出来统一按枚举收窄；不在取值表内的值
      // （理论上不会有）落到首项，而不是把脏值带进 UI
      category: MEDICATION_CATEGORIES.includes(m.category as MedicationCategory)
        ? (m.category as MedicationCategory)
        : DEFAULT_MEDICATION_CATEGORY,
      unit: m.unit as MedicationUnit,
    })),
    // 新增强制列（allergies / underlying_conditions）是 JSON 字符串，
    // gender / age 可空；从库里还原成实体形状
    persons: rows.persons.map((p) => ({
      ...p,
      gender: parseGender(p.gender),
      age: p.age ?? undefined,
      allergies: safeParseTags(p.allergies),
      underlyingConditions: safeParseTags(p.underlyingConditions),
    })),
    plans: rows.plans.map((p) => ({
      ...p,
      times: safeParseTimes(p.times),
    })),
    reminders: rows.reminders.map((r) => ({
      ...r,
      status: r.status as ReminderStatus,
      snoozedUntil: r.snoozedUntil ?? undefined,
      resolvedAt: r.resolvedAt ?? undefined,
    })),
    usages: rows.usages,
    // 单行表读不到行（新装 / 还没写过设置）就用默认值，不补一行空记录
    settings: fromSettingsRow(rows.settings[0]),
  };
}

/**
 * 设置行 → 实体。读不到行（新装 / 还没写过设置）时用默认值，
 * 不补一行空记录 —— 单行表的空态就靠返回默认值表达。
 */
function fromSettingsRow(
  row: PersistedData["settings"][number] | undefined,
): Settings {
  if (!row) return DEFAULT_SETTINGS;
  return row;
}

function safeParseTimes(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/** 性别列收窄：库里的自由 TEXT 只在取值表内认，其它（脏值 / null）当未填写 */
function parseGender(raw: string | null): Gender | undefined {
  return raw === "male" || raw === "female" || raw === "other"
    ? raw
    : undefined;
}

/** JSON 字符串数组列 → string[]（过敏史 / 基础病），坏值退化成空数组 */
function safeParseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** 实体 → 行：驼峰转 snake_case，`times` 序列化为 JSON。
 *  `snoozedUntil` / `resolvedAt` / `late` 的 `undefined → null / false` 是实体可选
 *  字段与「列非空」之间的类型桥接，不是老数据兜底，不能删。 */
function toRows(data: AppData): PersistedData {
  return {
    medications: data.medications,
    persons: data.persons.map((p) => ({
      ...p,
      gender: p.gender ?? null,
      age: p.age ?? null,
      allergies: JSON.stringify(p.allergies),
      underlyingConditions: JSON.stringify(p.underlyingConditions),
    })),
    plans: data.plans.map((p) => ({
      ...p,
      times: JSON.stringify(p.times),
    })),
    reminders: data.reminders.map((r) => ({
      ...r,
      snoozedUntil: r.snoozedUntil ?? null,
      resolvedAt: r.resolvedAt ?? null,
    })),
    usages: data.usages.map((u) => ({ ...u, late: u.late ?? false })),
    // 设置恒为一行：空数组表示"还没写过"，repo 层会跳过删除、保持表为空
    settings:
      data.settings === DEFAULT_SETTINGS
        ? []
        : [{ id: SETTINGS_ROW_ID, ...toSettingsRow(data.settings) }],
  };
}

const SETTINGS_ROW_ID = "singleton";

/** 实体 → 设置行。可空的免打扰字段直传 null，对应列的 NULL */
function toSettingsRow(settings: Settings) {
  return {
    notificationsEnabled: settings.notificationsEnabled,
    snoozeMinutes: settings.snoozeMinutes,
    quietStart: settings.quietStart,
    quietEnd: settings.quietEnd,
    soundEnabled: settings.soundEnabled,
    missedAlertStreak: settings.missedAlertStreak,
  };
}

/**
 * 首次读取：开库 → 读全表。
 * 表结构由 `src/db/client.ts` 负责保证（版本不符即重建）。
 */
async function initDb(): Promise<AppData> {
  return fromRows(await selectAll());
}

async function readData(): Promise<AppData> {
  if (cache) return cache;
  if (!initPromise) {
    initPromise = initDb().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  try {
    cache = await initPromise;
  } catch (error) {
    // 数据库不可用时退化为空数据，屏幕走 error/empty 态而不是白屏
    console.warn("数据库读取失败", error);
    cache = EMPTY_DATA;
  }
  return cache;
}

/** 串行落库；单次失败重试一次，避免写队列被 rejection 污染 */
async function persist(rows: PersistedData, attempt = 0): Promise<void> {
  try {
    await replaceAll(rows);
  } catch (error) {
    if (attempt >= 1) throw error;
    await persist(rows, attempt + 1);
  }
}

async function writeData(data: AppData): Promise<void> {
  cache = data;
  const rows = toRows(data);
  writeQueue = writeQueue.catch(() => {}).then(() => persist(rows));
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
export function planStatusLabel(plan: MedicationPlan, t: Translate): string {
  if (!plan.enabled) return t("plan.statusDisabled");
  if (plan.endDate && plan.endDate < todayKey()) return t("plan.statusEnded");
  return t("plan.statusActive");
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

/**
 * 库存充裕度：只看「还剩多少」，不看还能吃几天。
 *
 * 与 `stockSummary().low` 是两个维度，别混用 —— 后者按当前用药配置估算剩余天数，
 * 依赖「有人在吃这个药」；药品库里没配任何用药计划的药拿不到它。前者只依赖库存
 * 自身，列表的色条与状态胶囊、以及「库存不足」筛选都取这里。
 * 阈值来自 design/medications.html 的 stockStatus()。
 *
 * `totalQuantity` 为 0（没记库存）时按 critical 处理：设计稿的 stockStatus()
 * 在这里是 0/0 → NaN，三个比较全 false，会显示成「库存充足」；把 0 库存
 * 说成充足比说成缺货更糟。
 */
export type StockLevel = "ok" | "low" | "critical";

export function stockLevel(medication: Medication): StockLevel {
  const ratio =
    medication.totalQuantity > 0
      ? medication.remainingQuantity / medication.totalQuantity
      : 0;
  if (ratio <= 0.15) return "critical";
  if (ratio <= 0.3) return "low";
  return "ok";
}

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

/** 新建用药人的输入：除姓名外都是可选的基础信息 */
export type PersonInput = {
  name: string;
  gender?: Gender;
  age?: number;
  allergies?: string[];
  underlyingConditions?: string[];
};

export async function addPerson(input: PersonInput): Promise<Person> {
  const now = nowIso();
  const next = await updateData((data) => {
    const person: Person = {
      id: genId(),
      name: input.name.trim(),
      gender: input.gender,
      age: input.age,
      allergies: input.allergies ?? [],
      underlyingConditions: input.underlyingConditions ?? [],
      // 头像底色按姓名 hash 取色：同名同色，稳定，且不受他人增删影响
      avatarColor: pickAvatarColor(input.name),
      createdAt: now,
    };
    return { ...data, persons: [...data.persons, person] };
  });
  return next.persons[next.persons.length - 1];
}

/**
 * 更新用药人基础信息（含改名）。只覆盖传入的字段，未传的保持原值 ——
 * 注意 undefined 表示「不改」，与实体里「未填写也是 undefined」是两回事。
 * 目前 UI 只建不编辑，先备好数据层。
 */
export async function updatePerson(
  id: string,
  patch: {
    name?: string;
    gender?: Gender;
    age?: number;
    allergies?: string[];
    underlyingConditions?: string[];
  },
): Promise<void> {
  await updateData((data) => ({
    ...data,
    persons: data.persons.map((p) => {
      if (p.id !== id) return p;
      const updated: Person = { ...p };
      if (patch.name !== undefined) updated.name = patch.name.trim();
      if (patch.gender !== undefined) updated.gender = patch.gender;
      if (patch.age !== undefined) updated.age = patch.age;
      if (patch.allergies !== undefined) updated.allergies = patch.allergies;
      if (patch.underlyingConditions !== undefined)
        updated.underlyingConditions = patch.underlyingConditions;
      return updated;
    }),
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
    const t = getTranslator();
    const usage: MedicationUsage = {
      id: genId(),
      reminderId: reminder.id,
      planId: reminder.planId,
      medicationId: reminder.medicationId,
      personId: reminder.personId,
      personName: person?.name ?? t("status.deletedPerson"),
      medicationName: medication?.name ?? t("status.deletedMedication"),
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

/**
 * 稍后提醒：把通知推迟 minutes 分钟后再次提醒，不改变提醒状态。
 * 重复设置以最后一次为准；`snoozedReminder(id)` 判断推迟是否仍然生效。
 *
 * minutes 省略时取设置里的 `snoozeMinutes`（设置页可改），所以调用方
 * 只需要传 id —— 间隔是全局偏好，不该在每个界面各写一个默认值。
 */
export async function snoozeReminder(
  id: string,
  minutes?: number,
): Promise<void> {
  await updateData((data) => {
    const delay = minutes ?? data.settings.snoozeMinutes;
    const until = new Date(Date.now() + delay * 60 * 1000).toISOString();
    return {
      ...data,
      reminders: data.reminders.map((r) =>
        r.id === id && (r.status === "pending" || r.status === "missed")
          ? { ...r, snoozedUntil: until }
          : r,
      ),
    };
  });
}

/** 该提醒是否处于「稍后提醒」中（推迟时刻还没到） */
export function snoozedReminder(
  reminder: Reminder,
  now: Date = new Date(),
): boolean {
  if (!reminder.snoozedUntil) return false;
  return new Date(reminder.snoozedUntil).getTime() > now.getTime();
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

// ─── 设置偏好 ─────────────────────────────────────────────

/** 更新设置偏好。走 updateData，写完由 postMutationHook 触发通知重排。 */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await updateData((data) => {
    // 免打扰成对出现：只改一端等于禁用，统一补齐成 null
    const quietStart = patch.quietStart ?? data.settings.quietStart;
    const quietEnd = patch.quietEnd ?? data.settings.quietEnd;
    return {
      ...data,
      settings: {
        ...data.settings,
        ...patch,
        quietStart: quietStart && quietEnd ? quietStart : null,
        quietEnd: quietStart && quietEnd ? quietEnd : null,
      },
    };
  });
}

/** 开启/关闭免打扰时段。传 null 表示关闭该功能。 */
export async function setQuietHours(
  start: string | null,
  end: string | null,
): Promise<void> {
  await updateSettings({ quietStart: start, quietEnd: end });
}

// ─── 统计（纯函数，供「我的」页本周概览使用） ─────────────

/** 一周服药统计：服药率 + 按时数 + 漏服数 */
export type WeekStats = {
  /** 服药率 0–100，整数 */
  adherence: number;
  /** 按时服用次数（status === "taken"） */
  taken: number;
  /** 漏服次数（status === "missed"） */
  missed: number;
  /** 本周应服总次数（所有非 pending 之外都算，pending 计入应服） */
  planned: number;
};

/** 本周起始日（周一）的日期 key。ISO 周以周一为首日 */
export function weekStartKey(today: string = todayKey()): string {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // getDay(): 周日=0，转成「周一=0」再回退
  const offset = (date.getDay() + 6) % 7;
  return addDays(today, -offset);
}

/**
 * 统计从 `from`（含）到 `to`（含）的服药情况。
 *
 * 纯函数：不碰数据库，输入输出都是数字，方便后续补单元测试。
 * 「应服」= 该区间内所有提醒（pending 也算），
 * 「按时」= 已服用，「漏服」= 已判漏服，跳过既不计按时也不计漏服。
 */
export function weekStats(
  reminders: Reminder[],
  from: string,
  to: string,
): WeekStats {
  const inRange = reminders.filter((r) => r.date >= from && r.date <= to);
  const taken = inRange.filter((r) => r.status === "taken").length;
  const missed = inRange.filter((r) => r.status === "missed").length;
  const planned = inRange.length;
  return {
    adherence: planned > 0 ? Math.round((taken / planned) * 100) : 0,
    taken,
    missed,
    planned,
  };
}

/**
 * 找出「连续漏服达到阈值」的成员。
 *
 * 纯函数：按成员分组后，从最近的提醒往回数连续 missed 的条数，
 * 一旦遇到 taken / skipped / pending 就中断 —— pending 也中断，
 * 因为「还没到点的剂量」不代表中间断过。
 *
 * 返回达到 `threshold` 的成员 id 集合；threshold ≤ 0 表示不提醒（设置里关闭）。
 */
export function missedStreaks(
  reminders: Reminder[],
  threshold: number,
): Set<string> {
  const result = new Set<string>();
  if (threshold <= 0) return result;

  // 最新的排在前面，倒序扫 = 从现在往回数
  const byPerson = new Map<string, Reminder[]>();
  for (const reminder of reminders) {
    const list = byPerson.get(reminder.personId);
    if (list) list.push(reminder);
    else byPerson.set(reminder.personId, [reminder]);
  }

  for (const [personId, list] of byPerson) {
    // oxlint-disable-next-line unicorn/no-array-sort
    list.sort((a, b) =>
      `${b.date}|${b.time}`.localeCompare(`${a.date}|${a.time}`),
    );
    let streak = 0;
    for (const reminder of list) {
      if (reminder.status === "missed") {
        streak += 1;
        if (streak >= threshold) {
          result.add(personId);
          break;
        }
      } else if (reminder.status !== "pending") {
        // 已服用或已跳过 → 连续记录被打断
        streak = 0;
      } else {
        // 未来待服用不计入，也不打断（今天还没到的剂量不算"断过"）
        break;
      }
    }
  }
  return result;
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

  // 首次挂载时从 SQLite 载入数据 —— 这正是 effect 的用途（与外部系统同步）。
  // reload() 是 async，setState 发生在 await 之后的微任务里，并非同步调用，
  // 不会引发级联渲染；react/set-state-in-effect 看不穿 async 边界，此处为误报
  // （oxlint 行内禁用对该规则无效，故在 .oxlintrc.json 用 overrides 关闭）。
  useEffect(() => {
    reload();
  }, [reload]);

  return { ...data, loading, reload };
}
