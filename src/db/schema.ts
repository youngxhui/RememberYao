import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * 数据库表结构。
 *
 * `times`（每日服用时间数组）在 SQLite 里存为 JSON 字符串：它总是整体读写、
 * 从不按元素查询，拆成子表只会让写入路径变复杂。
 */

export const medications = sqliteTable("medications", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  /** 用途分类：慢性病 / 临时用药 / 保健品。药品库列表按它筛选 */
  category: text("category").notNull().default("chronic"),
  /** 规格，如 "10mg/片"。自由文本，没有统一取值表 */
  specification: text("specification").notNull().default(""),
  unit: text("unit").notNull(),
  totalQuantity: integer("total_quantity").notNull(),
  remainingQuantity: integer("remaining_quantity").notNull(),
  /** 板装规格：每板行数。非板装药或未记录为 NULL。
   *  补货新建板时用它决定板型；已有板各自存自己的 rows/cols，改这里不影响旧板 */
  blisterRows: integer("blister_rows"),
  /** 板装规格：每板列数（与 blisterRows 配对出现） */
  blisterCols: integer("blister_cols"),
  /** 有效期 "YYYY-MM-DD"，null 表示未记录（不参与到期提醒） */
  expiryDate: text("expiry_date"),
  /** 是否处方药，只影响展示与将来可能的用药建议 */
  prescription: integer("prescription", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const persons = sqliteTable("persons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  avatarColor: text("avatar_color").notNull(),
  /** 性别；null = 未填写。存库是自由 TEXT，读时按 Gender 收窄 */
  gender: text("gender"),
  /** 年龄（周岁）；null = 未填写 */
  age: integer("age"),
  /** 过敏原列表，JSON 字符串数组（整体读写，从不按元素查询） */
  allergies: text("allergies").notNull().default("[]"),
  /** 基础病 / 慢性病史列表，JSON 字符串数组 */
  underlyingConditions: text("underlying_conditions").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
});

export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    medicationId: text("medication_id").notNull(),
    personId: text("person_id").notNull(),
    doseAmount: integer("dose_amount").notNull(),
    /** 每日服用时间 "HH:MM" 数组，JSON 字符串 */
    times: text("times").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("plans_medication_idx").on(t.medicationId),
    index("plans_person_idx").on(t.personId),
  ],
);

export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull(),
    medicationId: text("medication_id").notNull(),
    personId: text("person_id").notNull(),
    date: text("date").notNull(),
    time: text("time").notNull(),
    doseAmount: integer("dose_amount").notNull(),
    status: text("status").notNull(),
    snoozedUntil: text("snoozed_until"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("reminders_date_idx").on(t.date),
    index("reminders_plan_idx").on(t.planId),
    // 去重靠 (planId, date, time)：同一次服用只允许存在一条提醒
    uniqueIndex("reminders_dedup_idx").on(t.planId, t.date, t.time),
  ],
);

export const usages = sqliteTable(
  "usages",
  {
    id: text("id").primaryKey(),
    /** 来源提醒。可空：孪生页手动点格子记的服用没有提醒 */
    reminderId: text("reminder_id"),
    /** 来源用药配置。可空：同上，手动记录不挂配置 */
    planId: text("plan_id"),
    medicationId: text("medication_id").notNull(),
    personId: text("person_id").notNull(),
    /** 快照：用药人姓名。药品/用药人被删除后历史仍可读 */
    personName: text("person_name").notNull(),
    /** 快照：药品名称 */
    medicationName: text("medication_name").notNull(),
    /** 快照：计划中的服用时间 "HH:MM" */
    time: text("time").notNull(),
    amount: integer("amount").notNull(),
    late: integer("late", { mode: "boolean" }).notNull().default(false),
    takenAt: text("taken_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("usages_taken_at_idx").on(t.takenAt),
    index("usages_reminder_idx").on(t.reminderId),
  ],
);

/**
 * 药板：一块实体泡罩（板装药的数字孪生单位）。
 *
 * 不存 status —— sealed / open / consumed 全部由槽位推导（store.ts 的
 * `packStatus`），存了就要跟着每次消耗回写，两处事实必然漂移。
 * `rows × cols` 存在板自己身上：补货新建板时读药品的 blister_rows/cols，
 * 而老板的规格可能已被用户改过，历史板必须保持自己的几何。
 */
export const packs = sqliteTable(
  "packs",
  {
    id: text("id").primaryKey(),
    medicationId: text("medication_id").notNull(),
    /** 盒内第几板，从 1 开始 */
    seq: integer("seq").notNull(),
    rows: integer("rows").notNull(),
    cols: integer("cols").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("packs_medication_idx").on(t.medicationId),
    uniqueIndex("packs_seq_idx").on(t.medicationId, t.seq),
  ],
);

/**
 * 槽位：泡罩里的一格，`index` 从 0 开始、从左到右从上到下。
 *
 * `usage_id` 指向消耗它的服用记录（usages 永久保留，所以这个引用不会悬空）；
 * 可空——存量药品开启孪生时补的「历史消耗」格没有对应记录。
 * `consumed_by` 是快照姓名而非 personId 引用，与 usages 的快照策略一致
 * （硬规则 22）：删用药人不清历史。
 */
export const blisterSlots = sqliteTable(
  "blister_slots",
  {
    id: text("id").primaryKey(),
    packId: text("pack_id").notNull(),
    /** 列名叫 slot_index：SQLite 的 INDEX 是关键字，裸用会语法错误。
     *  实体属性仍叫 index（读起来自然），列名避让 */
    index: integer("slot_index").notNull(),
    /** full 有药 / empty 已服（含历史消耗）/ void 损坏遗失 */
    status: text("status").notNull(),
    usageId: text("usage_id"),
    /** 消耗时刻 ISO */
    consumedAt: text("consumed_at"),
    /** 快照：消耗者姓名 */
    consumedBy: text("consumed_by"),
  },
  (t) => [
    index("blister_slots_pack_idx").on(t.packId),
    uniqueIndex("blister_slots_index_idx").on(t.packId, t.index),
  ],
);

/**
 * 设置偏好：单行表（`id` 恒为 "singleton"）。
 *
 * 单独一张表而不是挂到任何业务表上：它是全局偏好，不属于某个药品或成员；
 * 全量快照的 `replaceAll` 对单行表也天然幂等。
 * 每列都带默认值，写库时不给值也不会是 NULL；这些默认值同时是
 * `store.ts` 里 `DEFAULT_SETTINGS` 的单一来源，改一处要同步另一处。
 */
export const settings = sqliteTable("settings", {
  /** 恒为 "singleton"，保证表里只有一行 */
  id: text("id").primaryKey(),
  /** 总开关：关闭后不再调度任何提醒通知 */
  notificationsEnabled: integer("notifications_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  /** 稍后提醒间隔（分钟） */
  snoozeMinutes: integer("snooze_minutes").notNull().default(10),
  /** 免打扰开始 "HH:MM"，null 表示不启用 */
  quietStart: text("quiet_start"),
  /** 免打扰结束 "HH:MM" */
  quietEnd: text("quiet_end"),
  /** 提醒到达时是否发声 / 震动 */
  soundEnabled: integer("sound_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  /** 同一成员连续漏服达到该次数时额外提醒；0 表示不提醒 */
  missedAlertStreak: integer("missed_alert_streak").notNull().default(2),
});
