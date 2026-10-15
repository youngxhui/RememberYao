import { and, desc, eq, gte, inArray, lte, lt, or } from "drizzle-orm";

import {
  DEFAULT_MEDICATION_CATEGORY,
  DEFAULT_SETTINGS,
  MEDICATION_CATEGORIES,
  type BlisterPack,
  type BlisterSlot,
  type BlisterSlotStatus,
  type Gender,
  type Medication,
  type MedicationCategory,
  type MedicationPlan,
  type MedicationType,
  type MedicationUnit,
  type MedicationUsage,
  type Person,
  type Reminder,
  type ReminderStatus,
  type Settings,
} from "@/lib/entities";

import { getDb } from "./client";
import {
  blisterSlots,
  medications,
  packs,
  persons,
  plans,
  reminders,
  settings,
  usages,
} from "./schema";

/**
 * 仓储层：按实体、按需读写。
 *
 * 每个函数只碰自己那张表（级联删除除外），读什么、写什么由调用方（store）决定 ——
 * 不再有「整份读入内存再整份写回」的快照语义。多表写入包在 `withTransaction`
 * 里保证原子性：要么全部落库，要么整体回滚，不会留下半份数据。
 *
 * 行 ↔ 实体的映射（snake_case 列名、JSON 列、枚举收窄）全部收敛在这一层，
 * store 与屏幕只见到 `@/lib/entities` 的实体形状。
 */

type Db = Awaited<ReturnType<typeof getDb>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** 库连接或事务句柄。granular 函数两者都收：事务边界由调用方控制，
 *  单表操作不传（走全局连接），多表操作包进 withTransaction */
type Handle = Db | Tx;

export type { Handle, Tx };

type MedicationRow = typeof medications.$inferSelect;
type PersonRow = typeof persons.$inferSelect;
type PlanRow = typeof plans.$inferSelect;
type ReminderRow = typeof reminders.$inferSelect;
type UsageRow = typeof usages.$inferSelect;
type SlotRow = typeof blisterSlots.$inferSelect;
type SettingsRow = typeof settings.$inferSelect;

/** 设置单行表的固定 id：表里永远只有一行 */
const SETTINGS_ROW_ID = "singleton";

/**
 * 提醒补丁：可空列（snoozedUntil / resolvedAt）允许显式置 null ——
 * 撤销服用要把处理时间清掉（实体类型里它们是可选而非可空，列是可空）。
 */
export type ReminderPatch = Partial<
  Omit<Reminder, "snoozedUntil" | "resolvedAt">
> & {
  snoozedUntil?: string | null;
  resolvedAt?: string | null;
};

// ─── 行 ↔ 实体映射 ─────────────────────────────────────────

function fromMedicationRow(row: MedicationRow): Medication {
  return {
    ...row,
    type: row.type as MedicationType,
    // 枚举列在库里是自由 TEXT，读出来统一按枚举收窄；不在取值表内的值
    // （理论上不会有）落到首项，而不是把脏值带进 UI
    category: MEDICATION_CATEGORIES.includes(row.category as MedicationCategory)
      ? (row.category as MedicationCategory)
      : DEFAULT_MEDICATION_CATEGORY,
    unit: row.unit as MedicationUnit,
    blisterRows: row.blisterRows ?? null,
    blisterCols: row.blisterCols ?? null,
  };
}

/** 性别列收窄：库里的自由 TEXT 只在取值表内认，其它（脏值 / null）当未填写 */
function parseGender(raw: string | null): Gender | undefined {
  return raw === "male" || raw === "female" || raw === "other"
    ? (raw as Gender)
    : undefined;
}

/** JSON 字符串数组列 → string[]（过敏史 / 基础病），坏值退化成空数组 */
function safeParseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

/** JSON 字符串列 → 时间数组，坏值退化成空数组 */
function safeParseTimes(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function fromPersonRow(row: PersonRow): Person {
  return {
    ...row,
    gender: parseGender(row.gender),
    age: row.age ?? undefined,
    avatarUri: row.avatarUri ?? undefined,
    allergies: safeParseTags(row.allergies),
    underlyingConditions: safeParseTags(row.underlyingConditions),
  };
}

function fromPlanRow(row: PlanRow): MedicationPlan {
  return { ...row, times: safeParseTimes(row.times) };
}

function fromReminderRow(row: ReminderRow): Reminder {
  return {
    ...row,
    status: row.status as ReminderStatus,
    snoozedUntil: row.snoozedUntil ?? undefined,
    resolvedAt: row.resolvedAt ?? undefined,
  };
}

function fromUsageRow(row: UsageRow): MedicationUsage {
  return {
    ...row,
    reminderId: row.reminderId ?? null,
    planId: row.planId ?? null,
  };
}

function fromSlotRow(row: SlotRow): BlisterSlot {
  return {
    ...row,
    status: row.status as BlisterSlotStatus,
    usageId: row.usageId ?? null,
    consumedAt: row.consumedAt ?? null,
    consumedBy: row.consumedBy ?? null,
  };
}

/** 设置行 → 实体。读不到行（新装 / 还没写过设置）时用默认值，
 *  不补一行空记录 —— 单行表的空态就靠返回默认值表达。 */
function fromSettingsRow(row: SettingsRow | undefined): Settings {
  return row ?? DEFAULT_SETTINGS;
}

/** 补丁装配：drizzle 的 set 只接受出现的键，undefined 一律跳过。
 *  导出让 store 层合并设置时复用同一套「未传即不改」语义。 */
export function definedValues<T extends object>(patch: T): Partial<T> {
  const values: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key];
    if (value !== undefined) values[key] = value;
  }
  return values;
}

function toPersonRow(person: Person): typeof persons.$inferInsert {
  return {
    ...person,
    gender: person.gender ?? null,
    age: person.age ?? null,
    avatarUri: person.avatarUri ?? null,
    allergies: JSON.stringify(person.allergies),
    underlyingConditions: JSON.stringify(person.underlyingConditions),
  };
}

function toPlanRow(plan: MedicationPlan): typeof plans.$inferInsert {
  return { ...plan, times: JSON.stringify(plan.times) };
}

function toReminderRow(reminder: Reminder): typeof reminders.$inferInsert {
  return {
    ...reminder,
    snoozedUntil: reminder.snoozedUntil ?? null,
    resolvedAt: reminder.resolvedAt ?? null,
  };
}

function toUsageRow(usage: MedicationUsage): typeof usages.$inferInsert {
  return { ...usage, late: usage.late ?? false };
}

/** 用药人 / 配置的更新补丁 → 列值。JSON 列（过敏 / 基础病 / 服用时间）
 *  在这里序列化；未传的键保持 undefined，由 definedValues 丢掉。
 *  返回行值类型（$inferSelect 的形状）：JSON 列已经是字符串 */
function personSetValues(patch: PersonPatch): Partial<PersonRow> {
  return definedValues({
    ...patch,
    allergies:
      patch.allergies === undefined
        ? undefined
        : JSON.stringify(patch.allergies),
    underlyingConditions:
      patch.underlyingConditions === undefined
        ? undefined
        : JSON.stringify(patch.underlyingConditions),
  });
}

function planSetValues(patch: Partial<MedicationPlan>): Partial<PlanRow> {
  return definedValues({
    ...patch,
    times: patch.times === undefined ? undefined : JSON.stringify(patch.times),
  });
}

// ─── 事务 ──────────────────────────────────────────────────

/**
 * 把多个表的读写包进一个事务。store 的每个写操作都走这里：
 * 单表改动也要原子（如「插 usage + 改提醒 + 扣库存 + 消耗槽位」四表联动）。
 */
export async function withTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const db = await getDb();
  return db.transaction(fn);
}

// ─── 药品 ──────────────────────────────────────────────────

export async function listMedications(db?: Handle): Promise<Medication[]> {
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(medications)
    // 新药在前：与「添加药品」插到列表头部的旧行为一致
    .orderBy(desc(medications.createdAt));
  return rows.map(fromMedicationRow);
}

export async function getMedication(
  id: string,
  db?: Handle,
): Promise<Medication | null> {
  const h = db ?? (await getDb());
  const [row] = await h
    .select()
    .from(medications)
    .where(eq(medications.id, id));
  return row ? fromMedicationRow(row) : null;
}

export async function insertMedication(
  medication: Medication,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h.insert(medications).values(medication);
}

export async function updateMedication(
  id: string,
  patch: Partial<Medication>,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h
    .update(medications)
    .set(definedValues(patch))
    .where(eq(medications.id, id));
}

export async function deleteMedication(id: string, db?: Handle): Promise<void> {
  const h = db ?? (await getDb());
  await h.delete(medications).where(eq(medications.id, id));
}

// ─── 用药人 ────────────────────────────────────────────────

export async function listPersons(db?: Handle): Promise<Person[]> {
  const h = db ?? (await getDb());
  const rows = await h.select().from(persons).orderBy(persons.createdAt);
  return rows.map(fromPersonRow);
}

export async function getPerson(
  id: string,
  db?: Handle,
): Promise<Person | null> {
  const h = db ?? (await getDb());
  const [row] = await h.select().from(persons).where(eq(persons.id, id));
  return row ? fromPersonRow(row) : null;
}

export async function insertPerson(person: Person, db?: Handle): Promise<void> {
  const h = db ?? (await getDb());
  await h.insert(persons).values(toPersonRow(person));
}

/**
 * 用药人更新补丁。`avatarUri` 多一个 null：移除照片要显式写 NULL，
 * 而 `definedValues` 只丢 undefined —— 这正是「不改」与「清空」的分界。
 */
export type PersonPatch = Partial<Omit<Person, "avatarUri">> & {
  avatarUri?: string | null;
};

export async function updatePerson(
  id: string,
  patch: PersonPatch,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h.update(persons).set(personSetValues(patch)).where(eq(persons.id, id));
}

export async function deletePerson(id: string, db?: Handle): Promise<void> {
  const h = db ?? (await getDb());
  await h.delete(persons).where(eq(persons.id, id));
}

// ─── 用药配置 ──────────────────────────────────────────────

export async function listPlans(db?: Handle): Promise<MedicationPlan[]> {
  const h = db ?? (await getDb());
  const rows = await h.select().from(plans).orderBy(plans.createdAt);
  return rows.map(fromPlanRow);
}

export async function listPlansForMedication(
  medicationId: string,
  db?: Handle,
): Promise<MedicationPlan[]> {
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(plans)
    .where(eq(plans.medicationId, medicationId))
    .orderBy(plans.createdAt);
  return rows.map(fromPlanRow);
}

export async function listPlansForPerson(
  personId: string,
  db?: Handle,
): Promise<MedicationPlan[]> {
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(plans)
    .where(eq(plans.personId, personId))
    .orderBy(plans.createdAt);
  return rows.map(fromPlanRow);
}

export async function getPlan(
  id: string,
  db?: Handle,
): Promise<MedicationPlan | null> {
  const h = db ?? (await getDb());
  const [row] = await h.select().from(plans).where(eq(plans.id, id));
  return row ? fromPlanRow(row) : null;
}

export async function insertPlan(
  plan: MedicationPlan,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h.insert(plans).values(toPlanRow(plan));
}

export async function updatePlan(
  id: string,
  patch: Partial<MedicationPlan>,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h.update(plans).set(planSetValues(patch)).where(eq(plans.id, id));
}

export async function deletePlan(id: string, db?: Handle): Promise<void> {
  const h = db ?? (await getDb());
  await h.delete(plans).where(eq(plans.id, id));
}

/** 级联：删某药品的全部配置（删药品时用） */
export async function deletePlansForMedication(
  medicationId: string,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h.delete(plans).where(eq(plans.medicationId, medicationId));
}

/** 级联：删某用药人的全部配置（删用药人时用） */
export async function deletePlansForPerson(
  personId: string,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h.delete(plans).where(eq(plans.personId, personId));
}

// ─── 提醒 ──────────────────────────────────────────────────

export async function listRemindersInRange(
  from: string,
  to: string,
  db?: Handle,
): Promise<Reminder[]> {
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(reminders)
    .where(and(gte(reminders.date, from), lte(reminders.date, to)))
    .orderBy(reminders.date, reminders.time);
  return rows.map(fromReminderRow);
}

export async function listRemindersForDate(
  date: string,
  db?: Handle,
): Promise<Reminder[]> {
  return listRemindersInRange(date, date, db);
}

/** 未处理的提醒（pending / missed）：首页牌堆与调度层用 */
export async function listOpenReminders(db?: Handle): Promise<Reminder[]> {
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(reminders)
    .where(or(eq(reminders.status, "pending"), eq(reminders.status, "missed")))
    .orderBy(reminders.date, reminders.time);
  return rows.map(fromReminderRow);
}

/** 待处理提醒（pending）：漏服判定与通知调度用 */
export async function listPendingReminders(db?: Handle): Promise<Reminder[]> {
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(reminders)
    .where(eq(reminders.status, "pending"))
    .orderBy(reminders.date, reminders.time);
  return rows.map(fromReminderRow);
}

export async function getReminder(
  id: string,
  db?: Handle,
): Promise<Reminder | null> {
  const h = db ?? (await getDb());
  const [row] = await h.select().from(reminders).where(eq(reminders.id, id));
  return row ? fromReminderRow(row) : null;
}

export async function insertReminders(
  list: Reminder[],
  db?: Handle,
): Promise<void> {
  if (list.length === 0) return;
  const h = db ?? (await getDb());
  await h.insert(reminders).values(list.map(toReminderRow));
}

export async function updateReminder(
  id: string,
  patch: ReminderPatch,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h
    .update(reminders)
    .set(definedValues(patch))
    .where(eq(reminders.id, id));
}

export async function deleteReminder(id: string, db?: Handle): Promise<void> {
  const h = db ?? (await getDb());
  await h.delete(reminders).where(eq(reminders.id, id));
}

/** 级联：删若干配置的全部提醒（删药品 / 删用药人时用） */
export async function deleteRemindersForPlans(
  planIds: string[],
  db?: Handle,
): Promise<void> {
  if (planIds.length === 0) return;
  const h = db ?? (await getDb());
  await h.delete(reminders).where(inArray(reminders.planId, planIds));
}

/** 废弃某配置尚未处理的提醒（改配置后按新配置重生成） */
export async function deletePendingRemindersForPlan(
  planId: string,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h
    .delete(reminders)
    .where(and(eq(reminders.planId, planId), eq(reminders.status, "pending")));
}

/** 清理过早的已处理提醒（服用记录永久保留，不在这张表） */
export async function deleteRemindersBefore(
  cutoff: string,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h.delete(reminders).where(lt(reminders.date, cutoff));
}

/** 是否还有早于 cutoff 的提醒（syncReminders 判断要不要清理，避免空写） */
export async function hasRemindersBefore(
  cutoff: string,
  db?: Handle,
): Promise<boolean> {
  const h = db ?? (await getDb());
  const [row] = await h
    .select({ id: reminders.id })
    .from(reminders)
    .where(lt(reminders.date, cutoff))
    .limit(1);
  return Boolean(row);
}

// ─── 服用记录 ──────────────────────────────────────────────

/** 按服用时间倒序取最近 limit 条（导出报表用） */
export async function listRecentUsages(
  limit: number,
  db?: Handle,
): Promise<MedicationUsage[]> {
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(usages)
    .orderBy(desc(usages.takenAt))
    .limit(limit);
  return rows.map(fromUsageRow);
}

/** 某药品的服用记录（孪生页解析槽位来源用），按时间倒序 */
export async function listUsagesForMedication(
  medicationId: string,
  db?: Handle,
): Promise<MedicationUsage[]> {
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(usages)
    .where(eq(usages.medicationId, medicationId))
    .orderBy(desc(usages.takenAt));
  return rows.map(fromUsageRow);
}

export async function getUsage(
  id: string,
  db?: Handle,
): Promise<MedicationUsage | null> {
  const h = db ?? (await getDb());
  const [row] = await h.select().from(usages).where(eq(usages.id, id));
  return row ? fromUsageRow(row) : null;
}

export async function insertUsage(
  usage: MedicationUsage,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h.insert(usages).values(toUsageRow(usage));
}

export async function deleteUsage(id: string, db?: Handle): Promise<void> {
  const h = db ?? (await getDb());
  await h.delete(usages).where(eq(usages.id, id));
}

// ─── 泡罩药板 ──────────────────────────────────────────────

export async function listPacksForMedication(
  medicationId: string,
  db?: Handle,
): Promise<BlisterPack[]> {
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(packs)
    .where(eq(packs.medicationId, medicationId))
    .orderBy(packs.seq);
  return rows;
}

export async function getPack(
  id: string,
  db?: Handle,
): Promise<BlisterPack | null> {
  const h = db ?? (await getDb());
  const [row] = await h.select().from(packs).where(eq(packs.id, id));
  return row ?? null;
}

export async function insertPack(
  pack: BlisterPack,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h.insert(packs).values(pack);
}

/** 级联：删某药品的全部板（重建孪生 / 删药品时用，槽位随板一起删） */
export async function deletePacksForMedication(
  medicationId: string,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h.delete(packs).where(eq(packs.medicationId, medicationId));
}

// ─── 泡罩槽位 ──────────────────────────────────────────────

export async function listSlotsForPacks(
  packIds: string[],
  db?: Handle,
): Promise<BlisterSlot[]> {
  if (packIds.length === 0) return [];
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(blisterSlots)
    .where(inArray(blisterSlots.packId, packIds))
    .orderBy(blisterSlots.packId, blisterSlots.index);
  return rows.map(fromSlotRow);
}

export async function listSlotsForMedication(
  medicationId: string,
  db?: Handle,
): Promise<BlisterSlot[]> {
  const ownPacks = await listPacksForMedication(medicationId, db);
  return listSlotsForPacks(
    ownPacks.map((p) => p.id),
    db,
  );
}

export async function getSlot(
  id: string,
  db?: Handle,
): Promise<BlisterSlot | null> {
  const h = db ?? (await getDb());
  const [row] = await h
    .select()
    .from(blisterSlots)
    .where(eq(blisterSlots.id, id));
  return row ? fromSlotRow(row) : null;
}

export async function insertSlots(
  list: BlisterSlot[],
  db?: Handle,
): Promise<void> {
  if (list.length === 0) return;
  const h = db ?? (await getDb());
  await h.insert(blisterSlots).values(list);
}

export async function updateSlot(
  id: string,
  patch: Partial<BlisterSlot>,
  db?: Handle,
): Promise<void> {
  const h = db ?? (await getDb());
  await h
    .update(blisterSlots)
    .set(definedValues(patch))
    .where(eq(blisterSlots.id, id));
}

/** 批量改槽位（一次服用消耗多格 / 撤销时恢复多格） */
export async function updateSlots(
  ids: string[],
  patch: Partial<BlisterSlot>,
  db?: Handle,
): Promise<void> {
  if (ids.length === 0) return;
  const h = db ?? (await getDb());
  await h
    .update(blisterSlots)
    .set(definedValues(patch))
    .where(inArray(blisterSlots.id, ids));
}

/** 消耗某条服用记录的槽位（撤销服用时回退用） */
export async function listSlotsByUsage(
  usageId: string,
  db?: Handle,
): Promise<BlisterSlot[]> {
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(blisterSlots)
    .where(eq(blisterSlots.usageId, usageId));
  return rows.map(fromSlotRow);
}

/** 级联：删若干板的全部槽位 */
export async function deleteSlotsForPacks(
  packIds: string[],
  db?: Handle,
): Promise<void> {
  if (packIds.length === 0) return;
  const h = db ?? (await getDb());
  await h.delete(blisterSlots).where(inArray(blisterSlots.packId, packIds));
}

// ─── 按 id 批量查（通知调度层反查实体用） ─────────────────

export async function listMedicationsByIds(
  ids: string[],
  db?: Handle,
): Promise<Medication[]> {
  if (ids.length === 0) return [];
  const h = db ?? (await getDb());
  const rows = await h
    .select()
    .from(medications)
    .where(inArray(medications.id, ids));
  return rows.map(fromMedicationRow);
}

export async function listPersonsByIds(
  ids: string[],
  db?: Handle,
): Promise<Person[]> {
  if (ids.length === 0) return [];
  const h = db ?? (await getDb());
  const rows = await h.select().from(persons).where(inArray(persons.id, ids));
  return rows.map(fromPersonRow);
}

// ─── 设置 ──────────────────────────────────────────────────

/** 读全局设置。表里没有行（新装 / 还没写过）时返回默认值，不补行 */
export async function getSettings(db?: Handle): Promise<Settings> {
  const h = db ?? (await getDb());
  const [row] = await h.select().from(settings);
  return fromSettingsRow(row);
}

/** 写全局设置（单行 upsert）。返回合并后的完整设置 */
export async function saveSettings(
  patch: Partial<Settings>,
  db?: Handle,
): Promise<Settings> {
  const h = db ?? (await getDb());
  const merged = { ...(await getSettings(h)), ...definedValues(patch) };
  const row = { id: SETTINGS_ROW_ID, ...merged };
  await h
    .insert(settings)
    .values(row)
    .onConflictDoUpdate({ target: settings.id, set: merged });
  return merged;
}
