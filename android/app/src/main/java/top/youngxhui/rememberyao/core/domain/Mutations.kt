package top.youngxhui.rememberyao.core.domain

import java.time.Instant
import top.youngxhui.rememberyao.core.model.AppData
import top.youngxhui.rememberyao.core.model.BlisterPack
import top.youngxhui.rememberyao.core.model.BlisterSlot
import top.youngxhui.rememberyao.core.model.BlisterSlotStatus
import top.youngxhui.rememberyao.core.model.Gender
import top.youngxhui.rememberyao.core.model.IdGenerator
import top.youngxhui.rememberyao.core.model.Iso8601
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.MedicationCategory
import top.youngxhui.rememberyao.core.model.MedicationPlan
import top.youngxhui.rememberyao.core.model.MedicationType
import top.youngxhui.rememberyao.core.model.MedicationUnit
import top.youngxhui.rememberyao.core.model.MedicationUsage
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.core.model.Reminder
import top.youngxhui.rememberyao.core.model.ReminderStatus
import top.youngxhui.rememberyao.core.model.Settings
import kotlin.math.max

/**
 * 领域层的全部写操作，都是 `AppData -> AppData` 的纯函数。
 *
 * 这里刻意不做任何 IO：不碰数据库、不碰通知、不碰 UI。`Store` 只负责
 * 「读 → 套用 → 写 → 重排通知」这一条流水线。
 *
 * 与 iOS 端 `Core/Domain/Mutations.swift` 逐条对应，规则不差分毫。
 */

// MARK: - 提醒同步

/** 提前生成的天数（含今天）。 */
private val generateAheadDays = Domain.GENERATE_AHEAD_DAYS

/**
 * 同步提醒（幂等，无变更时返回原值）：
 * 1. 为每个生效中的配置生成 今天 ~ 今天+6天 的提醒（不重复生成）
 * 2. 超过宽限期仍未处理的提醒标记为「漏服」
 * 3. 清理过早的已处理提醒（服用记录永久保留）
 */
fun syncReminders(data: AppData): AppData {
    val today = DateKey.today()
    val existing = data.reminders.map { "${it.planId}|${it.date}|${it.time}" }.toMutableSet()
    val newReminders = mutableListOf<Reminder>()

    for (plan in data.plans) {
        for (offset in 0 until generateAheadDays) {
            val key = DateKey.addDays(today, offset)
            if (!plan.isActive(day = key)) continue
            for (time in plan.times) {
                val idKey = "${plan.id}|$key|$time"
                if (idKey in existing) continue
                existing.add(idKey)
                newReminders.add(
                    Reminder(
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
                )
            }
        }
    }

    val now = Instant.now()
    var missedChanged = false
    val marked = data.reminders.map { reminder ->
        if (reminder.status == ReminderStatus.PENDING) {
            val miss = reminder.missDate
            if (miss != null && miss < now) {
                missedChanged = true
                reminder.copy(status = ReminderStatus.MISSED, resolvedAt = Iso8601.now())
            } else {
                reminder
            }
        } else {
            reminder
        }
    }

    val cutoff = DateKey.addDays(today, -Domain.REMINDER_KEEP_DAYS)
    val pruned = marked.filter { it.date >= cutoff }
    val prunedChanged = pruned.size != marked.size

    if (newReminders.isEmpty() && !missedChanged && !prunedChanged) return data
    return data.copy(reminders = pruned + newReminders)
}

/**
 * 用给定的 plans / reminders 跑一次提醒同步。`addPlan` / `updatePlan` /
 * `applyPlanChanges` 都走这里，避免「改配置」与「重新生成提醒」两步之间
 * 被别人插入。其余集合原样保留。
 */
private fun syncReminders(
    plans: List<MedicationPlan>,
    reminders: List<Reminder>,
    base: AppData
): AppData = syncReminders(base.copy(plans = plans, reminders = reminders))

// MARK: - 槽位消耗

/**
 * 消耗指定药品的前 [count] 个 full 槽位。
 *
 * 槽位不足（没建孪生 / 数据对不上）时原样返回 —— 提醒闭环永不因孪生数据
 * 不完整而阻断，库存照扣。
 */
private fun consumeSlots(
    data: AppData,
    medicationId: String,
    count: Int,
    usageId: String,
    consumedAt: String,
    consumedBy: String
): AppData {
    val ownPacks = data.packs.filter { it.medicationId == medicationId }
    if (ownPacks.isEmpty()) return data
    val packIds = ownPacks.map { it.id }.toSet()
    val targets = nextFullSlots(
        ownPacks,
        data.blisterSlots.filter { it.packId in packIds },
        count = count
    )
    if (targets.isEmpty()) return data
    val hit = targets.map { it.id }.toSet()
    return data.copy(
        blisterSlots = data.blisterSlots.map { slot ->
            if (slot.id !in hit) {
                slot
            } else {
                slot.copy(
                    status = BlisterSlotStatus.EMPTY,
                    usageId = usageId,
                    consumedAt = consumedAt,
                    consumedBy = consumedBy
                )
            }
        }
    )
}

// MARK: - 提醒处理

/**
 * 已服用：生成服用记录并扣减库存。
 * 待服用和漏服状态都可以补记（漏服补记会标记 late）。
 */
fun takeReminder(data: AppData, id: String): AppData {
    val takenAt = Iso8601.now()
    val reminder = data.reminders.firstOrNull { it.id == id } ?: return data
    if (reminder.status != ReminderStatus.PENDING && reminder.status != ReminderStatus.MISSED) {
        return data
    }

    val medication = data.medications.firstOrNull { it.id == reminder.medicationId }
    val person = data.persons.firstOrNull { it.id == reminder.personId }
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
        takenAt = takenAt,
        createdAt = takenAt
    )

    var result = data.copy(
        reminders = data.reminders.map { r ->
            if (r.id != id) r else r.copy(status = ReminderStatus.TAKEN, resolvedAt = takenAt)
        },
        usages = listOf(usage) + data.usages,
        medications = data.medications.map { m ->
            if (m.id != reminder.medicationId) {
                m
            } else {
                m.copy(
                    remainingQuantity = max(0, m.remainingQuantity - reminder.doseAmount),
                    updatedAt = takenAt
                )
            }
        }
    )
    // 板装孪生：按泡罩顺序消耗槽位。槽位不足时 consumeSlots 原样返回，库存照扣
    result = consumeSlots(
        result,
        medicationId = reminder.medicationId,
        count = reminder.doseAmount,
        usageId = usage.id,
        consumedAt = takenAt,
        consumedBy = usage.personName
    )
    return result
}

/**
 * 稍后提醒：把通知推迟 [minutes] 分钟后再次提醒，不改变提醒状态。
 *
 * minutes 省略时取设置里的 `snoozeMinutes`（设置页可改），所以调用方只需要
 * 传 id —— 间隔是全局偏好，不该在每个界面各写一个默认值。
 */
fun snoozeReminder(data: AppData, id: String, minutes: Int? = null): AppData {
    val delay = minutes ?: data.settings.snoozeMinutes
    val until = Iso8601.string(Instant.now().plusSeconds(delay * 60L))
    return data.copy(
        reminders = data.reminders.map { r ->
            val allowed = r.status == ReminderStatus.PENDING || r.status == ReminderStatus.MISSED
            if (r.id != id || !allowed) r else r.copy(snoozedUntil = until)
        }
    )
}

/** 跳过本次提醒（待服用和漏服都可以标记为跳过），不扣减库存。 */
fun skipReminder(data: AppData, id: String): AppData {
    val resolvedAt = Iso8601.now()
    return data.copy(
        reminders = data.reminders.map { r ->
            val allowed = r.status == ReminderStatus.PENDING || r.status == ReminderStatus.MISSED
            if (r.id != id || !allowed) r else r.copy(status = ReminderStatus.SKIPPED, resolvedAt = resolvedAt)
        }
    )
}

// MARK: - 药品 CRUD

/** 新建药品的输入。板装药可随药品一并建板（数字孪生）。 */
data class MedicationInput(
    val name: String,
    val type: MedicationType,
    val category: MedicationCategory,
    val specification: String,
    val unit: MedicationUnit,
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

fun addMedication(data: AppData, input: MedicationInput): Pair<AppData, Medication> {
    val now = Iso8601.now()
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
    var result = data.copy(medications = listOf(medication) + data.medications)
    val blister = input.blister
    if (blister != null) {
        result = openBlisterTwin(
            result,
            medication.id,
            BlisterSpec(rows = blister.rows, cols = blister.cols, packCount = packCount)
        )
    }
    return result to medication
}

/**
 * 更新药品：只覆盖 patch 里改动的字段，[Medication.updatedAt] 刷新为现在。
 *
 * patch 用 `(Medication) -> Medication` 而不是一堆可空入参：清空有效期
 * （设成 null）与「不改」必须能区分。
 */
fun updateMedication(data: AppData, id: String, patch: (Medication) -> Medication): AppData {
    val now = Iso8601.now()
    return data.copy(
        medications = data.medications.map { medication ->
            if (medication.id != id) medication else patch(medication).copy(updatedAt = now)
        }
    )
}

/** 删除药品：级联删除配置、提醒与泡罩孪生；服用记录作为历史永久保留。 */
fun deleteMedication(data: AppData, id: String): AppData {
    val planIds = data.plans.filter { it.medicationId == id }.map { it.id }.toSet()
    val packIds = data.packs.filter { it.medicationId == id }.map { it.id }.toSet()
    return data.copy(
        medications = data.medications.filter { it.id != id },
        plans = data.plans.filter { it.medicationId != id },
        reminders = data.reminders.filter { it.planId !in planIds },
        packs = data.packs.filter { it.medicationId != id },
        blisterSlots = data.blisterSlots.filter { it.packId !in packIds }
    )
}

/**
 * 补货：增加总数量与剩余数量。
 *
 * 板装药已建孪生时按粒数补货会破坏「Σfull === remainingQuantity」不变式
 * （补进来的药没有对应的槽位），这类药的补货必须走 [appendBlisterPacks] 按板补。
 */
fun restockMedication(data: AppData, id: String, amount: Int): AppData {
    if (amount <= 0) return data
    if (data.packs.any { it.medicationId == id }) return data
    return updateMedication(data, id) { medication ->
        medication.copy(
            totalQuantity = medication.totalQuantity + amount,
            remainingQuantity = medication.remainingQuantity + amount
        )
    }
}

// MARK: - 用药人 CRUD

/** 新建用药人的入参。 */
data class PersonInput(
    val name: String,
    val gender: Gender? = null,
    val age: Int? = null,
    val allergies: List<String> = emptyList(),
    val underlyingConditions: List<String> = emptyList()
)

fun addPerson(data: AppData, input: PersonInput): Pair<AppData, Person> {
    val now = Iso8601.now()
    val person = Person(
        id = IdGenerator.generate(),
        name = input.name.trim(),
        // 头像底色按姓名 hash 取色：同名同色，稳定，且不受他人增删影响
        avatarColor = pickAvatarColor(input.name),
        gender = input.gender,
        age = input.age,
        allergies = input.allergies,
        underlyingConditions = input.underlyingConditions,
        createdAt = now
    )
    return data.copy(persons = data.persons + person) to person
}

/**
 * 更新用药人基础信息（含改名）。只覆盖 patch 里改动的字段 ——
 * patch 返回的新值即最终值，「未填写也是 null」由调用方自己决定。
 */
fun updatePerson(data: AppData, id: String, patch: (Person) -> Person): AppData =
    data.copy(persons = data.persons.map { if (it.id != id) it else patch(it) })

/** 删除用药人：级联删除配置和提醒；服用记录作为历史永久保留。 */
fun deletePerson(data: AppData, id: String): AppData {
    val planIds = data.plans.filter { it.personId == id }.map { it.id }.toSet()
    return data.copy(
        persons = data.persons.filter { it.id != id },
        plans = data.plans.filter { it.personId != id },
        reminders = data.reminders.filter { it.planId !in planIds }
    )
}

// MARK: - 用药配置 CRUD

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

fun addPlan(data: AppData, input: PlanInput): AppData {
    val now = Iso8601.now()
    val plan = MedicationPlan(
        id = IdGenerator.generate(),
        medicationId = input.medicationId,
        personId = input.personId,
        doseAmount = input.doseAmount,
        times = input.times,
        startDate = input.startDate,
        endDate = input.endDate,
        enabled = input.enabled,
        createdAt = now,
        updatedAt = now
    )
    return syncReminders(
        plans = data.plans + plan,
        reminders = data.reminders,
        base = data
    )
}

/**
 * 更新配置：废弃该配置尚未处理的提醒，再按新配置重新生成。
 * 这样修改时间 / 剂量 / 停用都会立即反映到未来的提醒上；
 * 已服用 / 已跳过 / 已漏服的记录作为历史保留。
 */
fun updatePlan(data: AppData, id: String, patch: (MedicationPlan) -> MedicationPlan): AppData {
    val now = Iso8601.now()
    var found = false
    val plans = data.plans.map { plan ->
        if (plan.id != id) {
            plan
        } else {
            found = true
            patch(plan).copy(updatedAt = now)
        }
    }
    if (!found) return data
    val reminders = data.reminders.filter { !(it.planId == id && it.status == ReminderStatus.PENDING) }
    return syncReminders(plans = plans, reminders = reminders, base = data)
}

/** 删除配置：删除其提醒；服用记录作为历史永久保留。 */
fun deletePlan(data: AppData, id: String): AppData = data.copy(
    plans = data.plans.filter { it.id != id },
    reminders = data.reminders.filter { it.planId != id }
)

/** 一条待应用的配置变更：改哪笔、怎么改。 */
data class PlanUpdate(val id: String, val patch: (MedicationPlan) -> MedicationPlan)

/**
 * 一次落多笔用药配置变更（新增 / 更新 / 删除），只重排一次通知。
 *
 * 「为一位家人一次配多种药」会同时写好几笔配置。逐笔落库的话，每笔都会触发
 * 一次全量通知重排，选四种药就闪四次；这里合成一次，语义与逐笔调用完全一致。
 */
data class PlanChanges(
    val add: List<PlanInput> = emptyList(),
    val update: List<PlanUpdate> = emptyList(),
    val remove: List<String> = emptyList()
)

fun applyPlanChanges(data: AppData, changes: PlanChanges): AppData {
    if (changes.add.isEmpty() && changes.update.isEmpty() && changes.remove.isEmpty()) return data
    val now = Iso8601.now()
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
            createdAt = now,
            updatedAt = now
        )
    }

    var plans = data.plans
        .filter { it.id !in removedIds }
        .map { plan ->
            val entry = changes.update.firstOrNull { it.id == plan.id }
            if (entry == null) plan else entry.patch(plan).copy(updatedAt = now)
        }
    plans = plans + created

    // 被改的配置：尚未处理的提醒作废，交给 syncReminders 按新配置重生成
    // （已服用 / 已跳过 / 已漏服作为历史保留，同 updatePlan）；
    // 被删的配置连提醒一起走（同 deletePlan）
    val reminders = data.reminders.filter { reminder ->
        reminder.planId !in removedIds &&
            !(reminder.planId in updatedIds && reminder.status == ReminderStatus.PENDING)
    }
    return syncReminders(plans = plans, reminders = reminders, base = data)
}

// MARK: - 泡罩孪生

/**
 * 开启数字孪生：为存量板装药建板，按当前剩余量把历史消耗补成 empty 格。
 *
 * 不变式：建板后 Σfull === remainingQuantity，Σ全部格 === 板数 × 每板粒数。
 * 板数至少要装得下当前剩余；`totalQuantity` 重写为真实槽位数 ——
 * 老数据「记了 25 但一板 30」这类账，以物理板为准修正。
 */
fun openBlisterTwin(data: AppData, medicationId: String, input: BlisterSpec): AppData {
    val medication = data.medications.firstOrNull { it.id == medicationId } ?: return data
    if (medication.type != MedicationType.BLISTER) return data
    val rows = clampSide(input.rows)
    val cols = clampSide(input.cols)
    val perPack = rows * cols
    val packCount = max(
        max(1, input.packCount),
        packsNeeded(medication.remainingQuantity, perPack)
    )

    // 重复开启 = 重建：先清掉该药旧的板与格
    val stalePackIds = data.packs.filter { it.medicationId == medicationId }.map { it.id }.toSet()
    val packs = data.packs.filter { it.id !in stalePackIds }.toMutableList()
    val blisterSlots = data.blisterSlots.filter { it.packId !in stalePackIds }.toMutableList()
    val now = Iso8601.now()

    // 总格数减剩余 = 已经被吃掉的历史格数，按板序格序从第一格开始标 empty
    // （usageId 为 null，UI 显示「历史消耗 · 无服用记录」）
    var history = packCount * perPack - medication.remainingQuantity
    for (seq in 1..packCount) {
        val pack = BlisterPack(
            id = IdGenerator.generate(),
            medicationId = medicationId,
            seq = seq,
            rows = rows,
            cols = cols,
            createdAt = now
        )
        packs.add(pack)
        for (index in 0 until perPack) {
            blisterSlots.add(
                BlisterSlot(
                    id = IdGenerator.generate(),
                    packId = pack.id,
                    index = index,
                    status = if (history > 0) BlisterSlotStatus.EMPTY else BlisterSlotStatus.FULL,
                    usageId = null,
                    consumedAt = null,
                    consumedBy = null
                )
            )
            if (history > 0) history -= 1
        }
    }

    return data.copy(
        packs = packs,
        blisterSlots = blisterSlots,
        medications = data.medications.map { m ->
            if (m.id != medicationId) {
                m
            } else {
                m.copy(
                    blisterRows = rows,
                    blisterCols = cols,
                    totalQuantity = packCount * perPack,
                    updatedAt = now
                )
            }
        }
    )
}

/** 补货（按板）：追加 [count] 块满板。板装孪生专用，散装 / 瓶装走 [restockMedication]。 */
fun appendBlisterPacks(data: AppData, medicationId: String, count: Int): AppData {
    if (count <= 0) return data
    val medication = data.medications.firstOrNull { it.id == medicationId } ?: return data
    val rows = clampSide(medication.blisterRows ?: 1)
    val cols = clampSide(medication.blisterCols ?: 1)
    val perPack = rows * cols
    val own = data.packs.filter { it.medicationId == medicationId }
    var nextSeq = (own.maxOfOrNull { it.seq } ?: 0) + 1
    val now = Iso8601.now()
    val packs = data.packs.toMutableList()
    val blisterSlots = data.blisterSlots.toMutableList()

    repeat(count) {
        val pack = BlisterPack(
            id = IdGenerator.generate(),
            medicationId = medicationId,
            seq = nextSeq,
            rows = rows,
            cols = cols,
            createdAt = now
        )
        nextSeq += 1
        packs.add(pack)
        for (index in 0 until perPack) {
            blisterSlots.add(
                BlisterSlot(
                    id = IdGenerator.generate(),
                    packId = pack.id,
                    index = index,
                    status = BlisterSlotStatus.FULL,
                    usageId = null,
                    consumedAt = null,
                    consumedBy = null
                )
            )
        }
    }

    return data.copy(
        packs = packs,
        blisterSlots = blisterSlots,
        medications = data.medications.map { m ->
            if (m.id != medicationId) {
                m
            } else {
                m.copy(
                    totalQuantity = m.totalQuantity + count * perPack,
                    remainingQuantity = m.remainingQuantity + count * perPack,
                    updatedAt = now
                )
            }
        }
    )
}

/**
 * 手动记一次服用（孪生页点格子）：产生一条无提醒来源的 usage 并消耗**这一格**。
 *
 * 与 [takeReminder] 的按序消耗不同 —— 用户点了哪一格就消耗哪一格：泡罩可以
 * 从任意位置抠开，孪生要镜像用户实际做的事，而不是替他决定。
 */
fun consumeBlisterSlot(data: AppData, slotId: String, personId: String): AppData {
    val slot = data.blisterSlots.firstOrNull { it.id == slotId } ?: return data
    if (slot.status != BlisterSlotStatus.FULL) return data
    val pack = data.packs.firstOrNull { it.id == slot.packId } ?: return data
    val medication = data.medications.firstOrNull { it.id == pack.medicationId } ?: return data
    val person = data.persons.firstOrNull { it.id == personId } ?: return data
    val nowInstant = Instant.now()
    val now = Iso8601.now()
    val usage = MedicationUsage(
        id = IdGenerator.generate(),
        reminderId = null,
        planId = null,
        medicationId = medication.id,
        personId = person.id,
        personName = person.name,
        medicationName = medication.name,
        // 手动记录没有计划时间，记操作时刻
        time = Clock.time(nowInstant),
        amount = 1,
        late = false,
        takenAt = now,
        createdAt = now
    )
    return data.copy(
        usages = listOf(usage) + data.usages,
        blisterSlots = data.blisterSlots.map { s ->
            if (s.id != slotId) {
                s
            } else {
                s.copy(
                    status = BlisterSlotStatus.EMPTY,
                    usageId = usage.id,
                    consumedAt = now,
                    consumedBy = usage.personName
                )
            }
        },
        medications = data.medications.map { m ->
            if (m.id != medication.id) {
                m
            } else {
                m.copy(
                    remainingQuantity = max(0, m.remainingQuantity - 1),
                    updatedAt = now
                )
            }
        }
    )
}

/** 标记槽位损坏 / 遗失：物理上没吃但格子里没药了。不产生服用记录，库存 −1。 */
fun voidBlisterSlot(data: AppData, slotId: String): AppData {
    val slot = data.blisterSlots.firstOrNull { it.id == slotId } ?: return data
    if (slot.status != BlisterSlotStatus.FULL) return data
    val pack = data.packs.firstOrNull { it.id == slot.packId } ?: return data
    val now = Iso8601.now()
    return data.copy(
        blisterSlots = data.blisterSlots.map { s ->
            if (s.id != slotId) {
                s
            } else {
                s.copy(status = BlisterSlotStatus.VOID, usageId = null, consumedBy = null)
            }
        },
        medications = data.medications.map { m ->
            if (m.id != pack.medicationId) {
                m
            } else {
                m.copy(remainingQuantity = max(0, m.remainingQuantity - 1), updatedAt = now)
            }
        }
    )
}

/**
 * 恢复槽位为未服用：void 或历史 empty（无 usage）→ full，库存 +1。
 * 有服用记录的格子必须走 [undoUsage] —— 那条路还要删 usage、回退提醒。
 */
fun restoreBlisterSlot(data: AppData, slotId: String): AppData {
    val slot = data.blisterSlots.firstOrNull { it.id == slotId } ?: return data
    if (slot.status == BlisterSlotStatus.FULL || slot.usageId != null) return data
    val pack = data.packs.firstOrNull { it.id == slot.packId } ?: return data
    val now = Iso8601.now()
    return data.copy(
        blisterSlots = data.blisterSlots.map { s ->
            if (s.id != slotId) {
                s
            } else {
                s.copy(
                    status = BlisterSlotStatus.FULL,
                    usageId = null,
                    consumedAt = null,
                    consumedBy = null
                )
            }
        },
        medications = data.medications.map { m ->
            if (m.id != pack.medicationId) {
                m
            } else {
                m.copy(
                    remainingQuantity = minOf(m.totalQuantity, m.remainingQuantity + 1),
                    updatedAt = now
                )
            }
        }
    )
}

/**
 * 撤销一次服用：删 usage、回退提醒状态、恢复槽位、回补库存。
 *
 * 提醒回退到 pending 而非 taken —— 撤销后这次剂量重新进入待处理，
 * 已过宽限期会被 [syncReminders] 再次判为漏服（撤销补记不等于没漏过）。
 */
fun undoUsage(data: AppData, usageId: String): AppData {
    val usage = data.usages.firstOrNull { it.id == usageId } ?: return data
    val now = Iso8601.now()
    val hit = data.blisterSlots.filter { it.usageId == usageId }.map { it.id }.toSet()

    return data.copy(
        reminders = data.reminders.map { r ->
            val reminderId = usage.reminderId
            if (reminderId == null || r.id != reminderId || r.status == ReminderStatus.PENDING) {
                r
            } else {
                r.copy(status = ReminderStatus.PENDING, resolvedAt = null)
            }
        },
        blisterSlots = data.blisterSlots.map { s ->
            if (s.id !in hit) {
                s
            } else {
                s.copy(status = BlisterSlotStatus.FULL, usageId = null, consumedAt = null, consumedBy = null)
            }
        },
        medications = data.medications.map { m ->
            if (m.id != usage.medicationId) {
                m
            } else {
                m.copy(
                    remainingQuantity = minOf(m.totalQuantity, m.remainingQuantity + usage.amount),
                    updatedAt = now
                )
            }
        },
        usages = data.usages.filter { it.id != usageId }
    )
}

// MARK: - 设置偏好

/**
 * 更新设置偏好。
 *
 * 免打扰成对出现：只改一端等于禁用，统一补齐成 null。
 */
fun updateSettings(data: AppData, patch: (Settings) -> Settings): AppData {
    var settings = patch(data.settings)
    if (settings.quietStart == null || settings.quietEnd == null) {
        settings = settings.copy(quietStart = null, quietEnd = null)
    }
    return data.copy(settings = settings)
}
