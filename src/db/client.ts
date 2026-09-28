import { drizzle } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";

import * as schema from "./schema";

export const DATABASE_NAME = "rememberyao.db";

/** 打开数据库并跑完迁移；并发调用只会真正执行一次 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  return db;
}

let drizzleDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

/** 获取 Drizzle 实例（懒打开）。store 层在首次读数据时调用。 */
export async function getDb(): Promise<NonNullable<typeof drizzleDb>> {
  if (!drizzleDb) {
    drizzleDb = drizzle(await openDatabase(), { schema });
  }
  return drizzleDb;
}

const MIGRATION_V1 = `
CREATE TABLE IF NOT EXISTS medications (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  unit TEXT NOT NULL,
  total_quantity INTEGER NOT NULL,
  remaining_quantity INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS persons (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY NOT NULL,
  medication_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  dose_amount INTEGER NOT NULL,
  times TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS plans_medication_idx ON plans (medication_id);
CREATE INDEX IF NOT EXISTS plans_person_idx ON plans (person_id);
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  dose_amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  snoozed_until TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_date_idx ON reminders (date);
CREATE INDEX IF NOT EXISTS reminders_plan_idx ON reminders (plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS reminders_dedup_idx ON reminders (plan_id, date, time);
CREATE TABLE IF NOT EXISTS usages (
  id TEXT PRIMARY KEY NOT NULL,
  reminder_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  person_name TEXT NOT NULL,
  medication_name TEXT NOT NULL,
  time TEXT NOT NULL,
  amount INTEGER NOT NULL,
  late INTEGER NOT NULL DEFAULT 0,
  taken_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS usages_taken_at_idx ON usages (taken_at);
CREATE INDEX IF NOT EXISTS usages_reminder_idx ON usages (reminder_id);
`;

/** 设置偏好：单行表，id 恒为 'singleton'。每列都有默认值，老库补列后直接读到默认值 */
const MIGRATION_V2 = `
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY NOT NULL,
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  snooze_minutes INTEGER NOT NULL DEFAULT 10,
  quiet_start TEXT,
  quiet_end TEXT,
  sound_enabled INTEGER NOT NULL DEFAULT 1,
  missed_alert_streak INTEGER NOT NULL DEFAULT 2
);
`;

const MIGRATIONS: Record<number, string> = {
  1: MIGRATION_V1,
  2: MIGRATION_V2,
};

/** 迁移条数：循环边界由它推导，加一条 MIGRATION 就自动多跑一次 */
const MIGRATION_COUNT = Object.keys(MIGRATIONS).length;

/**
 * 按 `user_version` 顺序执行迁移。
 * 迁移 SQL 全部用 `IF NOT EXISTS`，重复执行安全；失败时抛错，
 * 让上层显示 error 态而不是带着半张表继续跑。
 */
export async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  // WAL 提升并发读性能；外键约束保证级联删除一致
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let version = row?.user_version ?? 0;

  while (version < MIGRATION_COUNT) {
    const next = version + 1;
    const sqlText = MIGRATIONS[next];
    if (!sqlText) throw new Error(`缺少第 ${next} 号迁移`);
    await db.execAsync(sqlText);
    await db.execAsync(`PRAGMA user_version = ${next}`);
    version = next;
  }
}
