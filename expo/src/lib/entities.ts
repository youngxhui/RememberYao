import { type Path, type Translate } from "@/i18n";

/**
 * 领域实体与纯函数。
 *
 * 这一层不碰 SQLite、不碰 React：实体定义、常量、日期/库存/孪生的派生计算都在这里。
 * `src/db/repo.ts` 负责行 ↔ 实体的映射与持久化，`src/lib/store.ts` 负责
 * 「读所需 → 纯函数决策 → 写差异」的操作编排与查询 Hook。
 */

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

/** 槽位：泡罩里的一格。index 从 0 开始、从左到右、从上到下 —— 消耗顺序
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
  /** 免打扰结束 "HH:MM"，null 表示不启用 */
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

/** 低库存阈值：按当前计划估算剩余可服用天数 ≤ 该值时视为库存不足 */
export const LOW_STOCK_DAYS = 3;

/**
 * 默认用药人（「自己」）的固定 id。
 *
 * 首启动自动创建，用户不必先加成员就能配药；固定 id 让「这是默认创建的那位」
 * 可被稳定识别（改名、跟随界面语言刷新名字都靠它），也避免重复创建。
 */
export const SELF_PERSON_ID = "self";

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

// ─── 配置生效判断 ──────────────────────────────────────────

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

// ─── 泡罩孪生 ─────────────────────────────────────────────

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
  // Hermes 没有 toSorted()；filter 产物是副本，原地排序不碰调用方数据
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

/** 该提醒是否处于「稍后提醒」中（推迟时刻还没到） */
export function snoozedReminder(
  reminder: Reminder,
  now: Date = new Date(),
): boolean {
  if (!reminder.snoozedUntil) return false;
  return new Date(reminder.snoozedUntil).getTime() > now.getTime();
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
