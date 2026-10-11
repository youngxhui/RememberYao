import { notInArray, sql } from "drizzle-orm";

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

type MedicationRow = typeof medications.$inferSelect;
type PersonRow = typeof persons.$inferSelect;
type PlanRow = typeof plans.$inferSelect;
type ReminderRow = typeof reminders.$inferSelect;
type UsageRow = typeof usages.$inferSelect;
type PackRow = typeof packs.$inferSelect;
type BlisterSlotRow = typeof blisterSlots.$inferSelect;
type SettingsRow = typeof settings.$inferSelect;

/** 仓储层出入参的形状：与 store.ts 的实体类型一一对应，列名用 snake_case。
 *  `settings` 是单行表，固定有一行（`id = 'singleton'`），读出来是数组。 */
export type PersistedData = {
  medications: MedicationRow[];
  persons: PersonRow[];
  plans: PlanRow[];
  reminders: ReminderRow[];
  usages: UsageRow[];
  packs: PackRow[];
  blisterSlots: BlisterSlotRow[];
  settings: SettingsRow[];
};

/** 一次性读出全部表 */
export async function selectAll(): Promise<PersistedData> {
  const db = await getDb();
  const [m, p, pl, r, u, pk, bs, s] = await Promise.all([
    db.select().from(medications),
    db.select().from(persons),
    db.select().from(plans),
    db.select().from(reminders),
    db.select().from(usages),
    db.select().from(packs),
    db.select().from(blisterSlots),
    db.select().from(settings),
  ]);
  return {
    medications: m,
    persons: p,
    plans: pl,
    reminders: r,
    usages: u,
    packs: pk,
    blisterSlots: bs,
    settings: s,
  };
}

function ids(rows: { id: string }[]): string[] {
  return rows.map((r) => r.id);
}

/** notInArray 对空数组生成恒假条件，表达不了"删光"，统一退化成 NOT IN ('') */
function stale(column: Parameters<typeof notInArray>[0], keep: string[]) {
  return notInArray(column, keep.length > 0 ? keep : [""]);
}

/**
 * 全量落盘：upsert 传入的行，再删掉不在集合内的行。
 * 整个过程在一个事务里，失败整体回滚，不会留下半份数据。
 *
 * 这是"整份快照"语义而非增量 SQL —— store.ts 的提醒生成与状态机本来就在
 * 内存里算完整份数据，这里只负责把结果写回去，业务逻辑没有分叉。
 * 家庭用药的数据量很小（一年也就几千行），全量写换来实现简单。
 */
export async function replaceAll(data: PersistedData): Promise<void> {
  const db = await getDb();

  await db.transaction(async (tx) => {
    // set 里显式列出列名：excluded.<列名> 引用的是数据库列，不能用驼峰键
    if (data.medications.length > 0) {
      await tx
        .insert(medications)
        .values(data.medications)
        .onConflictDoUpdate({
          target: medications.id,
          set: {
            name: sql`excluded.name`,
            type: sql`excluded.type`,
            category: sql`excluded.category`,
            specification: sql`excluded.specification`,
            unit: sql`excluded.unit`,
            totalQuantity: sql`excluded.total_quantity`,
            remainingQuantity: sql`excluded.remaining_quantity`,
            blisterRows: sql`excluded.blister_rows`,
            blisterCols: sql`excluded.blister_cols`,
            expiryDate: sql`excluded.expiry_date`,
            prescription: sql`excluded.prescription`,
            notes: sql`excluded.notes`,
            createdAt: sql`excluded.created_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    if (data.persons.length > 0) {
      await tx
        .insert(persons)
        .values(data.persons)
        .onConflictDoUpdate({
          target: persons.id,
          set: {
            name: sql`excluded.name`,
            avatarColor: sql`excluded.avatar_color`,
            gender: sql`excluded.gender`,
            age: sql`excluded.age`,
            allergies: sql`excluded.allergies`,
            underlyingConditions: sql`excluded.underlying_conditions`,
            createdAt: sql`excluded.created_at`,
          },
        });
    }
    if (data.plans.length > 0) {
      await tx
        .insert(plans)
        .values(data.plans)
        .onConflictDoUpdate({
          target: plans.id,
          set: {
            medicationId: sql`excluded.medication_id`,
            personId: sql`excluded.person_id`,
            doseAmount: sql`excluded.dose_amount`,
            times: sql`excluded.times`,
            startDate: sql`excluded.start_date`,
            endDate: sql`excluded.end_date`,
            enabled: sql`excluded.enabled`,
            createdAt: sql`excluded.created_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }
    if (data.reminders.length > 0) {
      await tx
        .insert(reminders)
        .values(data.reminders)
        .onConflictDoUpdate({
          target: reminders.id,
          set: {
            planId: sql`excluded.plan_id`,
            medicationId: sql`excluded.medication_id`,
            personId: sql`excluded.person_id`,
            date: sql`excluded.date`,
            time: sql`excluded.time`,
            doseAmount: sql`excluded.dose_amount`,
            status: sql`excluded.status`,
            snoozedUntil: sql`excluded.snoozed_until`,
            resolvedAt: sql`excluded.resolved_at`,
            createdAt: sql`excluded.created_at`,
          },
        });
    }
    if (data.usages.length > 0) {
      await tx
        .insert(usages)
        .values(data.usages)
        .onConflictDoUpdate({
          target: usages.id,
          set: {
            reminderId: sql`excluded.reminder_id`,
            planId: sql`excluded.plan_id`,
            medicationId: sql`excluded.medication_id`,
            personId: sql`excluded.person_id`,
            personName: sql`excluded.person_name`,
            medicationName: sql`excluded.medication_name`,
            time: sql`excluded.time`,
            amount: sql`excluded.amount`,
            late: sql`excluded.late`,
            takenAt: sql`excluded.taken_at`,
            createdAt: sql`excluded.created_at`,
          },
        });
    }
    if (data.packs.length > 0) {
      await tx
        .insert(packs)
        .values(data.packs)
        .onConflictDoUpdate({
          target: packs.id,
          set: {
            medicationId: sql`excluded.medication_id`,
            seq: sql`excluded.seq`,
            rows: sql`excluded.rows`,
            cols: sql`excluded.cols`,
            createdAt: sql`excluded.created_at`,
          },
        });
    }
    if (data.blisterSlots.length > 0) {
      await tx
        .insert(blisterSlots)
        .values(data.blisterSlots)
        .onConflictDoUpdate({
          target: blisterSlots.id,
          set: {
            packId: sql`excluded.pack_id`,
            index: sql`excluded.index`,
            status: sql`excluded.status`,
            usageId: sql`excluded.usage_id`,
            consumedAt: sql`excluded.consumed_at`,
            consumedBy: sql`excluded.consumed_by`,
          },
        });
    }

    if (data.settings.length > 0) {
      await tx
        .insert(settings)
        .values(data.settings)
        .onConflictDoUpdate({
          target: settings.id,
          set: {
            notificationsEnabled: sql`excluded.notifications_enabled`,
            snoozeMinutes: sql`excluded.snooze_minutes`,
            quietStart: sql`excluded.quiet_start`,
            quietEnd: sql`excluded.quiet_end`,
            soundEnabled: sql`excluded.sound_enabled`,
            missedAlertStreak: sql`excluded.missed_alert_streak`,
          },
        });
    }

    // 先插后删：新行已就位，删除不会破坏引用
    await tx.delete(usages).where(stale(usages.id, ids(data.usages)));
    await tx.delete(reminders).where(stale(reminders.id, ids(data.reminders)));
    await tx.delete(plans).where(stale(plans.id, ids(data.plans)));
    await tx.delete(persons).where(stale(persons.id, ids(data.persons)));
    await tx
      .delete(medications)
      .where(stale(medications.id, ids(data.medications)));
    // 槽位随板走、板随药品走：删除顺序反了会出现悬空引用（虽然本库没有外键约束）
    await tx
      .delete(blisterSlots)
      .where(stale(blisterSlots.id, ids(data.blisterSlots)));
    await tx.delete(packs).where(stale(packs.id, ids(data.packs)));
    // 设置表恒为单行：传空数组表示"用默认值"（首次读库时就是这样），
    // 此时必须跳过删除，否则会把唯一那行删掉、每次启动都重新落默认值
    if (data.settings.length > 0) {
      await tx.delete(settings).where(stale(settings.id, ids(data.settings)));
    }
  });
}
