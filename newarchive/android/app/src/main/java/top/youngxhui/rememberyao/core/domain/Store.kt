package top.youngxhui.rememberyao.core.domain

import androidx.room.withTransaction
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import top.youngxhui.rememberyao.core.model.AppData
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.core.model.Settings
import top.youngxhui.rememberyao.core.notification.NotificationScheduler
import top.youngxhui.rememberyao.data.local.AppDatabase
import top.youngxhui.rememberyao.data.local.toDomain
import top.youngxhui.rememberyao.data.local.toEntity

/**
 * 全应用唯一的数据出入口。
 *
 * 屏幕永远不直接碰 Room，只读 [data] 并调这里的挂起方法。写操作统一走
 * 「套纯函数 → 更新内存态 → 落盘 → 重排通知」流水线，与 iOS 端 `Store`
 * 的结构一致。
 *
 * 并发模型：一个 [writeMutex] 串行化所有写操作，连续变更排队执行，
 * 绝不并发写同一个数据库。
 */
@Singleton
class Store @Inject constructor(
    private val db: AppDatabase,
    private val scheduler: NotificationScheduler
) {
    private val _data = MutableStateFlow<AppData?>(null)

    /** 当前全量数据快照；null = 还没载入（屏幕不能显示 empty 态）。 */
    val data: StateFlow<AppData?> = _data.asStateFlow()

    private val _loading = MutableStateFlow(true)

    /** 首次加载是否结束。 */
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    /** 当前快照；未载入时返回空数据（只允许在确认已载入后读取）。 */
    val current: AppData get() = _data.value ?: AppData()

    private val writeMutex = Mutex()

    // MARK: - 读取

    /** 首次载入：读全表 → 同步提醒 → 落盘（若有变更）→ 重排通知。 */
    suspend fun load() {
        val raw = fetchAll()
        val synced = syncReminders(raw)
        if (synced != raw) {
            persist(synced)
            _data.value = synced
        } else {
            _data.value = raw
        }
        _loading.value = false
        // 首屏同步完立刻重排一次通知：App 冷启动时距离上次调度可能已经过了好几天
        scheduler.resync(synced)
    }

    /** 屏幕回到前台时调这个，把别处造成的变更拉回来。 */
    suspend fun reload() {
        val raw = fetchAll()
        val synced = syncReminders(raw)
        if (synced != raw) {
            persist(synced)
            _data.value = synced
        } else {
            _data.value = raw
        }
        scheduler.resync(synced)
    }

    private suspend fun fetchAll(): AppData {
        val medications = db.medicationDao().getAll()
        val persons = db.personDao().getAll()
        val plans = db.planDao().getAll()
        val reminders = db.reminderDao().getAll()
        val usages = db.usageDao().getAll()
        val packs = db.packDao().getAll()
        val slots = db.blisterSlotDao().getAll()
        val settings = db.settingsDao().get()
        return AppData(
            medications = medications.map { it.toDomain() },
            persons = persons.map { it.toDomain() },
            plans = plans.map { it.toDomain() },
            reminders = reminders.map { it.toDomain() },
            usages = usages.map { it.toDomain() },
            packs = packs.map { it.toDomain() },
            blisterSlots = slots.map { it.toDomain() },
            // 读不到行（新装 / 还没写过设置）就用默认值，不补一行空记录
            settings = settings?.toDomain() ?: Settings.DEFAULT
        )
    }

    // MARK: - 写入

    /**
     * 全量快照替换：每张表先删后插，一次事务落地。
     *
     * 与 iOS 端 `replaceAll` 语义一致（先插后删）。数据量是家庭级别，
     * 全量替换比算增量差异简单得多，也不会出现「两边账算不平」。
     */
    private suspend fun persist(next: AppData) {
        db.withTransaction {
            with(db.medicationDao()) {
                deleteAll()
                upsertAll(next.medications.map { it.toEntity() })
            }
            with(db.personDao()) {
                deleteAll()
                upsertAll(next.persons.map { it.toEntity() })
            }
            with(db.planDao()) {
                deleteAll()
                upsertAll(next.plans.map { it.toEntity() })
            }
            with(db.reminderDao()) {
                deleteAll()
                upsertAll(next.reminders.map { it.toEntity() })
            }
            with(db.usageDao()) {
                deleteAll()
                upsertAll(next.usages.map { it.toEntity() })
            }
            with(db.packDao()) {
                deleteAll()
                upsertAll(next.packs.map { it.toEntity() })
            }
            with(db.blisterSlotDao()) {
                deleteAll()
                upsertAll(next.blisterSlots.map { it.toEntity() })
            }
            // 设置恒为一行：upsert 即可
            db.settingsDao().upsert(next.settings.toEntity())
        }
    }

    /** 串行落库 + 重排通知。前一次没写完就排队。 */
    private suspend fun commit(next: AppData) {
        _data.value = next
        persist(next)
        scheduler.resync(next)
    }

    private suspend fun mutate(block: (AppData) -> AppData) {
        writeMutex.withLock { commit(block(_data.value ?: AppData())) }
    }

    private suspend fun <T> mutateWithResult(block: (AppData) -> Pair<AppData, T>): T {
        return writeMutex.withLock {
            val (next, result) = block(_data.value ?: AppData())
            commit(next)
            result
        }
    }

    // MARK: - 业务写操作
    // 每个方法都是「套纯函数 → 更新 data → 落盘 → 重排通知」，一行不多。

    suspend fun take(reminderId: String) = mutate { takeReminder(it, reminderId) }

    suspend fun skip(reminderId: String) = mutate { skipReminder(it, reminderId) }

    suspend fun snooze(reminderId: String, minutes: Int? = null) =
        mutate { snoozeReminder(it, reminderId, minutes) }

    suspend fun addMedication(input: MedicationInput): Medication =
        mutateWithResult { addMedication(it, input) }

    suspend fun updateMedication(id: String, patch: (Medication) -> Medication) =
        mutate { updateMedication(it, id, patch) }

    suspend fun deleteMedication(id: String) = mutate { deleteMedication(it, id) }

    suspend fun restockMedication(id: String, amount: Int) =
        mutate { restockMedication(it, id, amount) }

    suspend fun addPerson(input: PersonInput): Person = mutateWithResult { addPerson(it, input) }

    suspend fun updatePerson(id: String, patch: (Person) -> Person) =
        mutate { updatePerson(it, id, patch) }

    suspend fun deletePerson(id: String) = mutate { deletePerson(it, id) }

    suspend fun addPlan(input: PlanInput) = mutate { addPlan(it, input) }

    suspend fun updatePlan(id: String, patch: (top.youngxhui.rememberyao.core.model.MedicationPlan) -> top.youngxhui.rememberyao.core.model.MedicationPlan) =
        mutate { updatePlan(it, id, patch) }

    suspend fun deletePlan(id: String) = mutate { deletePlan(it, id) }

    /** 一次落多笔用药配置变更，只重排一次通知。 */
    suspend fun applyPlanChanges(changes: PlanChanges) = mutate { applyPlanChanges(it, changes) }

    suspend fun openBlisterTwin(medicationId: String, spec: BlisterSpec) =
        mutate { openBlisterTwin(it, medicationId, spec) }

    suspend fun appendBlisterPacks(medicationId: String, count: Int) =
        mutate { appendBlisterPacks(it, medicationId, count) }

    suspend fun consumeBlisterSlot(slotId: String, personId: String) =
        mutate { consumeBlisterSlot(it, slotId, personId) }

    suspend fun voidBlisterSlot(slotId: String) = mutate { voidBlisterSlot(it, slotId) }

    suspend fun restoreBlisterSlot(slotId: String) = mutate { restoreBlisterSlot(it, slotId) }

    suspend fun undoUsage(usageId: String) = mutate { undoUsage(it, usageId) }

    suspend fun updateSettings(patch: (Settings) -> Settings) =
        mutate { updateSettings(it, patch) }
}
