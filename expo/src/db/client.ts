import { drizzle } from "drizzle-orm/expo-sqlite";
import * as SQLite from "expo-sqlite";

import * as schema from "./schema";

export const DATABASE_NAME = "rememberyao.db";

/**
 * 表结构版本。改 `schema.ts` 就 +1。
 *
 * 开发阶段不做增量迁移：启动时发现库里的版本不是这个值，直接删库重建。
 * 代价是本地数据丢失，开发阶段换表结构本就要重来，比留着半张旧表崩在
 * `no such column` 上好。
 */
const SCHEMA_VERSION = 4;

/** 建表 SQL：与 `schema.ts` 一一对应，只在这份开发用的最新结构上执行 */
const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS medications (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'chronic',
  specification TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL,
  total_quantity INTEGER NOT NULL,
  remaining_quantity INTEGER NOT NULL,
  blister_rows INTEGER,
  blister_cols INTEGER,
  expiry_date TEXT,
  prescription INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS persons (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  avatar_color TEXT NOT NULL,
  avatar_uri TEXT,
  gender TEXT,
  age INTEGER,
  allergies TEXT NOT NULL DEFAULT '[]',
  underlying_conditions TEXT NOT NULL DEFAULT '[]',
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
  reminder_id TEXT,
  plan_id TEXT,
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
CREATE TABLE IF NOT EXISTS packs (
  id TEXT PRIMARY KEY NOT NULL,
  medication_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  rows INTEGER NOT NULL,
  cols INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS packs_medication_idx ON packs (medication_id);
CREATE UNIQUE INDEX IF NOT EXISTS packs_seq_idx ON packs (medication_id, seq);
CREATE TABLE IF NOT EXISTS blister_slots (
  id TEXT PRIMARY KEY NOT NULL,
  pack_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  status TEXT NOT NULL,
  usage_id TEXT,
  consumed_at TEXT,
  consumed_by TEXT
);
CREATE INDEX IF NOT EXISTS blister_slots_pack_idx ON blister_slots (pack_id);
CREATE UNIQUE INDEX IF NOT EXISTS blister_slots_index_idx ON blister_slots (pack_id, slot_index);
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

/** 全部表的清单，删库重建时用。顺序无所谓，没有跨表外键 */
const TABLES = [
  "medications",
  "persons",
  "plans",
  "reminders",
  "usages",
  "packs",
  "blister_slots",
  "settings",
] as const;

/**
 * 每张表应有的 DB 列名，直接从 `schema.ts` 推导 —— 不手写第二份清单，
 * 加列时只改 schema 就够，两边不可能对不上。
 *
 * 走 drizzle 的内部 symbol（`drizzle:Name` / `drizzle:Columns`）而不是 `_`
 * 属性：这个版本的 Table 只把内部状态挂在 symbol 上，`_` 运行时不存在。
 * 取不到就得到空 Map，调用方据此跳过形状检查 —— 升级 drizzle 后最多退回
 * 「只比版本号」的老行为，不会因为读不懂内部结构就把库反复删掉。
 */
const EXPECTED_COLUMNS = new Map<string, string[]>(
  Object.values(schema).flatMap((table) => {
    const internal = table as unknown as Partial<Record<symbol, unknown>>;
    const name = internal[Symbol.for("drizzle:Name")];
    const columns = internal[Symbol.for("drizzle:Columns")] as
      | Record<string, { name: string }>
      | undefined;
    if (typeof name !== "string" || !columns) return [];
    return [[name, Object.values(columns).map((column) => column.name)]];
  }),
);

/**
 * 逐表比对列名：返回缺列的表名清单。
 *
 * 版本号只证明「上次重建过」，证明不了表还是那个形状 —— 加过列但版本已经被
 * 写成新值（改了列忘改版本，或跑过一版只改版本的包）时，`user_version` 一致
 * 会让重建被跳过，写库直接撞 `no such column`。所以版本之外再查一遍真实形状。
 */
async function staleTables(db: SQLite.SQLiteDatabase): Promise<string[]> {
  const stale: string[] = [];
  for (const [table, expected] of EXPECTED_COLUMNS) {
    const rows = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${table})`,
    );
    const actual = new Set(rows.map((row) => row.name));
    if (expected.some((column) => !actual.has(column))) stale.push(table);
  }
  return stale;
}

/** 打开数据库并确保表结构与 `SCHEMA_VERSION` 一致；并发调用只会真正执行一次 */
export async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await ensureSchema(db);
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

/**
 * 版本不符、或表结构与 `schema.ts` 对不上，就整库重建；一致则补齐缺失的表。
 *
 * `user_version` 只在建表成功后才写入，所以中途失败会让版本停留在旧值，
 * 下次启动重来一遍。失败直接抛给上层显示 error 态，不带着半张表继续跑。
 */
async function ensureSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const stored = row?.user_version ?? 0;
  const stale = await staleTables(db);

  if (stored !== SCHEMA_VERSION || stale.length > 0) {
    for (const table of TABLES) {
      await db.execAsync(`DROP TABLE IF EXISTS ${table}`);
    }
  }
  await db.execAsync(CREATE_TABLES);
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
