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
    reminderId: text("reminder_id").notNull(),
    planId: text("plan_id").notNull(),
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
