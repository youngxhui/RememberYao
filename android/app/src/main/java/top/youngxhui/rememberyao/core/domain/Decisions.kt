package top.youngxhui.rememberyao.core.domain

import java.time.Instant
import top.youngxhui.rememberyao.core.model.BlisterPack
import top.youngxhui.rememberyao.core.model.BlisterSlot
import top.youngxhui.rememberyao.core.model.BlisterSlotStatus
import top.youngxhui.rememberyao.core.model.IdGenerator
import top.youngxhui.rememberyao.core.model.Iso8601
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.MedicationPlan
import top.youngxhui.rememberyao.core.model.MedicationType
import top.youngxhui.rememberyao.core.model.MedicationUsage
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.core.model.Reminder
import top.youngxhui.rememberyao.core.model.ReminderStatus
import top.youngxhui.rememberyao.core.model.Settings
import kotlin.math.max

/**
 * 领域层的写操作：全部是「给定涉及的实体 → 算出变更」的纯函数（decision）。
 *
 * 这里没有任何 IO：不碰数据库、不碰通知、不碰 UI。每个函数只接收它真正
 * 用到的实体，返回这些实体的新状态；`Store` 负责按增量写进数据库并重排
 * 通知。好处是每条业务规则都能用普通单元测试覆盖，且两端（iOS 同名同构
 * 的 `Decisions.swift`）可以逐条对齐。
 *
 * 与 `docs/domain-spec.md` 第 4 节逐条对应，改这里必须同步改文档。
 *
 * 命名约定：`decideXxx` 返回 `null` / 空 decision 表示「按规则不执行」，
 * 调用方原样放弃即可。
 */

// MARK: - 输入

/** 新建药品的输入。板装药可随药品一并建板（数字孪生）。 */
data class MedicationInput(
    val name: String,
    val type: MedicationType,
    val category: top.youngxhui.rememberyao.core.model.MedicationCategory,
    val specification: String,
    val unit: top.youngxhui.rememberyao.core.model.MedicationUnit,
    val totalQuantity: Int,
    val remainingQuantity: Int,
    val blisterRows: Int? = null,
    val blisterCols: Int? = null,
    val expiryDate: String? = null,
    val prescription: Boolean,
    val notes: String,
    /** 板装规格；给了就同时建数字孪生。 */
    val blister: BlisterSpec? = null
)

/** 板装规格。 */
data class BlisterSpec(val rows: Int, val cols: Int, val packCount: Int)

/** 新建用药人的入参。 */
data class PersonInput(
    val name: String,
    val gender: top.youngxhui.rememberyao.core.model.Gender? = null,
    val age: Int? = null,
    val allergies: List<String> = emptyList(),
    val underlyingConditions: List<String> = emptyList(),
    /** 头像照片本地 URI；`null` 表示没有照片。 */
    val avatarUri: String? = null
)

/** 新建用药配置的入参。 */
data class PlanInput(
    val medicationId: String,
    val personId: String,
    val doseAmount: Int,
    val times: List<String>,
    val startDate: String,
    val endDate: String? = null,
    val enabled: Boolean = true
)

/** 一条待应用的配置变更：改哪笔、怎么改。 */
data class PlanUpdate(val id: String, val patch: (MedicationPlan) -> MedicationPlan)

/**
 * 一次落多笔用药配置变更（新增 / 更新 / 删除）。
 *
 * 「为一位家人一次配多种药」会同时写好几笔配置。逐笔落库的话，每笔都会触发
 * 一次通知重排，选四种药就闪四次；这里合成一次，语义与逐笔调用完全一致。
 */
data class PlanChanges(
    val add: List<PlanInput> = emptyList(),
    val update: List<PlanUpdate> = emptyList(),
    val remove: List<String> = emptyList()
)

// MARK: - 提醒处理

/**
 * 「已服用」的变更集：一条新服用记录 + 提醒结清 + 库存扣减 + 按泡罩顺序
 * 消耗的槽位。
 */
data class TakeDecision(
    val reminder: Reminder,
    val usage: MedicationUsage,
    /** 扣减后的药品；药品已被删除时为 null（历史记录照记，库存无人可扣）。 */
    val medication: Medication?,
    /** 被消耗的槽位（已标记 empty 并挂上 usageId）。 */
    val consumedSlots: List<BlisterSlot>
)

/**
 * 已服用：生成服用记录并扣减库存。待服用和漏服状态都可以补记
 * （漏服补记会标记 late）。
 *
 * @param ownPacks / ownSlots 该药品自己的板与槽位（调用方按 medicationId 取）。
 */
fun decideTake(
    reminder: Reminder,
    medication: Medication?,
    person: Person?,
    ownPacks: List<BlisterPack>,
    ownSlots: List<BlisterSlot>,
    now: String = Iso8601.now()
): TakeDecision? {
    if (reminder.status != ReminderStatus.PENDING && reminder.status != ReminderStatus.MISSED) {
        return null
    }
    val usage = MedicationUsage(
        id = IdGenerator.generate(),
        reminderId = reminder.id,
        planId = reminder.planId,
        medicationId = reminder.medicationId,
        personId = reminder.personId,
        personName = person?.name ?: Domain.DELETED_PERSON_NAME,
        medicationName = medication?.name ?: Domain.DELETED_MEDICATION_NAME,
        time = reminder.time,
        amount = reminder.doseAmount,
        late = reminder.status == ReminderStatus.MISSED,
        takenAt = now,
        createdAt = now
    )
    val updatedReminder = reminder.copy(status = ReminderStatus.TAKEN, resolvedAt = now)
    val updatedMedication = medication?.copy(
        remainingQuantity = max(0, medication.remainingQuantity - reminder.doseAmount),
        updatedAt = now
    )
    // 板装孪生：按泡罩顺序消耗槽位。槽位不足时列表为空，库存照扣 ——
    // 提醒闭环永不因孪生数据不完整而阻断
    val targets = nextFullSlots(ownPacks, ownSlots, reminder.doseAmount)
    val consumedSlots = targets.map { slot ->
        slot.copy(
            status = BlisterSlotStatus.EMPTY,
            usageId = usage.id,
            consumedAt = now,
            consumedBy = usage.personName
        )
    }
    return TakeDecision(updatedReminder, usage, updatedMedication, consumedSlots)
}

/** 跳过本次提醒（待服用和漏服都可以标记为跳过），不扣减库存。 */
fun decideSkip(reminder: Reminder, now: String = Iso8601.now()): Reminder? {
    if (reminder.status != ReminderStatus.PENDING && reminder.status != ReminderStatus.MISSED) {
        return null
    }
    return reminder.copy(status = ReminderStatus.SKIPPED, resolvedAt = now)
}

/**
 * 稍后提醒：把通知推迟 [minutes] 分钟后再次提醒，不改变提醒状态。
 *
 * minutes 由调用方从设置里取（`settings.snoozeMinutes`）—— 间隔是全局偏好，
 * 不该在每个界面各写一个默认值。
 */
fun decideSnooze(reminder: Reminder, minutes: Int, now: Instant = Instant.now()): Reminder? {
    if (reminder.status != ReminderStatus.PENDING && reminder.status != ReminderStatus.MISSED) {
        return null
    }
    return reminder.copy(snoozedUntil = Iso8601.string(now.plusSeconds(minutes * 60L)))
}

// MARK: - 提醒同步

/**
 * 提醒同步的变更集：补生成 / 标漏服 / 清理。
 *
 * 与旧「整表重算」等价，但输出的是增量 —— Store 只动这些行。
 */
data class ReminderSync(
    val toInsert: List<Reminder> = emptyList(),
    val toUpdate: List<Reminder> = emptyList(),
    val toDelete: List<Reminder> = emptyList()
) {
    val isEmpty: Boolean
        get() = toInsert.isEmpty() && toUpdate.isEmpty() && toDelete.isEmpty()
}

/**
 * 同步提醒（幂等）：
 * 1. 为每个生效中的配置生成 今天 ~ 今天+6 天 的提醒（按 (planId,date,time) 去重）
 * 2. 超过宽限期仍未处理的 pending 标记为「漏服」
 * 3. 清理 90 天前的提醒（服用记录永久保留，不在这里动）
 */
fun decideReminderSync(
    plans: List<MedicationPlan>,
    existing: List<Reminder>,
    today: String = DateKey.today(),
    now: Instant = Instant.now()
): ReminderSync {
    val seen = existing.map { "${it.planId}|${it.date}|${it.time}" }.toMutableSet()
    val toInsert = mutableListOf<Reminder>()
    for (plan in plans) {
        for (offset in 0 until Domain.GENERATE_AHEAD_DAYS) {
            val key = DateKey.addDays(today, offset)
            if (!plan.isActive(day = key)) continue
            for (time in plan.times) {
                val idKey = "${plan.id}|$key|$time"
                if (idKey in seen) continue
                seen.add(idKey)
                toInsert += Reminder(
                    id = IdGenerator.generate(),
                    planId = plan.id,
                    medicationId = plan.medicationId,
                    personId = plan.personId,
                    date = key,
                    time = time,
                    doseAmount = plan.doseAmount,
                    status = ReminderStatus.PENDING,
                    createdAt = Iso8601.now()
                )
            }
        }
    }

    val cutoff = DateKey.addDays(today, -Domain.REMINDER_KEEP_DAYS)
    val toUpdate = mutableListOf<Reminder>()
    val toDelete = mutableListOf<Reminder>()
    for (reminder in existing) {
        if (reminder.date < cutoff) {
            toDelete += reminder
            continue
        }
        if (reminder.status == ReminderStatus.PENDING) {
            val miss = reminder.missDate
            if (miss != null && miss < now) {
                toUpdate += reminder.copy(
                    status = ReminderStatus.MISSED,
                    resolvedAt = Iso8601.now()
                )
            }
        }
    }
    return ReminderSync(toInsert, toUpdate, toDelete)
}

// MARK: - 用药配置变更

/**
 * 一次配置批量变更的完整变更集。
 *
 * 被更新的配置：尚未处理的提醒作废后按新配置重生成（已服用 / 已跳过 /
 * 已漏服作为历史保留）；被删除的配置连提醒一起走。
 */
data class PlanApply(
    val plansToUpsert: List<MedicationPlan> = emptyList(),
    val planIdsToDelete: List<String> = emptyList(),
    /** 要删的提醒 id：被删配置的提醒 + 被改配置的 pending 提醒 + 过期清理。 */
    val remindersToDelete: List<String> = emptyList(),
    val remindersToInsert: List<Reminder> = emptyList(),
    val remindersToUpdate: List<Reminder> = emptyList()
) {
    val isEmpty: Boolean
        get() = plansToUpsert.isEmpty() && planIdsToDelete.isEmpty() &&
            remindersToDelete.isEmpty() && remindersToInsert.isEmpty() &&
            remindersToUpdate.isEmpty()
}

/**
 * 批量应用配置变更：add / update / remove 之后跑一次提醒同步。
 *
 * [addPlan] / [updatePlan] / [deletePlan] 都是它的特例（各只有一项）。
 */
fun decideApplyPlanChanges(
    plans: List<MedicationPlan>,
    reminders: List<Reminder>,
    changes: PlanChanges,
    today: String = DateKey.today(),
    now: Instant = Instant.now()
): PlanApply {
    if (changes.add.isEmpty() && changes.update.isEmpty() && changes.remove.isEmpty()) {
        return PlanApply()
    }
    val nowIso = Iso8601.now()
    val updatedIds = changes.update.map { it.id }.toSet()
    val removedIds = changes.remove.toSet()

    val created = changes.add.map { input ->
        MedicationPlan(
            id = IdGenerator.generate(),
            medicationId = input.medicationId,
            personId = input.personId,
            doseAmount = input.doseAmount,
            times = input.times,
            startDate = input.startDate,
            endDate = input.endDate,
            enabled = input.enabled,
            createdAt = nowIso,
            updatedAt = nowIso
        )
    }

    val plansToUpsert = mutableListOf<MedicationPlan>()
    plansToUpsert += created
    plansToUpsert += plans
        .filter { it.id !in removedIds }
        .map { plan ->
            val entry = changes.update.firstOrNull { it.id == plan.id }
            if (entry == null) plan else entry.patch(plan).copy(updatedAt = nowIso)
        }
    val planIdsToDelete = plans.filter { it.id in removedIds }.map { it.id }

    // 被删配置的提醒整批走；被改配置只作废尚未处理的（历史保留）
    val invalidated = reminders.filter { reminder ->
        reminder.planId in removedIds ||
            (reminder.planId in updatedIds && reminder.status == ReminderStatus.PENDING)
    }
    val invalidatedIds = invalidated.map { it.id }.toSet()
    val surviving = reminders.filter { it.id !in invalidatedIds }

    val sync = decideReminderSync(plansToUpsert, surviving, today, now)
    val toDelete = (invalidatedIds + sync.toDelete.map { it.id }).toList()
    return PlanApply(
        plansToUpsert = plansToUpsert,
        planIdsToDelete = planIdsToDelete,
        remindersToDelete = toDelete,
        remindersToInsert = sync.toInsert,
        remindersToUpdate = sync.toUpdate
    )
}

// MARK: - 药品

/** 新建药品的变更集：药品本身 + 可选的数字孪生（板与槽位）。 */
data class AddMedicationDecision(
    val medication: Medication,
    val twin: TwinPlan?
)

/**
 * 板装孪生的变更集：一批板 + 一批槽位 + 重写规格后的药品。
 *
 * 开孪生（重建）时 Store 先删该药旧板旧格再插这批；补货（追加）时直接插。
 */
data class TwinPlan(
    val packs: List<BlisterPack>,
    val slots: List<BlisterSlot>,
    val medication: Medication
)

fun decideAddMedication(
    input: MedicationInput,
    now: String = Iso8601.now()
): AddMedicationDecision {
    // 新药没有历史消耗：板装时库存直接按「板数 × 每板粒数」给足，
    // 建板逻辑按 remaining 反推历史格数，此时为 0，所有格子都是满的
    val perPack = input.blister?.let { clampSide(it.rows) * clampSide(it.cols) } ?: 0
    val packCount = input.blister?.let { max(1, it.packCount) } ?: 0
    val medication = Medication(
        id = IdGenerator.generate(),
        name = input.name,
        type = input.type,
        category = input.category,
        specification = input.specification,
        unit = input.unit,
        totalQuantity = if (input.blister != null) perPack * packCount else input.totalQuantity,
        remainingQuantity = if (input.blister != null) perPack * packCount else input.remainingQuantity,
        blisterRows = input.blisterRows,
        blisterCols = input.blisterCols,
        expiryDate = input.expiryDate,
        prescription = input.prescription,
        notes = input.notes,
        createdAt = now,
        updatedAt = now
    )
    val twin = input.blister?.let {
        decideOpenTwin(
            medication,
            BlisterSpec(rows = it.rows, cols = it.cols, packCount = packCount),
            now
        )
    }
    return AddMedicationDecision(medication, twin)
}

/** 更新药品：只覆盖 patch 里改动的字段，updatedAt 刷新为现在。 */
fun decideUpdateMedication(
    medication: Medication,
    patch: (Medication) -> Medication,
    now: String = Iso8601.now()
): Medication = patch(medication).copy(updatedAt = now)

/**
 * 补货：增加总数量与剩余数量。
 *
 * 板装药已建孪生时按粒数补货会破坏「Σfull === remainingQuantity」不变式
 * （补进来的药没有对应的槽位），这类药的补货必须走 [decideAppendPacks]
 * 按板补 —— 「有没有孪生」由调用方（Store）查库判断。
 */
fun decideRestock(
    medication: Medication,
    amount: Int,
    now: String = Iso8601.now()
): Medication? {
    if (amount <= 0) return null
    return medication.copy(
        totalQuantity = medication.totalQuantity + amount,
        remainingQuantity = medication.remainingQuantity + amount,
        updatedAt = now
    )
}

// MARK: - 用药人

fun decideAddPerson(input: PersonInput, now: String = Iso8601.now()): Person = Person(
    id = IdGenerator.generate(),
    name = input.name.trim(),
    // 头像底色按姓名 hash 取色：同名同色，稳定，且不受他人增删影响
    avatarColor = pickAvatarColor(input.name),
    avatarUri = input.avatarUri,
    gender = input.gender,
    age = input.age,
    allergies = input.allergies,
    underlyingConditions = input.underlyingConditions,
    createdAt = now
)

/** 更新用药人基础信息（含改名）。只覆盖 patch 里改动的字段。 */
fun decideUpdatePerson(person: Person, patch: (Person) -> Person): Person = patch(person)

// MARK: - 板装孪生

/**
 * 开启数字孪生：为存量板装药建板，按当前剩余量把历史消耗补成 empty 格。
 *
 * 不变式：建板后 Σfull === remainingQuantity，Σ全部格 === 板数 × 每板粒数。
 * 板数至少要装得下当前剩余；`totalQuantity` 重写为真实槽位数 ——
 * 老数据「记了 25 但一板 30」这类账，以物理板为准修正。
 */
fun decideOpenTwin(
    medication: Medication,
    input: BlisterSpec,
    now: String = Iso8601.now()
): TwinPlan? {
    if (medication.type != MedicationType.BLISTER) return null
    val rows = clampSide(input.rows)
    val cols = clampSide(input.cols)
    val perPack = rows * cols
    val packCount = max(
        max(1, input.packCount),
        packsNeeded(medication.remainingQuantity, perPack)
    )

    // 总格数减剩余 = 已经被吃掉的历史格数，按板序格序从第一格开始标 empty
    // （usageId 为 null，UI 显示「历史消耗 · 无服用记录」）
    var history = packCount * perPack - medication.remainingQuantity
    val packs = mutableListOf<BlisterPack>()
    val slots = mutableListOf<BlisterSlot>()
    for (seq in 1..packCount) {
        val pack = BlisterPack(
            id = IdGenerator.generate(),
            medicationId = medication.id,
            seq = seq,
            rows = rows,
            cols = cols,
            createdAt = now
        )
        packs += pack
        for (index in 0 until perPack) {
            slots += BlisterSlot(
                id = IdGenerator.generate(),
                packId = pack.id,
                index = index,
                status = if (history > 0) BlisterSlotStatus.EMPTY else BlisterSlotStatus.FULL,
                usageId = null,
                consumedAt = null,
                consumedBy = null
            )
            if (history > 0) history -= 1
        }
    }
    val updated = medication.copy(
        blisterRows = rows,
        blisterCols = cols,
        totalQuantity = packCount * perPack,
        updatedAt = now
    )
    return TwinPlan(packs, slots, updated)
}

/** 补货（按板）：追加 count 块满板。板装孪生专用，散装 / 瓶装走 [decideRestock]。 */
fun decideAppendPacks(
    medication: Medication,
    existingPacks: List<BlisterPack>,
    count: Int,
    now: String = Iso8601.now()
): TwinPlan? {
    if (count <= 0) return null
    val rows = clampSide(medication.blisterRows ?: 1)
    val cols = clampSide(medication.blisterCols ?: 1)
    val perPack = rows * cols
    var nextSeq = (existingPacks.maxOfOrNull { it.seq } ?: 0) + 1
    val packs = mutableListOf<BlisterPack>()
    val slots = mutableListOf<BlisterSlot>()

    repeat(count) {
        val pack = BlisterPack(
            id = IdGenerator.generate(),
            medicationId = medication.id,
            seq = nextSeq,
            rows = rows,
            cols = cols,
            createdAt = now
        )
        nextSeq += 1
        packs += pack
        for (index in 0 until perPack) {
            slots += BlisterSlot(
                id = IdGenerator.generate(),
                packId = pack.id,
                index = index,
                status = BlisterSlotStatus.FULL,
                usageId = null,
                consumedAt = null,
                consumedBy = null
            )
        }
    }
    val updated = medication.copy(
        totalQuantity = medication.totalQuantity + count * perPack,
        remainingQuantity = medication.remainingQuantity + count * perPack,
        updatedAt = now
    )
    return TwinPlan(packs, slots, updated)
}

/** 槽位操作的变更集：一条 usage + 槽位新状态 + 药品新库存。 */
data class SlotUsageDecision(
    val usage: MedicationUsage,
    val slot: BlisterSlot,
    val medication: Medication
)

/**
 * 手动记一次服用（孪生页点格子）：产生一条无提醒来源的 usage 并消耗**这一格**。
 *
 * 与 [decideTake] 的按序消耗不同 —— 用户点了哪一格就消耗哪一格：泡罩可以
 * 从任意位置抠开，孪生要镜像用户实际做的事，而不是替他决定。
 */
fun decideConsumeSlot(
    slot: BlisterSlot,
    pack: BlisterPack,
    medication: Medication,
    person: Person,
    now: String = Iso8601.now()
): SlotUsageDecision? {
    if (slot.status != BlisterSlotStatus.FULL) return null
    val usage = MedicationUsage(
        id = IdGenerator.generate(),
        reminderId = null,
        planId = null,
        medicationId = medication.id,
        personId = person.id,
        personName = person.name,
        medicationName = medication.name,
        // 手动记录没有计划时间，记操作时刻
        time = Clock.time(Instant.now()),
        amount = 1,
        late = false,
        takenAt = now,
        createdAt = now
    )
    val updatedSlot = slot.copy(
        status = BlisterSlotStatus.EMPTY,
        usageId = usage.id,
        consumedAt = now,
        consumedBy = usage.personName
    )
    val updatedMedication = medication.copy(
        remainingQuantity = max(0, medication.remainingQuantity - 1),
        updatedAt = now
    )
    return SlotUsageDecision(usage, updatedSlot, updatedMedication)
}

/** 标记槽位损坏 / 遗失：物理上没吃但格子里没药了。不产生服用记录，库存 −1。 */
fun decideVoidSlot(
    slot: BlisterSlot,
    medication: Medication,
    now: String = Iso8601.now()
): Pair<BlisterSlot, Medication>? {
    if (slot.status != BlisterSlotStatus.FULL) return null
    val updatedSlot = slot.copy(
        status = BlisterSlotStatus.VOID,
        usageId = null,
        consumedBy = null
    )
    val updatedMedication = medication.copy(
        remainingQuantity = max(0, medication.remainingQuantity - 1),
        updatedAt = now
    )
    return updatedSlot to updatedMedication
}

/**
 * 恢复槽位为未服用：void 或历史 empty（无 usage）→ full，库存 +1。
 * 有服用记录的格子必须走 [decideUndoUsage] —— 那条路还要删 usage、回退提醒。
 */
fun decideRestoreSlot(
    slot: BlisterSlot,
    medication: Medication,
    now: String = Iso8601.now()
): Pair<BlisterSlot, Medication>? {
    if (slot.status == BlisterSlotStatus.FULL || slot.usageId != null) return null
    val updatedSlot = slot.copy(
        status = BlisterSlotStatus.FULL,
        usageId = null,
        consumedAt = null,
        consumedBy = null
    )
    val updatedMedication = medication.copy(
        remainingQuantity = minOf(medication.totalQuantity, medication.remainingQuantity + 1),
        updatedAt = now
    )
    return updatedSlot to updatedMedication
}

/**
 * 撤销一次服用的变更集：删 usage、回退提醒、恢复槽位、回补库存。
 *
 * 提醒回退到 pending 而非 taken —— 撤销后这次剂量重新进入待处理，
 * 已过宽限期会被 [decideReminderSync] 再次判为漏服（撤销补记不等于没漏过）。
 */
data class UndoDecision(
    /** 要回退的提醒；usage 没有来源提醒时为 null。 */
    val reminder: Reminder?,
    /** 恢复成 full 的槽位。 */
    val slots: List<BlisterSlot>,
    /** 回补库存后的药品；药品已删时为 null。 */
    val medication: Medication?
)

fun decideUndoUsage(
    usage: MedicationUsage,
    reminder: Reminder?,
    linkedSlots: List<BlisterSlot>,
    medication: Medication?,
    now: String = Iso8601.now()
): UndoDecision {
    val updatedReminder = reminder?.takeIf { usage.reminderId != null && it.status != ReminderStatus.PENDING }
        ?.copy(status = ReminderStatus.PENDING, resolvedAt = null)
    val updatedSlots = linkedSlots.map { slot ->
        slot.copy(
            status = BlisterSlotStatus.FULL,
            usageId = null,
            consumedAt = null,
            consumedBy = null
        )
    }
    val updatedMedication = medication?.copy(
        remainingQuantity = minOf(medication.totalQuantity, medication.remainingQuantity + usage.amount),
        updatedAt = now
    )
    return UndoDecision(updatedReminder, updatedSlots, updatedMedication)
}

// MARK: - 设置偏好

/**
 * 更新设置偏好。
 *
 * 免打扰成对出现：只改一端等于禁用，统一补齐成 null。
 */
fun decideSettings(current: Settings, patch: (Settings) -> Settings): Settings {
    var settings = patch(current)
    if (settings.quietStart == null || settings.quietEnd == null) {
        settings = settings.copy(quietStart = null, quietEnd = null)
    }
    return settings
}
