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
  /** 板装规格：每板行数。非板装药或未记录为 null。
   *  只影响补货新建的板；老板各自存自己的 rows/cols */
  blisterRows: number | null;
  /** 板装规格：每板列数（与 blisterRows 配对出现） */
  blisterCols: number | null;
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
 *  name / time 为创建时的快照，药品或用药人被删除后历史记录仍可读。
 *  reminderId / planId 可空：孪生页手动点格子记的服用没有提醒来源。 */
export type MedicationUsage = {
  id: string;
  /** 来源提醒；手动记录为 null */
  reminderId: string | null;
  /** 来源用药配置；手动记录为 null */
  planId: string | null;
  medicationId: string;
  personId: string;
  /** 快照：用药人姓名 */
  personName: string;
  /** 快照：药品名称 */
  medicationName: string;
  /** 快照：计划中的服用时间 "HH:MM"；手动记录为操作时刻 */
  time: string;
  /** 实际服用的数量 */
  amount: number;
  /** 是否漏服后补记 */
  late?: boolean;
  /** 实际服用时间 ISO */
  takenAt: string;
  createdAt: string;
};

// ─── 泡罩孪生实体 ─────────────────────────────────────────

/** 槽位状态：full 有药 / empty 已服（含迁移进来的历史消耗）/ void 损坏遗失 */
export type BlisterSlotStatus = "full" | "empty" | "void";

/** 药板：一块实体泡罩，板装药数字孪生的单位。
 *  rows × cols 存在板自己身上：补货新建板时按药品规格来，而老板的规格
 *  可能已被用户改过，历史板必须保持自己的几何，否则格子对不上物理药板。 */
export type BlisterPack = {
  id: string;
  medicationId: string;
  /** 盒内第几板，从 1 开始 */
  seq: number;
  rows: number;
  cols: number;
  createdAt: string;
};

/** 槽位：泡罩里的一格。index 从 0 开始，从左到右、从上到下 —— 消耗顺序
 *  与真人嗑药片的顺序一致（nextFullSlots 依赖这个排序）。 */
export type BlisterSlot = {
  id: string;
  packId: string;
  index: number;
  status: BlisterSlotStatus;
  /** 消耗它的服用记录 id；手动记录 / 历史消耗为 null */
  usageId: string | null;
  /** 消耗时刻 ISO */
  consumedAt: string | null;
  /** 快照：消耗者姓名（与 usages 的快照策略一致，删用药人不清历史） */
  consumedBy: string | null;
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
  /** 泡罩药板（板装药的数字孪生）。非板装药没有板 */
  packs: BlisterPack[];
  /** 泡罩槽位，跟着板走 */
  blisterSlots: BlisterSlot[];
  /** 全局设置偏好，恒为一条 */
  settings: Settings;
};

const EMPTY_DATA: AppData = {
  medications: [],
  persons: [],
  plans: [],
  reminders: [],
  usages: [],
  packs: [],
  blisterSlots: [],
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

/** 药饼 / 胶囊配色：按药品 id 稳定取色（重录同药同色，改名不改色）。
 *  `body` 是片身或胶囊体，`cap` 是胶囊帽，`score` 是药饼的压痕线。
 *  取真实药片的常见配色：白片、糖衣片、双色胶囊 —— 数字孪生的泡罩里
 *  装的是“这颗药”，不是抽象色块。 */
export type PillTint = {
  body: string;
  cap: string;
  score: string;
};

export const PILL_TINTS: PillTint[] = [
  { body: "#FDFDFA", cap: "#F2DFB4", score: "#E5DEC9" },
  { body: "#FFF6DE", cap: "#F2C94C", score: "#E8D49A" },
  { body: "#FDEBEB", cap: "#E86A6A", score: "#EFC3C3" },
  { body: "#FFF1D6", cap: "#F2994A", score: "#EBD2A6" },
  { body: "#EAF2FD", cap: "#4A7FD4", score: "#C9D9F0" },
  { body: "#EDF7EF", cap: "#5FA777", score: "#CDE6D5" },
];

export function pickPillTint(id: string): PillTint {
  return PILL_TINTS[hashName(id) % PILL_TINTS.length];
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
      blisterRows: m.blisterRows ?? null,
      blisterCols: m.blisterCols ?? null,
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
    usages: rows.usages.map((u) => ({
      ...u,
      reminderId: u.reminderId ?? null,
      planId: u.planId ?? null,
    })),
    packs: rows.packs,
    // 行对象的键是实体属性名（index），列名 slot_index 由 drizzle 自己映射
    blisterSlots: rows.blisterSlots.map((s) => ({
      ...s,
      status: s.status as BlisterSlotStatus,
      usageId: s.usageId ?? null,
      consumedAt: s.consumedAt ?? null,
      consumedBy: s.consumedBy ?? null,
    })),
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
    packs: data.packs,
    blisterSlots: data.blisterSlots,
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
  await updateData((data) => {
    // 板装药已建孪生时按粒数补货会破坏「Σfull === remainingQuantity」不变式
    // （补进来的药没有对应的槽位），这类药的补货必须走 appendBlisterPacks 按板补
    if (data.packs.some((p) => p.medicationId === id)) return data;
    return {
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
    };
  });
}

// ─── 泡罩孪生 ─────────────────────────────────────────────

/** 每板单边格数上限：防手滑填出 100×100 的「药板」把网格和账一起撑坏 */
const MAX_PACK_SIDE = 12;

/** 夹紧每板行列：板是物理实体，1~12 之间 */
function clampSide(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.round(n), 1), MAX_PACK_SIDE);
}

/** 板的展示状态：由槽位推导，不落库 —— 存了就要跟着每次消耗回写，必然漂移 */
export type PackStatus = "sealed" | "open" | "consumed";

export function packStatus(slots: BlisterSlot[]): PackStatus {
  if (slots.length === 0) return "sealed";
  if (!slots.some((s) => s.status === "full")) return "consumed";
  return slots.some((s) => s.status !== "full") ? "open" : "sealed";
}

/** 某药品的孪生概览。`fullSlots` 必须等于 `medication.remainingQuantity`
 *  （不变式见 docs/plans/medication-digital-twin.md 3.3） */
export type BlisterSummary = {
  /** 是否已建孪生 */
  enabled: boolean;
  packCount: number;
  /** 每板格数（取第一板；同药各板规格一致，只有老板可能不同） */
  slotsPerPack: number;
  totalSlots: number;
  fullSlots: number;
  /** 下一块要开的板（还有药的板里序号最小）；null = 全部吃完 */
  openPack: BlisterPack | null;
};

export function blisterSummary(
  medication: Medication,
  packs: BlisterPack[],
  slots: BlisterSlot[],
): BlisterSummary {
  const own = packs.filter((p) => p.medicationId === medication.id);
  // Hermes 没有 toSorted()；filter 产物是副本，原地排序不碰 store 数据
  // oxlint-disable-next-line unicorn/no-array-sort
  own.sort((a, b) => a.seq - b.seq);
  const packIds = new Set(own.map((p) => p.id));
  const ownSlots = slots.filter((s) => packIds.has(s.packId));
  return {
    enabled: own.length > 0,
    packCount: own.length,
    slotsPerPack: own[0] ? own[0].rows * own[0].cols : 0,
    totalSlots: ownSlots.length,
    fullSlots: ownSlots.filter((s) => s.status === "full").length,
    openPack:
      own.find((p) =>
        ownSlots.some((s) => s.packId === p.id && s.status === "full"),
      ) ?? null,
  };
}

/** 按「板序 → 格序」取前 count 个 full 槽位 —— 泡罩从左到右、从上到下消耗，
 *  与真人嗑药片的顺序一致 */
export function nextFullSlots(
  packs: BlisterPack[],
  slots: BlisterSlot[],
  count: number,
): BlisterSlot[] {
  if (count <= 0) return [];
  const ordered = [...packs];
  // oxlint-disable-next-line unicorn/no-array-sort
  ordered.sort((a, b) => a.seq - b.seq);
  const result: BlisterSlot[] = [];
  for (const pack of ordered) {
    const packSlots = slots.filter(
      (s) => s.packId === pack.id && s.status === "full",
    );
    // oxlint-disable-next-line unicorn/no-array-sort
    packSlots.sort((a, b) => a.index - b.index);
    for (const slot of packSlots) {
      if (result.length >= count) return result;
      result.push(slot);
    }
  }
  return result;
}

/**
 * 消耗指定药品的前 count 个 full 槽位（takeReminder 用）。
 *
 * 槽位不足（没建孪生 / 数据对不上）时原样返回 —— 提醒闭环永不因孪生数据
 * 不完整而阻断，库存照扣。
 */
function consumeSlotsIn(
  data: AppData,
  medicationId: string,
  count: number,
  ctx: { usageId: string; consumedAt: string; consumedBy: string },
): AppData {
  const ownPacks = data.packs.filter((p) => p.medicationId === medicationId);
  if (ownPacks.length === 0) return data;
  const ownPackIds = new Set(ownPacks.map((p) => p.id));
  const targets = nextFullSlots(
    ownPacks,
    data.blisterSlots.filter((s) => ownPackIds.has(s.packId)),
    count,
  );
  if (targets.length === 0) return data;
  const hit = new Set(targets.map((s) => s.id));
  return {
    ...data,
    blisterSlots: data.blisterSlots.map((s) =>
      hit.has(s.id)
        ? {
            ...s,
            status: "empty" as const,
            usageId: ctx.usageId,
            consumedAt: ctx.consumedAt,
            consumedBy: ctx.consumedBy,
          }
        : s,
    ),
  };
}

/**
 * 开启数字孪生：为存量板装药建板，按当前剩余量把历史消耗补成 empty 格。
 *
 * 不变式：建板后 Σfull === remainingQuantity，Σ全部格 === 板数 × 每板粒数。
 * 板数至少要装得下当前剩余；`totalQuantity` 重写为真实槽位数 ——
 * 老数据「记了 25 但一板 30」这类账，以物理板为准修正。
 */
function openBlisterTwinIn(
  data: AppData,
  medicationId: string,
  input: { rows: number; cols: number; packCount: number },
): AppData {
  const medication = data.medications.find((m) => m.id === medicationId);
  if (!medication || medication.type !== "blister") return data;
  const rows = clampSide(input.rows);
  const cols = clampSide(input.cols);
  const perPack = rows * cols;
  const packCount = Math.max(
    1,
    Math.round(input.packCount) || 1,
    Math.ceil(medication.remainingQuantity / perPack),
  );
  // 重复开启 = 重建：先清掉该药旧的板与格
  const stalePackIds = new Set(
    data.packs.filter((p) => p.medicationId === medicationId).map((p) => p.id),
  );
  const packs = data.packs.filter((p) => !stalePackIds.has(p.id));
  const blisterSlots = data.blisterSlots.filter(
    (s) => !stalePackIds.has(s.packId),
  );
  const now = nowIso();
  // 总格数减剩余 = 已经被吃掉的历史格数，按板序格序从第一格开始标 empty
  // （usageId 为 null，UI 显示「历史消耗 · 无服用记录」）
  let history = packCount * perPack - medication.remainingQuantity;
  for (let seq = 1; seq <= packCount; seq++) {
    const pack: BlisterPack = {
      id: genId(),
      medicationId,
      seq,
      rows,
      cols,
      createdAt: now,
    };
    packs.push(pack);
    for (let index = 0; index < perPack; index++) {
      blisterSlots.push({
        id: genId(),
        packId: pack.id,
        index,
        status: history > 0 ? "empty" : "full",
        usageId: null,
        consumedAt: null,
        consumedBy: null,
      });
      if (history > 0) history -= 1;
    }
  }
  return {
    ...data,
    packs,
    blisterSlots,
    medications: data.medications.map((m) =>
      m.id === medicationId
        ? {
            ...m,
            blisterRows: rows,
            blisterCols: cols,
            totalQuantity: packCount * perPack,
            updatedAt: now,
          }
        : m,
    ),
  };
}

/** 补货（按板）：追加 count 块满板。板装孪生专用，散装/瓶装走 restockMedication */
function appendBlisterPacksIn(
  data: AppData,
  medicationId: string,
  count: number,
): AppData {
  const medication = data.medications.find((m) => m.id === medicationId);
  if (!medication) return data;
  const rows = clampSide(medication.blisterRows ?? 1);
  const cols = clampSide(medication.blisterCols ?? 1);
  const perPack = rows * cols;
  const own = data.packs.filter((p) => p.medicationId === medicationId);
  let nextSeq = own.reduce((max, p) => Math.max(max, p.seq), 0) + 1;
  const now = nowIso();
  const packs = [...data.packs];
  const blisterSlots = [...data.blisterSlots];
  for (let i = 0; i < count; i++) {
    const pack: BlisterPack = {
      id: genId(),
      medicationId,
      seq: nextSeq,
      rows,
      cols,
      createdAt: now,
    };
    nextSeq += 1;
    packs.push(pack);
    for (let index = 0; index < perPack; index++) {
      blisterSlots.push({
        id: genId(),
        packId: pack.id,
        index,
        status: "full",
        usageId: null,
        consumedAt: null,
        consumedBy: null,
      });
    }
  }
  return {
    ...data,
    packs,
    blisterSlots,
    medications: data.medications.map((m) =>
      m.id === medicationId
        ? {
            ...m,
            totalQuantity: m.totalQuantity + count * perPack,
            remainingQuantity: m.remainingQuantity + count * perPack,
            updatedAt: now,
          }
        : m,
    ),
  };
}

/**
 * 手动记一次服用（孪生页点格子）：产生一条无提醒来源的 usage 并消耗**这一格**。
 *
 * 与 takeReminder 的按序消耗不同 —— 用户点了哪一格就消耗哪一格：泡罩可以
 * 从任意位置抠开，孪生要镜像用户实际做的事，而不是替他决定。
 */
function consumeBlisterSlotIn(
  data: AppData,
  slotId: string,
  personId: string,
): AppData {
  const slot = data.blisterSlots.find((s) => s.id === slotId);
  if (!slot || slot.status !== "full") return data;
  const pack = data.packs.find((p) => p.id === slot.packId);
  if (!pack) return data;
  const medication = data.medications.find((m) => m.id === pack.medicationId);
  if (!medication) return data;
  const person = data.persons.find((p) => p.id === personId);
  if (!person) return data;
  const now = nowIso();
  const usage: MedicationUsage = {
    id: genId(),
    reminderId: null,
    planId: null,
    medicationId: medication.id,
    personId: person.id,
    personName: person.name,
    medicationName: medication.name,
    // 手动记录没有计划时间，记操作时刻
    time: dateToTime(new Date()),
    amount: 1,
    late: false,
    takenAt: now,
    createdAt: now,
  };
  return {
    ...data,
    usages: [usage, ...data.usages],
    blisterSlots: data.blisterSlots.map((s) =>
      s.id === slotId
        ? {
            ...s,
            status: "empty" as const,
            usageId: usage.id,
            consumedAt: now,
            consumedBy: usage.personName,
          }
        : s,
    ),
    medications: data.medications.map((m) =>
      m.id === medication.id
        ? {
            ...m,
            remainingQuantity: Math.max(0, m.remainingQuantity - 1),
            updatedAt: now,
          }
        : m,
    ),
  };
}

/** 标记槽位损坏 / 遗失：物理上没吃但格子里没药了。不产生服用记录，库存 −1 */
function voidBlisterSlotIn(data: AppData, slotId: string): AppData {
  const slot = data.blisterSlots.find((s) => s.id === slotId);
  if (!slot || slot.status !== "full") return data;
  const pack = data.packs.find((p) => p.id === slot.packId);
  if (!pack) return data;
  const now = nowIso();
  return {
    ...data,
    blisterSlots: data.blisterSlots.map((s) =>
      s.id === slotId
        ? { ...s, status: "void" as const, usageId: null, consumedBy: null }
        : s,
    ),
    medications: data.medications.map((m) =>
      m.id === pack.medicationId
        ? {
            ...m,
            remainingQuantity: Math.max(0, m.remainingQuantity - 1),
            updatedAt: now,
          }
        : m,
    ),
  };
}

/**
 * 恢复槽位为未服用：void 或历史 empty（无 usage）→ full，库存 +1。
 * 有服用记录的格子必须走 undoUsage —— 那条路还要删 usage、回退提醒。
 */
function restoreBlisterSlotIn(data: AppData, slotId: string): AppData {
  const slot = data.blisterSlots.find((s) => s.id === slotId);
  if (!slot || slot.status === "full" || slot.usageId) return data;
  const pack = data.packs.find((p) => p.id === slot.packId);
  if (!pack) return data;
  const now = nowIso();
  return {
    ...data,
    blisterSlots: data.blisterSlots.map((s) =>
      s.id === slotId
        ? {
            ...s,
            status: "full" as const,
            usageId: null,
            consumedAt: null,
            consumedBy: null,
          }
        : s,
    ),
    medications: data.medications.map((m) =>
      m.id === pack.medicationId
        ? {
            ...m,
            remainingQuantity: Math.min(
              m.totalQuantity,
              m.remainingQuantity + 1,
            ),
            updatedAt: now,
          }
        : m,
    ),
  };
}

/**
 * 撤销一次服用：删 usage、回退提醒状态、恢复槽位、回补库存。
 *
 * 提醒回退到 pending 而非 taken —— 撤销后这次剂量重新进入待处理，
 * 已过宽限期会被 syncRemindersIn 再次判为漏服（撤销补记不等于没漏过）。
 */
function undoUsageIn(data: AppData, usageId: string): AppData {
  const usage = data.usages.find((u) => u.id === usageId);
  if (!usage) return data;
  const now = nowIso();
  const reminders = data.reminders.map((r) =>
    usage.reminderId && r.id === usage.reminderId && r.status !== "pending"
      ? { ...r, status: "pending" as const, resolvedAt: undefined }
      : r,
  );
  const hit = new Set(
    data.blisterSlots.filter((s) => s.usageId === usageId).map((s) => s.id),
  );
  const blisterSlots = data.blisterSlots.map((s) =>
    hit.has(s.id)
      ? {
          ...s,
          status: "full" as const,
          usageId: null,
          consumedAt: null,
          consumedBy: null,
        }
      : s,
  );
  const medications = data.medications.map((m) =>
    m.id === usage.medicationId
      ? {
          ...m,
          remainingQuantity: Math.min(
            m.totalQuantity,
            m.remainingQuantity + usage.amount,
          ),
          updatedAt: now,
        }
      : m,
  );
  return {
    ...data,
    reminders,
    blisterSlots,
    medications,
    usages: data.usages.filter((u) => u.id !== usageId),
  };
}

/** 为存量板装药开启数字孪生（孪生页承载引导表单） */
export async function openBlisterTwin(
  medicationId: string,
  input: { rows: number; cols: number; packCount: number },
): Promise<void> {
  await updateData((data) => openBlisterTwinIn(data, medicationId, input));
}

/** 补货（按板）：追加 count 块满板 */
export async function appendBlisterPacks(
  medicationId: string,
  count: number,
): Promise<void> {
  if (!Number.isFinite(count) || count <= 0) return;
  await updateData((data) =>
    appendBlisterPacksIn(data, medicationId, Math.round(count)),
  );
}

/** 手动记一次服用：点孪生网格的某一格，记给指定用药人 */
export async function consumeBlisterSlot(
  slotId: string,
  personId: string,
): Promise<void> {
  await updateData((data) => consumeBlisterSlotIn(data, slotId, personId));
}

/** 标记槽位损坏 / 遗失 */
export async function voidBlisterSlot(slotId: string): Promise<void> {
  await updateData((data) => voidBlisterSlotIn(data, slotId));
}

/** 恢复槽位为未服用（void / 历史消耗格） */
export async function restoreBlisterSlot(slotId: string): Promise<void> {
  await updateData((data) => restoreBlisterSlotIn(data, slotId));
}

/** 撤销一次服用：连带恢复槽位、回补库存、回退提醒 */
export async function undoUsage(usageId: string): Promise<void> {
  await updateData((data) => undoUsageIn(data, usageId));
}

// ─── 药品 CRUD ────────────────────────────────────────────

/** 新建药品的输入。板装药可随药品一并建板（数字孪生），
 *  此时 total / remaining 按板数重算，传入的库存值被忽略 */
export type MedicationInput = Omit<
  Medication,
  "id" | "createdAt" | "updatedAt"
> & {
  blister?: { rows: number; cols: number; packCount: number };
};

export async function addMedication(
  input: MedicationInput,
): Promise<Medication> {
  const { blister, ...rest } = input;
  const now = nowIso();
  // 新药没有历史消耗：板装时库存直接按「板数 × 每板粒数」给足，
  // 建板逻辑按 remaining 反推历史格数，此时为 0，所有格子都是满的
  const perPack = blister
    ? clampSide(blister.rows) * clampSide(blister.cols)
    : 0;
  const packCount = blister
    ? Math.max(1, Math.round(blister.packCount) || 1)
    : 0;
  const medication: Medication = {
    ...rest,
    id: genId(),
    createdAt: now,
    updatedAt: now,
    ...(blister
      ? {
          totalQuantity: perPack * packCount,
          remainingQuantity: perPack * packCount,
        }
      : null),
  };
  await updateData((data) => {
    const next: AppData = {
      ...data,
      medications: [medication, ...data.medications],
    };
    if (!blister) return next;
    return openBlisterTwinIn(next, medication.id, {
      rows: blister.rows,
      cols: blister.cols,
      packCount,
    });
  });
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

/** 删除药品：级联删除配置、提醒与泡罩孪生；服用记录作为历史永久保留 */
export async function deleteMedication(id: string): Promise<void> {
  await updateData((data) => {
    const planIds = new Set(
      data.plans.filter((p) => p.medicationId === id).map((p) => p.id),
    );
    const packIds = new Set(
      data.packs.filter((p) => p.medicationId === id).map((p) => p.id),
    );
    return {
      ...data,
      medications: data.medications.filter((m) => m.id !== id),
      plans: data.plans.filter((p) => p.medicationId !== id),
      reminders: data.reminders.filter((r) => !planIds.has(r.planId)),
      packs: data.packs.filter((p) => p.medicationId !== id),
      blisterSlots: data.blisterSlots.filter((s) => !packIds.has(s.packId)),
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
    // 板装孪生：按泡罩顺序消耗槽位。槽位不足时 consumeSlotsIn 原样返回，
    // 库存照扣 —— 服药闭环不因孪生数据不完整而阻断
    return consumeSlotsIn(
      {
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
      },
      reminder.medicationId,
      reminder.doseAmount,
      { usageId: usage.id, consumedAt: takenAt, consumedBy: usage.personName },
    );
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
