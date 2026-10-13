import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DependencyList,
} from "react";

import {
  definedValues,
  deleteMedication as deleteMedicationRow,
  deletePendingRemindersForPlan,
  deletePerson as deletePersonRow,
  deletePlan as deletePlanRow,
  deletePacksForMedication,
  deletePlansForMedication,
  deletePlansForPerson,
  deleteRemindersBefore,
  deleteRemindersForPlans,
  deleteSlotsForPacks,
  deleteUsage,
  getMedication,
  getPack,
  getPerson,
  getPlan,
  getReminder,
  getSettings,
  getSlot,
  getUsage,
  hasRemindersBefore,
  insertMedication,
  insertPack,
  insertPerson,
  insertPlan,
  insertReminders,
  insertSlots,
  insertUsage,
  listMedications,
  listMedicationsByIds,
  listOpenReminders,
  listPacksForMedication,
  listPendingReminders,
  listPersons,
  listPersonsByIds,
  listPlans,
  listPlansForMedication,
  listPlansForPerson,
  listRecentUsages,
  listRemindersForDate,
  listRemindersInRange,
  listSlotsByUsage,
  listSlotsForMedication,
  listSlotsForPacks,
  listUsagesForMedication,
  saveSettings,
  updateMedication as updateMedicationRow,
  updatePerson as updatePersonRow,
  updatePlan as updatePlanRow,
  updateReminder,
  updateSlot,
  updateSlots,
  withTransaction,
  type Tx,
} from "@/db/repo";
import { getTranslator } from "@/i18n";
import {
  addDays,
  dateToTime,
  DEFAULT_SETTINGS,
  nextFullSlots,
  pickAvatarColor,
  planActiveOnDate,
  reminderMissDate,
  todayKey,
  type BlisterPack,
  type BlisterSlot,
  type Gender,
  type Medication,
  type MedicationPlan,
  type MedicationUsage,
  type Person,
  type Reminder,
  type Settings,
} from "@/lib/entities";

// 实体类型、常量与纯函数统一从 entities 再导出：屏幕的 import 路径不变
export * from "@/lib/entities";

// ─── 策略常量 ──────────────────────────────────────────────

/** 提前生成的天数（含今天） */
const GENERATE_AHEAD_DAYS = 7;

/** 提醒保留天数：更早的已处理提醒会被清理，服用记录永久保留 */
const REMINDER_KEEP_DAYS = 90;

/** 每板单边格数上限：防手滑填出 100×100 的「药板」把网格和账一起撑坏 */
const MAX_PACK_SIDE = 12;

/** 夹紧每板行列：板是物理实体，1~12 之间 */
function clampSide(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.round(n), 1), MAX_PACK_SIDE);
}

// ─── id / 时间戳 ───────────────────────────────────────────

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── 写操作编排 ────────────────────────────────────────────

/** 数据变更后的全局钩子（用于通知重排），由根布局注册 */
let postMutationHook: (() => void) | null = null;

export function setPostMutationHook(hook: (() => void) | null): void {
  postMutationHook = hook;
}

/** 写队列：串行化所有事务，读写之间不被另一个写操作插队 */
let writeQueue: Promise<void> = Promise.resolve();

/**
 * 执行一个事务写操作，完成后触发通知重排。
 *
 * 串行化与历史版本同一目的：「已服用」进行到一半又进来一次「撤销」时，
 * 后者的读必须看到前者的写。单次失败只记日志不外抛 —— 事务已整体回滚，
 * 不会留下半份数据，屏幕随后 reload 会看到操作未生效。
 */
async function mutate(fn: (tx: Tx) => Promise<void>): Promise<void> {
  writeQueue = writeQueue
    .catch(() => {})
    .then(() => withTransaction(fn))
    .catch((error) => {
      console.warn("数据写入失败", error);
    });
  await writeQueue;
  // 即便本次写入失败也重排一次：通知必须和库里的真实状态一致
  postMutationHook?.();
}

// ─── 提醒同步（纯决策 + 差异落库） ─────────────────────────

export type ReminderSyncChanges = {
  /** 需要新建的提醒 */
  toInsert: Reminder[];
  /** 需要标记为漏服的提醒（id + 判定时刻） */
  toMarkMissed: { id: string; resolvedAt: string }[];
};

/**
 * 计算提醒同步要做的变更（纯函数，输入输出与 IO 无关）：
 * 1. 为传入的配置补生成 今天 ~ 今天+6 天 内缺失的提醒
 * 2. 超过宽限期仍未处理的 pending 提醒标记为「漏服」
 *
 * `pending` 只用于判漏服，不参与生成；调用方传空数组即跳过第二步
 * （改配置后的按配置重生成走这条，漏服判定只属于全局 syncReminders）。
 */
export function planReminderSync(input: {
  plans: MedicationPlan[];
  /** 生成窗口内已存在的提醒，去重靠它 + 库上的 UNIQUE (plan_id, date, time) 兜底 */
  windowReminders: Reminder[];
  /** 全部 pending 提醒（判漏服用） */
  pending: Reminder[];
  today: string;
  now: Date;
  newId: () => string;
  nowIso: () => string;
}): ReminderSyncChanges {
  const {
    plans,
    windowReminders,
    pending,
    today,
    now,
    newId,
    nowIso: stamp,
  } = input;
  const existing = new Set(
    windowReminders.map((r) => `${r.planId}|${r.date}|${r.time}`),
  );
  const toInsert: Reminder[] = [];
  for (const plan of plans) {
    for (let i = 0; i < GENERATE_AHEAD_DAYS; i++) {
      const key = addDays(today, i);
      if (!planActiveOnDate(plan, key)) continue;
      for (const time of plan.times) {
        const idKey = `${plan.id}|${key}|${time}`;
        if (existing.has(idKey)) continue;
        existing.add(idKey);
        toInsert.push({
          id: newId(),
          planId: plan.id,
          medicationId: plan.medicationId,
          personId: plan.personId,
          date: key,
          time,
          doseAmount: plan.doseAmount,
          status: "pending",
          createdAt: stamp(),
        });
      }
    }
  }

  const toMarkMissed: ReminderSyncChanges["toMarkMissed"] = [];
  for (const reminder of pending) {
    if (reminderMissDate(reminder) < now) {
      toMarkMissed.push({ id: reminder.id, resolvedAt: stamp() });
    }
  }
  return { toInsert, toMarkMissed };
}

/** 生成窗口的日期区间（含两端） */
function generationWindow(today = todayKey()): { from: string; to: string } {
  return { from: today, to: addDays(today, GENERATE_AHEAD_DAYS - 1) };
}

/**
 * 同步提醒（幂等）：补生成、判漏服、清理过早的已处理提醒。
 * 返回是否有变更 —— 有变更时已经落库并触发通知重排。
 *
 * 界面类查询（useOpenReminders / useRemindersForDate / useReminderHistory）
 * 读数据前都会先跑一遍：用户看到的状态必须和状态机的当前判定一致。
 *
 * 整个同步串行执行：生成前的读不在写事务里，两个屏幕同时聚焦会算出同一批
 * 新提醒，靠 UNIQUE (plan_id, date, time) 兜底也会让其中一次事务失败。
 */
let syncChain: Promise<unknown> = Promise.resolve();

export async function syncReminders(): Promise<boolean> {
  const run = syncChain
    .catch(() => {})
    .then(async (): Promise<boolean> => {
      const today = todayKey();
      const range = generationWindow(today);
      const [plans, windowReminders, pending] = await Promise.all([
        listPlans(),
        listRemindersInRange(range.from, range.to),
        listPendingReminders(),
      ]);
      const changes = planReminderSync({
        plans,
        windowReminders,
        pending,
        today,
        now: new Date(),
        newId: genId,
        nowIso,
      });
      const cutoff = addDays(today, -REMINDER_KEEP_DAYS);
      const stale = await hasRemindersBefore(cutoff);
      if (
        changes.toInsert.length === 0 &&
        changes.toMarkMissed.length === 0 &&
        !stale
      ) {
        return false;
      }
      await mutate(async (tx) => {
        await insertReminders(changes.toInsert, tx);
        for (const item of changes.toMarkMissed) {
          await updateReminder(
            item.id,
            { status: "missed", resolvedAt: item.resolvedAt },
            tx,
          );
        }
        if (stale) await deleteRemindersBefore(cutoff, tx);
      });
      return true;
    });
  syncChain = run;
  return run;
}

/**
 * 按配置重生成它的提醒：作废未处理的，再补生成窗口内缺失的。
 *
 * 改时间 / 剂量 / 停用都会立即反映到未来的提醒上；已服用 / 已跳过 / 已漏服
 * 的记录作为历史保留。新增配置与 applyPlanChanges 共用这一条路。
 */
async function regeneratePlanReminders(
  plan: MedicationPlan,
  tx: Tx,
): Promise<void> {
  await deletePendingRemindersForPlan(plan.id, tx);
  const today = todayKey();
  const range = generationWindow(today);
  const windowReminders = await listRemindersInRange(range.from, range.to, tx);
  const changes = planReminderSync({
    plans: [plan],
    windowReminders,
    pending: [],
    today,
    now: new Date(),
    newId: genId,
    nowIso,
  });
  await insertReminders(changes.toInsert, tx);
}

// ─── 泡罩孪生：建板 / 补板的纯决策 ─────────────────────────

export type TwinBuildResult = {
  packs: BlisterPack[];
  slots: BlisterSlot[];
  /** 药品行上要跟着改的字段 */
  patch: Partial<Medication>;
};

/**
 * 计算开启数字孪生要建的板与槽（纯函数）。
 *
 * 不变式：建板后 Σfull === remainingQuantity，Σ全部格 === 板数 × 每板粒数。
 * 板数至少要装得下当前剩余；`totalQuantity` 重写为真实槽位数 ——
 * 老数据「记了 25 但一板 30」这类账，以物理板为准修正。
 * 重复开启 = 重建：旧板旧格由调用方先删（见 openBlisterTwin）。
 */
export function planTwinBuild(
  medication: Medication,
  input: { rows: number; cols: number; packCount: number },
  newId: () => string,
  stamp: () => string,
): TwinBuildResult {
  const rows = clampSide(input.rows);
  const cols = clampSide(input.cols);
  const perPack = rows * cols;
  const packCount = Math.max(
    1,
    Math.round(input.packCount) || 1,
    Math.ceil(medication.remainingQuantity / perPack),
  );
  const now = stamp();
  const packs: BlisterPack[] = [];
  const slots: BlisterSlot[] = [];
  // 总格数减剩余 = 已经被吃掉的历史格数，按板序格序从第一格开始标 empty
  // （usageId 为 null，UI 显示「历史消耗 · 无服用记录」）
  let history = packCount * perPack - medication.remainingQuantity;
  for (let seq = 1; seq <= packCount; seq++) {
    const pack: BlisterPack = {
      id: newId(),
      medicationId: medication.id,
      seq,
      rows,
      cols,
      createdAt: now,
    };
    packs.push(pack);
    for (let index = 0; index < perPack; index++) {
      slots.push({
        id: newId(),
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
    packs,
    slots,
    patch: {
      blisterRows: rows,
      blisterCols: cols,
      totalQuantity: packCount * perPack,
      updatedAt: now,
    },
  };
}

/** 计算按板补货要追加的板与槽（纯函数） */
export function planPackAppend(
  medication: Medication,
  ownPacks: BlisterPack[],
  count: number,
  newId: () => string,
  stamp: () => string,
): TwinBuildResult {
  const rows = clampSide(medication.blisterRows ?? 1);
  const cols = clampSide(medication.blisterCols ?? 1);
  const perPack = rows * cols;
  let nextSeq = ownPacks.reduce((max, p) => Math.max(max, p.seq), 0) + 1;
  const now = stamp();
  const packs: BlisterPack[] = [];
  const slots: BlisterSlot[] = [];
  for (let i = 0; i < count; i++) {
    const pack: BlisterPack = {
      id: newId(),
      medicationId: medication.id,
      seq: nextSeq,
      rows,
      cols,
      createdAt: now,
    };
    nextSeq += 1;
    packs.push(pack);
    for (let index = 0; index < perPack; index++) {
      slots.push({
        id: newId(),
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
    packs,
    slots,
    patch: {
      totalQuantity: medication.totalQuantity + count * perPack,
      remainingQuantity: medication.remainingQuantity + count * perPack,
      updatedAt: now,
    },
  };
}

// ─── 提醒处理（核心闭环） ─────────────────────────────────

/**
 * 已服用：生成服用记录并扣减库存。
 * 待服用和漏服状态都可以补记（漏服补记会标记 late）。
 */
export async function takeReminder(id: string): Promise<void> {
  const takenAt = nowIso();
  await mutate(async (tx) => {
    const reminder = await getReminder(id, tx);
    if (
      !reminder ||
      (reminder.status !== "pending" && reminder.status !== "missed")
    ) {
      return;
    }
    const [medication, person] = await Promise.all([
      getMedication(reminder.medicationId, tx),
      getPerson(reminder.personId, tx),
    ]);
    const t = getTranslator();
    const usage: MedicationUsage = {
      id: genId(),
      reminderId: reminder.id,
      planId: reminder.planId,
      medicationId: reminder.medicationId,
      personId: reminder.personId,
      // 药品 / 用药人可能已删：历史里留删除时的占位快照，不清记录
      personName: person?.name ?? t("status.deletedPerson"),
      medicationName: medication?.name ?? t("status.deletedMedication"),
      time: reminder.time,
      amount: reminder.doseAmount,
      late: reminder.status === "missed",
      takenAt,
      createdAt: takenAt,
    };
    await insertUsage(usage, tx);
    await updateReminder(id, { status: "taken", resolvedAt: takenAt }, tx);
    if (!medication) return;
    await updateMedicationRow(
      reminder.medicationId,
      {
        remainingQuantity: Math.max(
          0,
          medication.remainingQuantity - reminder.doseAmount,
        ),
        updatedAt: takenAt,
      },
      tx,
    );
    // 板装孪生：按泡罩顺序消耗槽位。槽位不足时 targets 为空，库存照扣 ——
    // 服药闭环不因孪生数据不完整而阻断
    const ownPacks = await listPacksForMedication(reminder.medicationId, tx);
    if (ownPacks.length === 0) return;
    const ownSlots = await listSlotsForPacks(
      ownPacks.map((p) => p.id),
      tx,
    );
    const targets = nextFullSlots(ownPacks, ownSlots, reminder.doseAmount);
    await updateSlots(
      targets.map((s) => s.id),
      {
        status: "empty",
        usageId: usage.id,
        consumedAt: takenAt,
        consumedBy: usage.personName,
      },
      tx,
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
  await mutate(async (tx) => {
    const delay = minutes ?? (await getSettings(tx)).snoozeMinutes;
    const until = new Date(Date.now() + delay * 60 * 1000).toISOString();
    const reminder = await getReminder(id, tx);
    if (
      !reminder ||
      (reminder.status !== "pending" && reminder.status !== "missed")
    ) {
      return;
    }
    await updateReminder(id, { snoozedUntil: until }, tx);
  });
}

/** 跳过本次提醒（待服用和漏服都可以标记为跳过），不扣减库存 */
export async function skipReminder(id: string): Promise<void> {
  const resolvedAt = nowIso();
  await mutate(async (tx) => {
    const reminder = await getReminder(id, tx);
    if (
      !reminder ||
      (reminder.status !== "pending" && reminder.status !== "missed")
    ) {
      return;
    }
    await updateReminder(id, { status: "skipped", resolvedAt }, tx);
  });
}

// ─── 泡罩孪生写操作 ───────────────────────────────────────

/** 补货：增加总数量与剩余数量 */
export async function restockMedication(
  id: string,
  amount: number,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  await mutate(async (tx) => {
    const medication = await getMedication(id, tx);
    if (!medication) return;
    // 板装药已建孪生时按粒数补货会破坏「Σfull === remainingQuantity」不变式
    // （补进来的药没有对应的槽位），这类药的补货必须走 appendBlisterPacks 按板补
    const ownPacks = await listPacksForMedication(id, tx);
    if (ownPacks.length > 0) return;
    await updateMedicationRow(
      id,
      {
        totalQuantity: medication.totalQuantity + amount,
        remainingQuantity: medication.remainingQuantity + amount,
        updatedAt: nowIso(),
      },
      tx,
    );
  });
}

/** 为存量板装药开启数字孪生（孪生页承载引导表单）。重复开启 = 重建 */
export async function openBlisterTwin(
  medicationId: string,
  input: { rows: number; cols: number; packCount: number },
): Promise<void> {
  await mutate(async (tx) => {
    const medication = await getMedication(medicationId, tx);
    if (!medication || medication.type !== "blister") return;
    const ownPacks = await listPacksForMedication(medicationId, tx);
    const built = planTwinBuild(medication, input, genId, nowIso);
    if (ownPacks.length > 0) {
      await deleteSlotsForPacks(
        ownPacks.map((p) => p.id),
        tx,
      );
      await deletePacksForMedication(medicationId, tx);
    }
    for (const pack of built.packs) await insertPack(pack, tx);
    await insertSlots(built.slots, tx);
    await updateMedicationRow(medicationId, built.patch, tx);
  });
}

/** 补货（按板）：追加 count 块满板。板装孪生专用，散装/瓶装走 restockMedication */
export async function appendBlisterPacks(
  medicationId: string,
  count: number,
): Promise<void> {
  if (!Number.isFinite(count) || count <= 0) return;
  await mutate(async (tx) => {
    const medication = await getMedication(medicationId, tx);
    if (!medication) return;
    const ownPacks = await listPacksForMedication(medicationId, tx);
    const built = planPackAppend(
      medication,
      ownPacks,
      Math.round(count),
      genId,
      nowIso,
    );
    for (const pack of built.packs) await insertPack(pack, tx);
    await insertSlots(built.slots, tx);
    await updateMedicationRow(medicationId, built.patch, tx);
  });
}

/**
 * 手动记一次服用（孪生页点格子）：产生一条无提醒来源的 usage 并消耗**这一格**。
 *
 * 与 takeReminder 的按序消耗不同 —— 用户点了哪一格就消耗哪一格：泡罩可以
 * 从任意位置抠开，孪生要镜像用户实际做的事，而不是替他决定。
 */
export async function consumeBlisterSlot(
  slotId: string,
  personId: string,
): Promise<void> {
  await mutate(async (tx) => {
    const slot = await getSlot(slotId, tx);
    if (!slot || slot.status !== "full") return;
    const pack = await getPack(slot.packId, tx);
    if (!pack) return;
    const [medication, person] = await Promise.all([
      getMedication(pack.medicationId, tx),
      getPerson(personId, tx),
    ]);
    if (!medication || !person) return;
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
    await insertUsage(usage, tx);
    await updateSlot(
      slotId,
      {
        status: "empty",
        usageId: usage.id,
        consumedAt: now,
        consumedBy: usage.personName,
      },
      tx,
    );
    await updateMedicationRow(
      medication.id,
      {
        remainingQuantity: Math.max(0, medication.remainingQuantity - 1),
        updatedAt: now,
      },
      tx,
    );
  });
}

/** 标记槽位损坏 / 遗失：物理上没吃但格子里没药了。不产生服用记录，库存 −1 */
export async function voidBlisterSlot(slotId: string): Promise<void> {
  await mutate(async (tx) => {
    const slot = await getSlot(slotId, tx);
    if (!slot || slot.status !== "full") return;
    const pack = await getPack(slot.packId, tx);
    if (!pack) return;
    const now = nowIso();
    await updateSlot(
      slotId,
      { status: "void", usageId: null, consumedBy: null },
      tx,
    );
    const medication = await getMedication(pack.medicationId, tx);
    if (!medication) return;
    await updateMedicationRow(
      pack.medicationId,
      {
        remainingQuantity: Math.max(0, medication.remainingQuantity - 1),
        updatedAt: now,
      },
      tx,
    );
  });
}

/**
 * 恢复槽位为未服用：void 或历史 empty（无 usage）→ full，库存 +1。
 * 有服用记录的格子必须走 undoUsage —— 那条路还要删 usage、回退提醒。
 */
export async function restoreBlisterSlot(slotId: string): Promise<void> {
  await mutate(async (tx) => {
    const slot = await getSlot(slotId, tx);
    if (!slot || slot.status === "full" || slot.usageId) return;
    const pack = await getPack(slot.packId, tx);
    if (!pack) return;
    const now = nowIso();
    await updateSlot(
      slotId,
      { status: "full", usageId: null, consumedAt: null, consumedBy: null },
      tx,
    );
    const medication = await getMedication(pack.medicationId, tx);
    if (!medication) return;
    await updateMedicationRow(
      pack.medicationId,
      {
        remainingQuantity: Math.min(
          medication.totalQuantity,
          medication.remainingQuantity + 1,
        ),
        updatedAt: now,
      },
      tx,
    );
  });
}

/**
 * 撤销一次服用：删 usage、回退提醒状态、恢复槽位、回补库存。
 *
 * 提醒回退到 pending 而非 taken —— 撤销后这次剂量重新进入待处理，
 * 已过宽限期会被 syncReminders 再次判为漏服（撤销补记不等于没漏过）。
 */
export async function undoUsage(usageId: string): Promise<void> {
  await mutate(async (tx) => {
    const usage = await getUsage(usageId, tx);
    if (!usage) return;
    const now = nowIso();
    if (usage.reminderId) {
      const reminder = await getReminder(usage.reminderId, tx);
      if (reminder && reminder.status !== "pending") {
        await updateReminder(
          reminder.id,
          { status: "pending", resolvedAt: null },
          tx,
        );
      }
    }
    const hit = await listSlotsByUsage(usageId, tx);
    if (hit.length > 0) {
      await updateSlots(
        hit.map((s) => s.id),
        { status: "full", usageId: null, consumedAt: null, consumedBy: null },
        tx,
      );
    }
    const medication = await getMedication(usage.medicationId, tx);
    if (medication) {
      await updateMedicationRow(
        usage.medicationId,
        {
          remainingQuantity: Math.min(
            medication.totalQuantity,
            medication.remainingQuantity + usage.amount,
          ),
          updatedAt: now,
        },
        tx,
      );
    }
    await deleteUsage(usageId, tx);
  });
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
  await mutate(async (tx) => {
    await insertMedication(medication, tx);
    if (!blister) return;
    const built = planTwinBuild(
      medication,
      { rows: blister.rows, cols: blister.cols, packCount },
      genId,
      nowIso,
    );
    for (const pack of built.packs) await insertPack(pack, tx);
    await insertSlots(built.slots, tx);
    await updateMedicationRow(medication.id, built.patch, tx);
  });
  return medication;
}

export async function updateMedication(
  id: string,
  patch: Partial<Omit<Medication, "id" | "createdAt">>,
): Promise<void> {
  await mutate(async (tx) => {
    await updateMedicationRow(id, { ...patch, updatedAt: nowIso() }, tx);
  });
}

/** 删除药品：级联删除配置、提醒与泡罩孪生；服用记录作为历史永久保留 */
export async function deleteMedication(id: string): Promise<void> {
  await mutate(async (tx) => {
    const [ownPlans, ownPacks] = await Promise.all([
      listPlansForMedication(id, tx),
      listPacksForMedication(id, tx),
    ]);
    if (ownPlans.length > 0) {
      await deleteRemindersForPlans(
        ownPlans.map((p) => p.id),
        tx,
      );
    }
    if (ownPacks.length > 0) {
      await deleteSlotsForPacks(
        ownPacks.map((p) => p.id),
        tx,
      );
    }
    await deletePlansForMedication(id, tx);
    await deletePacksForMedication(id, tx);
    await deleteMedicationRow(id, tx);
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
  const person: Person = {
    id: genId(),
    name: input.name.trim(),
    gender: input.gender,
    age: input.age,
    allergies: input.allergies ?? [],
    underlyingConditions: input.underlyingConditions ?? [],
    // 头像底色按姓名 hash 取色：同名同色，稳定，且不受他人增删影响
    avatarColor: pickAvatarColor(input.name),
    createdAt: nowIso(),
  };
  await mutate(async (tx) => {
    await insertPerson(person, tx);
  });
  return person;
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
  await mutate(async (tx) => {
    const values = definedValues(patch);
    if (values.name !== undefined) values.name = values.name.trim();
    await updatePersonRow(id, values, tx);
  });
}

/** 删除用药人：级联删除配置和提醒；服用记录作为历史永久保留 */
export async function deletePerson(id: string): Promise<void> {
  await mutate(async (tx) => {
    const ownPlans = await listPlansForPerson(id, tx);
    if (ownPlans.length > 0) {
      await deleteRemindersForPlans(
        ownPlans.map((p) => p.id),
        tx,
      );
    }
    await deletePlansForPerson(id, tx);
    await deletePersonRow(id, tx);
  });
}

// ─── 用药配置 CRUD ────────────────────────────────────────

/** 新建用药配置的入参 */
type PlanInput = Omit<MedicationPlan, "id" | "createdAt" | "updatedAt">;

/** 更新用药配置的补丁 */
type PlanPatch = Partial<Omit<MedicationPlan, "id" | "createdAt">>;

export async function addPlan(input: PlanInput): Promise<MedicationPlan> {
  const plan: MedicationPlan = {
    ...input,
    id: genId(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await mutate(async (tx) => {
    await insertPlan(plan, tx);
    await regeneratePlanReminders(plan, tx);
  });
  return plan;
}

/**
 * 更新配置：废弃该配置尚未处理的提醒，再按新配置重新生成。
 * 这样修改时间/剂量/停用都会立即反映到未来的提醒上；
 * 已服用/已跳过/已漏服的记录作为历史保留。
 */
export async function updatePlan(id: string, patch: PlanPatch): Promise<void> {
  await mutate(async (tx) => {
    const current = await getPlan(id, tx);
    if (!current) return;
    const merged: MedicationPlan = {
      ...current,
      ...definedValues(patch),
      updatedAt: nowIso(),
    };
    await updatePlanRow(id, merged, tx);
    await regeneratePlanReminders(merged, tx);
  });
}

/** 删除配置：删除其提醒；服用记录作为历史永久保留 */
export async function deletePlan(id: string): Promise<void> {
  await mutate(async (tx) => {
    await deleteRemindersForPlans([id], tx);
    await deletePlanRow(id, tx);
  });
}

/**
 * 一次落多笔用药配置变更（新增 / 更新 / 删除），只重排一次通知。
 *
 * 「为一位家人一次配多种药」会同时写好几笔配置。逐笔调 addPlan / updatePlan 的话，
 * 每笔都会触发一次全量通知重排（先 cancelAll 再逐条重排），选四种药就闪四次；
 * 这里合成一次事务 + 一次通知重排，语义与逐笔调用完全一致。
 */
export async function applyPlanChanges(changes: {
  add?: PlanInput[];
  update?: { id: string; patch: PlanPatch }[];
  remove?: string[];
}): Promise<void> {
  const add = changes.add ?? [];
  const update = changes.update ?? [];
  const remove = changes.remove ?? [];
  if (add.length === 0 && update.length === 0 && remove.length === 0) return;
  const now = nowIso();
  await mutate(async (tx) => {
    const created = add.map((input) => ({
      ...input,
      id: genId(),
      createdAt: now,
      updatedAt: now,
    }));
    for (const plan of created) await insertPlan(plan, tx);

    const updatedPlans: MedicationPlan[] = [];
    for (const item of update) {
      const current = await getPlan(item.id, tx);
      if (!current) continue;
      const merged: MedicationPlan = {
        ...current,
        ...definedValues(item.patch),
        updatedAt: now,
      };
      await updatePlanRow(item.id, merged, tx);
      updatedPlans.push(merged);
    }

    // 被删的配置连提醒一起走（同 deletePlan）
    if (remove.length > 0) {
      await deleteRemindersForPlans(remove, tx);
      for (const id of remove) await deletePlanRow(id, tx);
    }

    // 被改的配置：尚未处理的提醒作废，交给按配置重生成（已处理的作为历史保留）
    for (const plan of updatedPlans) {
      await deletePendingRemindersForPlan(plan.id, tx);
    }
    const today = todayKey();
    const range = generationWindow(today);
    const windowReminders = await listRemindersInRange(
      range.from,
      range.to,
      tx,
    );
    const changesToInsert = planReminderSync({
      plans: [...created, ...updatedPlans],
      windowReminders,
      pending: [],
      today,
      now: new Date(),
      newId: genId,
      nowIso,
    });
    await insertReminders(changesToInsert.toInsert, tx);
  });
}

// ─── 设置偏好 ─────────────────────────────────────────────

/** 更新设置偏好。写完由 postMutationHook 触发通知重排。 */
export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await mutate(async (tx) => {
    const current = await getSettings(tx);
    // 免打扰成对出现：只改一端等于禁用，统一补齐成 null
    const quietStart = patch.quietStart ?? current.quietStart;
    const quietEnd = patch.quietEnd ?? current.quietEnd;
    await saveSettings(
      {
        ...definedValues(patch),
        quietStart: quietStart && quietEnd ? quietStart : null,
        quietEnd: quietStart && quietEnd ? quietEnd : null,
      },
      tx,
    );
  });
}

/** 开启/关闭免打扰时段。传 null 表示关闭该功能。 */
export async function setQuietHours(
  start: string | null,
  end: string | null,
): Promise<void> {
  await updateSettings({ quietStart: start, quietEnd: end });
}

// ─── 通知调度数据 ─────────────────────────────────────────

/**
 * 通知调度所需的全部数据（按需加载，不再整份读入内存）。
 *
 * `history` 是漏服连击判定的输入：它必须覆盖「从最近一次提醒往回数」的
 * 完整视野，所以取整个保留窗口（与旧版全量 reminders 等价），仍然是有界查询。
 */
export type ScheduleData = {
  settings: Settings;
  /** 待处理提醒（调度对象） */
  pending: Reminder[];
  /** 漏服连击判定用的提醒历史（保留窗口内） */
  history: Reminder[];
  medications: Map<string, Medication>;
  persons: Map<string, Person>;
};

export async function loadScheduleData(): Promise<ScheduleData> {
  const today = todayKey();
  const range = generationWindow(today);
  const [settings, pending, history] = await Promise.all([
    getSettings(),
    listPendingReminders(),
    listRemindersInRange(addDays(today, -REMINDER_KEEP_DAYS), range.to),
  ]);
  const medicationIds = new Set(pending.map((r) => r.medicationId));
  const personIds = new Set([
    ...pending.map((r) => r.personId),
    ...history.map((r) => r.personId),
  ]);
  const [medicationRows, personRows] = await Promise.all([
    listMedicationsByIds([...medicationIds]),
    listPersonsByIds([...personIds]),
  ]);
  return {
    settings,
    pending,
    history,
    medications: new Map(medicationRows.map((m) => [m.id, m])),
    persons: new Map(personRows.map((p) => [p.id, p])),
  };
}

// ─── 查询 Hook ────────────────────────────────────────────

export type QueryState<T> = {
  data: T;
  /** 首屏加载标志。加载没结束时不显示 empty 态（界面四态约定） */
  loading: boolean;
  reload: () => void;
};

/**
 * 按需查询：loader 里只读这一屏要的数据。
 *
 * `deps` 是 loader 依赖的值（如日期），变化即自动重查；`reload` 供
 * `useFocusEffect` 在页面重新聚焦时手动刷新。loader 抛错时保留上一份
 * 数据并结束 loading —— 屏幕走 empty / error 态而不是白屏。
 *
 * `loading` 只是**首屏**加载标志：聚焦刷新 / deps 变化都不翻牌，否则屏幕
 * 会在每次 reload 时闪一下空态。并发请求用序号防乱序（只认最后一次）。
 */
function useQuery<T>(
  loader: () => Promise<T>,
  deps: DependencyList,
  initial: T,
): QueryState<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);
  const seqRef = useRef(0);

  const load = useCallback(() => {
    const seq = (seqRef.current += 1);
    let cancelled = false;
    if (!loadedRef.current) setLoading(true);
    // async IIFE 而不是 promise 链：then/catch 链会撞 promise 插件的
    // always-return / no-callback-in-promise，可读性也更直白
    void (async () => {
      try {
        const result = await loader();
        // 只认最后一次请求：卸载 / deps 变化取消了它，或有更新的请求在飞，
        // 旧响应直接丢弃（否则聚焦刷新会把自动重查的结果覆盖成旧数据）
        if (!cancelled && seq === seqRef.current) setData(result);
      } catch (error) {
        // 读失败保留上一份数据：屏幕走 empty / error 态而不是白屏
        console.warn("数据读取失败", error);
      }
      if (!cancelled && seq === seqRef.current) {
        loadedRef.current = true;
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // deps 由各 Hook 的入参决定，loader 是每次渲染新建的闭包，
    // 不能进依赖数组（否则每次渲染都重查）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // 首次挂载与 deps 变化时从 SQLite 载入 —— 这正是 effect 的用途（与外部系统同步）。
  // load() 是 async，setState 发生在 await 之后的微任务里，并非同步调用，
  // 不会引发级联渲染；react/set-state-in-effect 看不穿 async 边界，此处为误报
  // （oxlint 行内禁用对该规则无效，故在 .oxlintrc.json 用 overrides 关闭）。
  useEffect(() => {
    const cancel = load();
    return cancel;
  }, [load]);

  const reload = useCallback(() => {
    load();
  }, [load]);

  return { data, loading, reload };
}

/** 先同步提醒（幂等）再读：提醒类查询的统一入口 */
async function syncThen<T>(read: () => Promise<T>): Promise<T> {
  await syncReminders();
  return read();
}

// ─── 按屏幕的查询 Hook ────────────────────────────────────

/** 药品全集：药品库列表、首页库存速览、各表单的选项都靠它 */
export function useMedications(): QueryState<Medication[]> {
  return useQuery(listMedications, [], []);
}

export function usePersons(): QueryState<Person[]> {
  return useQuery(listPersons, [], []);
}

/** 用药配置全集：库存估算（stockSummary）要按药聚合全部生效配置 */
export function usePlans(): QueryState<MedicationPlan[]> {
  return useQuery(listPlans, [], []);
}

export function useSettings(): QueryState<Settings> {
  return useQuery(getSettings, [], DEFAULT_SETTINGS);
}

export function useMedication(
  id: string | undefined,
): QueryState<Medication | null> {
  return useQuery(async () => (id ? getMedication(id) : null), [id], null);
}

export function usePerson(id: string | undefined): QueryState<Person | null> {
  return useQuery(async () => (id ? getPerson(id) : null), [id], null);
}

export function usePlan(
  id: string | undefined,
): QueryState<MedicationPlan | null> {
  return useQuery(async () => (id ? getPlan(id) : null), [id], null);
}

/** 某一天的提醒（首页今天 / 服药记录按日期翻页） */
export function useRemindersForDate(date: string): QueryState<Reminder[]> {
  return useQuery(() => syncThen(() => listRemindersForDate(date)), [date], []);
}

/** 未处理的提醒（pending / missed）：首页牌堆 */
export function useOpenReminders(): QueryState<Reminder[]> {
  return useQuery(() => syncThen(listOpenReminders), [], []);
}

/** 保留窗口内的提醒历史：「我的」页本周概览与漏服徽章 */
export function useReminderHistory(): QueryState<Reminder[]> {
  return useQuery(
    () =>
      syncThen(async () => {
        const today = todayKey();
        return listRemindersInRange(
          addDays(today, -REMINDER_KEEP_DAYS),
          addDays(today, GENERATE_AHEAD_DAYS - 1),
        );
      }),
    [],
    [],
  );
}

/** 最近 limit 条服用记录（导出报表） */
export function useRecentUsages(limit: number): QueryState<MedicationUsage[]> {
  return useQuery(() => listRecentUsages(limit), [limit], []);
}

/** 某药品的服用记录（孪生页解析槽位来源） */
export function useUsagesForMedication(
  id: string | undefined,
): QueryState<MedicationUsage[]> {
  return useQuery(
    async () => (id ? listUsagesForMedication(id) : []),
    [id],
    [],
  );
}

/** 某药品的板（孪生页 / 详情页 / 药品表单的孪生判定） */
export function usePacksForMedication(
  id: string | undefined,
): QueryState<BlisterPack[]> {
  return useQuery(async () => (id ? listPacksForMedication(id) : []), [id], []);
}

/** 某药品的全部槽位（孪生页网格 / 详情页孪生概览） */
export function useSlotsForMedication(
  id: string | undefined,
): QueryState<BlisterSlot[]> {
  return useQuery(async () => (id ? listSlotsForMedication(id) : []), [id], []);
}

export function usePlansForMedication(
  id: string | undefined,
): QueryState<MedicationPlan[]> {
  return useQuery(async () => (id ? listPlansForMedication(id) : []), [id], []);
}

export function usePlansForPerson(
  id: string | undefined,
): QueryState<MedicationPlan[]> {
  return useQuery(async () => (id ? listPlansForPerson(id) : []), [id], []);
}
