package top.youngxhui.rememberyao.data.repository

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.Dispatchers
import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import top.youngxhui.rememberyao.core.domain.DateKey
import top.youngxhui.rememberyao.core.domain.Domain
import top.youngxhui.rememberyao.core.domain.pickAvatarColor
import top.youngxhui.rememberyao.core.l10n.AppLanguage
import top.youngxhui.rememberyao.core.l10n.L10n
import top.youngxhui.rememberyao.core.domain.BlisterSpec
import top.youngxhui.rememberyao.core.domain.MedicationInput
import top.youngxhui.rememberyao.core.domain.PersonInput
import top.youngxhui.rememberyao.core.domain.PlanChanges
import top.youngxhui.rememberyao.core.domain.PlanInput
import top.youngxhui.rememberyao.core.domain.PlanUpdate
import top.youngxhui.rememberyao.core.domain.ReminderSync
import top.youngxhui.rememberyao.core.domain.Repository
import top.youngxhui.rememberyao.core.domain.ScheduleInput
import top.youngxhui.rememberyao.core.domain.decideAddMedication
import top.youngxhui.rememberyao.core.domain.decideAddPerson
import top.youngxhui.rememberyao.core.domain.decideAppendPacks
import top.youngxhui.rememberyao.core.domain.decideApplyPlanChanges
import top.youngxhui.rememberyao.core.domain.decideConsumeSlot
import top.youngxhui.rememberyao.core.domain.decideOpenTwin
import top.youngxhui.rememberyao.core.domain.decideReminderSync
import top.youngxhui.rememberyao.core.domain.decideRestock
import top.youngxhui.rememberyao.core.domain.decideRestoreSlot
import top.youngxhui.rememberyao.core.domain.decideSettings
import top.youngxhui.rememberyao.core.domain.decideSkip
import top.youngxhui.rememberyao.core.domain.decideSnooze
import top.youngxhui.rememberyao.core.domain.decideTake
import top.youngxhui.rememberyao.core.domain.decideUndoUsage
import top.youngxhui.rememberyao.core.domain.decideUpdateMedication
import top.youngxhui.rememberyao.core.domain.decideUpdatePerson
import top.youngxhui.rememberyao.core.domain.decideVoidSlot
import top.youngxhui.rememberyao.core.model.BlisterPack
import top.youngxhui.rememberyao.core.model.BlisterSlot
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
import top.youngxhui.rememberyao.core.model.Settings
import top.youngxhui.rememberyao.data.local.AppDatabase
import top.youngxhui.rememberyao.data.local.toDomain
import top.youngxhui.rememberyao.data.local.toEntity
import top.youngxhui.rememberyao.core.notification.NotificationScheduler
import javax.inject.Inject
import javax.inject.Singleton

/**
 * [Repository] 的唯一实现。
 *
 * 数据库是唯一真相源：读直接透传 DAO 的 Flow，写只动涉及的实体（增量落库，
 * 一个事务包住跨表一致性），写完按签名 diff 重排通知。
 *
 * 并发模型：[writeMutex] 串行化所有写操作，连续变更排队执行。
 */
@Singleton
class Store @Inject constructor(
    private val db: AppDatabase,
    private val scheduler: NotificationScheduler,
    @ApplicationContext private val context: Context
) : Repository {

    private val medicationDao get() = db.medicationDao()
    private val personDao get() = db.personDao()
    private val planDao get() = db.planDao()
    private val reminderDao get() = db.reminderDao()
    private val usageDao get() = db.usageDao()
    private val packDao get() = db.packDao()
    private val blisterSlotDao get() = db.blisterSlotDao()
    private val settingsDao get() = db.settingsDao()

    // MARK: - 读取（DAO Flow 直接透传，映射到领域模型）

    override val medications: Flow<List<Medication>> =
        medicationDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    override val persons: Flow<List<Person>> =
        personDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    override val plans: Flow<List<MedicationPlan>> =
        planDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    override val reminders: Flow<List<Reminder>> =
        reminderDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    override val usages: Flow<List<MedicationUsage>> =
        usageDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    override val packs: Flow<List<BlisterPack>> =
        packDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    override val blisterSlots: Flow<List<BlisterSlot>> =
        blisterSlotDao.observeAll().map { rows -> rows.map { it.toDomain() } }

    override val settings: Flow<Settings> =
        settingsDao.observe().map { it?.toDomain() ?: Settings.DEFAULT }

    private val _loading = MutableStateFlow(true)
    override val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val writeMutex = Mutex()

    override suspend fun scheduleInput(): ScheduleInput = ScheduleInput(
        reminders = reminderDao.getAll().map { it.toDomain() },
        settings = settingsDao.get()?.toDomain() ?: Settings.DEFAULT,
        medications = medicationDao.getAll().map { it.toDomain() },
        persons = personDao.getAll().map { it.toDomain() }
    )

    // MARK: - 生命周期

    override suspend fun load() {
        writeMutex.withLock { syncRemindersIncremental() }
        scheduler.resync(scheduleInput())
        _loading.value = false
    }

    override suspend fun ensureDefaultPerson(language: AppLanguage) = write {
        val persons = personDao.getAll()
        val defaultNames = Domain.DEFAULT_PERSON_NAMES
        val currentDefault = L10n.defaultName(context = context)

        if (persons.isEmpty()) {
            personDao.upsert(
                Person(
                    id = Domain.SELF_PERSON_ID,
                    name = currentDefault,
                    avatarColor = pickAvatarColor(currentDefault),
                    avatarUri = null,
                    gender = null,
                    age = null,
                    allergies = emptyList(),
                    underlyingConditions = emptyList(),
                    createdAt = Iso8601.now()
                ).toEntity()
            )
            return@write
        }

        val self = persons.firstOrNull { it.id == Domain.SELF_PERSON_ID } ?: return@write
        if (self.name == currentDefault || self.name !in defaultNames) return@write

        personDao.upsert(self.toDomain().copy(name = currentDefault).toEntity())
    }

    override suspend fun reload() {
        writeMutex.withLock { syncRemindersIncremental() }
        scheduler.resync(scheduleInput())
    }

    /** 幂等补齐 / 标记 / 清理提醒，只动变化的行。 */
    private suspend fun syncRemindersIncremental() {
        val decision = decideReminderSync(
            plans = planDao.getAll().map { it.toDomain() },
            existing = reminderDao.getAll().map { it.toDomain() }
        )
        applyReminderSync(decision)
    }

    private suspend fun applyReminderSync(decision: ReminderSync) {
        if (decision.toDelete.isNotEmpty()) {
            reminderDao.deleteByIds(decision.toDelete.map { it.id })
        }
        if (decision.toUpdate.isNotEmpty()) {
            reminderDao.upsertAll(decision.toUpdate.map { it.toEntity() })
        }
        if (decision.toInsert.isNotEmpty()) {
            reminderDao.upsertAll(decision.toInsert.map { it.toEntity() })
        }
    }

    // MARK: - 写入总口

    /**
     * 串行化：一个事务包住全部增量落库，提交后重排通知。
     *
     * 通知重排按签名 diff —— 没有变化的提醒原样保留，不会每次写操作都把
     * 全部待处理闹钟取消再重排一遍。
     */
    private suspend fun <T> write(block: suspend () -> T): T {
        return writeMutex.withLock {
            val result = db.withTransaction { block() }
            scheduler.resync(scheduleInput())
            result
        }
    }

    // MARK: - 提醒处理

    override suspend fun take(reminderId: String) = write {
        val reminder = reminderDao.byId(reminderId)?.toDomain() ?: return@write
        val medication = medicationDao.byId(reminder.medicationId)?.toDomain()
        val person = personDao.byId(reminder.personId)?.toDomain()
        val packs = packDao.byMedication(reminder.medicationId).map { it.toDomain() }
        val slots = slotsOfPacks(packs)
        val decision = decideTake(reminder, medication, person, packs, slots) ?: return@write
        reminderDao.upsert(decision.reminder.toEntity())
        usageDao.upsert(decision.usage.toEntity())
        decision.medication?.let { medicationDao.upsert(it.toEntity()) }
        if (decision.consumedSlots.isNotEmpty()) {
            blisterSlotDao.upsertAll(decision.consumedSlots.map { it.toEntity() })
        }
    }

    override suspend fun skip(reminderId: String) = write {
        val reminder = reminderDao.byId(reminderId)?.toDomain() ?: return@write
        val decision = decideSkip(reminder) ?: return@write
        reminderDao.upsert(decision.toEntity())
    }

    override suspend fun snooze(reminderId: String, minutes: Int?) = write {
        val reminder = reminderDao.byId(reminderId)?.toDomain() ?: return@write
        // 间隔是全局偏好：调用方不传时取设置里的值
        val delay = minutes
            ?: settingsDao.get()?.toDomain()?.snoozeMinutes
            ?: Settings.DEFAULT.snoozeMinutes
        val decision = decideSnooze(reminder, delay) ?: return@write
        reminderDao.upsert(decision.toEntity())
    }

    // MARK: - 药品

    override suspend fun addMedication(input: MedicationInput): Medication = write {
        val decision = decideAddMedication(input)
        medicationDao.upsert(decision.medication.toEntity())
        decision.twin?.let { twin ->
            packDao.upsertAll(twin.packs.map { it.toEntity() })
            blisterSlotDao.upsertAll(twin.slots.map { it.toEntity() })
        }
        decision.medication
    }

    override suspend fun updateMedication(id: String, patch: (Medication) -> Medication) = write {
        val medication = medicationDao.byId(id)?.toDomain() ?: return@write
        medicationDao.upsert(decideUpdateMedication(medication, patch).toEntity())
    }

    /** 删除药品：级联删除配置、提醒与泡罩孪生；服用记录作为历史永久保留。 */
    override suspend fun deleteMedication(id: String) = write {
        val planIds = planDao.byMedication(id).map { it.id }
        val packIds = packDao.byMedication(id).map { it.id }
        if (planIds.isNotEmpty()) {
            reminderDao.deleteByIds(reminderDao.byPlanIds(planIds).map { it.id })
        }
        if (packIds.isNotEmpty()) {
            blisterSlotDao.deleteByIds(blisterSlotDao.byPackIds(packIds).map { it.id })
            packDao.deleteByIds(packIds)
        }
        if (planIds.isNotEmpty()) planDao.deleteByIds(planIds)
        medicationDao.deleteByIds(listOf(id))
    }

    override suspend fun restockMedication(id: String, amount: Int) = write {
        val medication = medicationDao.byId(id)?.toDomain() ?: return@write
        // 板装药已建孪生时按粒数补货会破坏「Σfull === remainingQuantity」不变式
        // （补进来的药没有对应的槽位），这类药的补货必须走 appendBlisterPacks 按板补
        if (packDao.byMedication(id).isNotEmpty()) return@write
        val updated = decideRestock(medication, amount) ?: return@write
        medicationDao.upsert(updated.toEntity())
    }

    // MARK: - 用药人

    override suspend fun addPerson(input: PersonInput): Person = write {
        val person = decideAddPerson(input)
        personDao.upsert(person.toEntity())
        person
    }

    override suspend fun updatePerson(id: String, patch: (Person) -> Person) = write {
        val person = personDao.byId(id)?.toDomain() ?: return@write
        personDao.upsert(decideUpdatePerson(person, patch).toEntity())
    }

    /** 删除用药人：默认用户「自己」不可删除，保护固定 id。 */
    override suspend fun deletePerson(id: String) = write {
        if (id == Domain.SELF_PERSON_ID) return@write
        val planIds = planDao.byPerson(id).map { it.id }
        if (planIds.isNotEmpty()) {
            reminderDao.deleteByIds(reminderDao.byPlanIds(planIds).map { it.id })
            planDao.deleteByIds(planIds)
        }
        personDao.deleteByIds(listOf(id))
    }

    // MARK: - 用药配置

    override suspend fun addPlan(input: PlanInput) =
        applyPlanChanges(PlanChanges(add = listOf(input)))

    override suspend fun updatePlan(id: String, patch: (MedicationPlan) -> MedicationPlan) =
        applyPlanChanges(PlanChanges(update = listOf(PlanUpdate(id, patch))))

    override suspend fun deletePlan(id: String) =
        applyPlanChanges(PlanChanges(remove = listOf(id)))

    override suspend fun addMedicationWithPlan(
        name: String,
        doseAmount: Int,
        times: List<String>
    ): Pair<Medication, MedicationPlan> = write {
        val now = Iso8601.now()
        val medication = Medication(
            id = IdGenerator.generate(),
            name = name.trim(),
            type = MedicationType.BOTTLE,
            category = MedicationCategory.DEFAULT,
            specification = "",
            unit = MedicationUnit.TABLET,
            totalQuantity = 0,
            remainingQuantity = 0,
            blisterRows = null,
            blisterCols = null,
            expiryDate = null,
            prescription = false,
            notes = "",
            createdAt = now,
            updatedAt = now
        )
        val plan = MedicationPlan(
            id = IdGenerator.generate(),
            medicationId = medication.id,
            personId = Domain.SELF_PERSON_ID,
            doseAmount = doseAmount,
            times = times,
            startDate = DateKey.today(),
            endDate = null,
            enabled = true,
            createdAt = now,
            updatedAt = now
        )
        medicationDao.upsert(medication.toEntity())
        planDao.upsert(plan.toEntity())
        medication to plan
    }

    override suspend fun applyPlanChanges(changes: PlanChanges) = write {
        val decision = decideApplyPlanChanges(
            plans = planDao.getAll().map { it.toDomain() },
            reminders = reminderDao.getAll().map { it.toDomain() },
            changes = changes
        )
        if (decision.isEmpty) return@write
        if (decision.planIdsToDelete.isNotEmpty()) planDao.deleteByIds(decision.planIdsToDelete)
        if (decision.plansToUpsert.isNotEmpty()) {
            planDao.upsertAll(decision.plansToUpsert.map { it.toEntity() })
        }
        if (decision.remindersToDelete.isNotEmpty()) {
            reminderDao.deleteByIds(decision.remindersToDelete)
        }
        if (decision.remindersToUpdate.isNotEmpty()) {
            reminderDao.upsertAll(decision.remindersToUpdate.map { it.toEntity() })
        }
        if (decision.remindersToInsert.isNotEmpty()) {
            reminderDao.upsertAll(decision.remindersToInsert.map { it.toEntity() })
        }
    }

    // MARK: - 板装孪生

    override suspend fun openBlisterTwin(medicationId: String, spec: BlisterSpec) = write {
        val medication = medicationDao.byId(medicationId)?.toDomain() ?: return@write
        val twin = decideOpenTwin(medication, spec) ?: return@write
        // 重复开启 = 重建：先清掉该药旧的板与格
        val stalePackIds = packDao.byMedication(medicationId).map { it.id }
        if (stalePackIds.isNotEmpty()) {
            blisterSlotDao.deleteByIds(blisterSlotDao.byPackIds(stalePackIds).map { it.id })
            packDao.deleteByIds(stalePackIds)
        }
        packDao.upsertAll(twin.packs.map { it.toEntity() })
        blisterSlotDao.upsertAll(twin.slots.map { it.toEntity() })
        medicationDao.upsert(twin.medication.toEntity())
    }

    override suspend fun appendBlisterPacks(medicationId: String, count: Int) = write {
        val medication = medicationDao.byId(medicationId)?.toDomain() ?: return@write
        val twin = decideAppendPacks(
            medication = medication,
            existingPacks = packDao.byMedication(medicationId).map { it.toDomain() },
            count = count
        ) ?: return@write
        packDao.upsertAll(twin.packs.map { it.toEntity() })
        blisterSlotDao.upsertAll(twin.slots.map { it.toEntity() })
        medicationDao.upsert(twin.medication.toEntity())
    }

    override suspend fun consumeBlisterSlot(slotId: String, personId: String) = write {
        val slot = blisterSlotDao.byId(slotId)?.toDomain() ?: return@write
        val pack = packDao.byId(slot.packId)?.toDomain() ?: return@write
        val medication = medicationDao.byId(pack.medicationId)?.toDomain() ?: return@write
        val person = personDao.byId(personId)?.toDomain() ?: return@write
        val decision = decideConsumeSlot(slot, pack, medication, person) ?: return@write
        blisterSlotDao.upsert(decision.slot.toEntity())
        usageDao.upsert(decision.usage.toEntity())
        medicationDao.upsert(decision.medication.toEntity())
    }

    override suspend fun voidBlisterSlot(slotId: String) = write {
        val slot = blisterSlotDao.byId(slotId)?.toDomain() ?: return@write
        val pack = packDao.byId(slot.packId)?.toDomain() ?: return@write
        val medication = medicationDao.byId(pack.medicationId)?.toDomain() ?: return@write
        val decision = decideVoidSlot(slot, medication) ?: return@write
        blisterSlotDao.upsert(decision.first.toEntity())
        medicationDao.upsert(decision.second.toEntity())
    }

    override suspend fun restoreBlisterSlot(slotId: String) = write {
        val slot = blisterSlotDao.byId(slotId)?.toDomain() ?: return@write
        val pack = packDao.byId(slot.packId)?.toDomain() ?: return@write
        val medication = medicationDao.byId(pack.medicationId)?.toDomain() ?: return@write
        val decision = decideRestoreSlot(slot, medication) ?: return@write
        blisterSlotDao.upsert(decision.first.toEntity())
        medicationDao.upsert(decision.second.toEntity())
    }

    override suspend fun undoUsage(usageId: String) = write {
        val usage = usageDao.byId(usageId)?.toDomain() ?: return@write
        val medication = medicationDao.byId(usage.medicationId)?.toDomain()
        val reminder = usage.reminderId?.let { reminderDao.byId(it)?.toDomain() }
        val linkedSlots = blisterSlotDao.byUsageId(usageId).map { it.toDomain() }
        val decision = decideUndoUsage(usage, reminder, linkedSlots, medication)
        usageDao.deleteByIds(listOf(usageId))
        decision.reminder?.let { reminderDao.upsert(it.toEntity()) }
        if (decision.slots.isNotEmpty()) {
            blisterSlotDao.upsertAll(decision.slots.map { it.toEntity() })
        }
        // 收尾必须是 Unit：`?.let` 的返回值是 Unit?，会把 write 的 T 推断成 Unit?，
        // 与 Repository 里声明的 Unit 冲突
        if (decision.medication != null) {
            medicationDao.upsert(decision.medication.toEntity())
        }
    }

    // MARK: - 设置

    override suspend fun updateSettings(patch: (Settings) -> Settings) = write {
        val current = settingsDao.get()?.toDomain() ?: Settings.DEFAULT
        settingsDao.upsert(decideSettings(current, patch).toEntity())
    }

    // MARK: - 私有

    /** 取这批板的全部槽位。空集合不过 SQL，避免 `IN ()` 的边界。 */
    private suspend fun slotsOfPacks(packs: List<BlisterPack>): List<BlisterSlot> {
        if (packs.isEmpty()) return emptyList()
        return blisterSlotDao.byPackIds(packs.map { it.id }).map { it.toDomain() }
    }
}
