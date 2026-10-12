package top.youngxhui.rememberyao.core.domain

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import top.youngxhui.rememberyao.core.model.BlisterPack
import top.youngxhui.rememberyao.core.model.BlisterSlot
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.MedicationPlan
import top.youngxhui.rememberyao.core.model.MedicationUsage
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.core.model.Reminder
import top.youngxhui.rememberyao.core.model.Settings

/**
 * 通知重排所需的跨实体只读投影。
 *
 * 通知调度天生要同时看「全部待处理提醒 + 设置 + 人名药名」，这是唯一还需要
 * 跨集合一致视图的地方；但它只读、不参与写路径，与旧的「全量快照即真相源」
 * 有本质区别。
 */
data class ScheduleInput(
    val reminders: List<Reminder>,
    val settings: Settings,
    val medications: List<Medication>,
    val persons: List<Person>
)

/**
 * 数据操作的唯一入口接口。
 *
 * 实现类持有底层持久化（Room）和通知调度，对上游只暴露 suspend 函数。
 * `Store` 是唯一实现，由 Hilt 提供 `@Singleton` 实例。
 *
 * 读：每个集合一条 Flow，数据库是唯一真相源；屏幕只订阅自己关心的集合，
 * 一处写入只让相关屏幕重组。
 * 写：增量落库（只动涉及的实体）+ 通知重排，串行执行。
 */
interface Repository {

    // MARK: - 状态读取（按集合的响应式读）

    val medications: Flow<List<Medication>>
    val persons: Flow<List<Person>>
    val plans: Flow<List<MedicationPlan>>
    val reminders: Flow<List<Reminder>>
    val usages: Flow<List<MedicationUsage>>
    val packs: Flow<List<BlisterPack>>
    val blisterSlots: Flow<List<BlisterSlot>>
    val settings: Flow<Settings>

    /** 首次加载是否结束。 */
    val loading: StateFlow<Boolean>

    /** 通知重排的只读投影。 */
    suspend fun scheduleInput(): ScheduleInput

    // MARK: - 生命周期

    /** 首次载入：补生成提醒 + 重排通知。数据本身由各集合的 Flow 负责推送。 */
    suspend fun load()

    /** 回到前台 / 进屏时刷新：补生成提醒 + 重排通知（幂等，无变更则空转）。 */
    suspend fun reload()

    // MARK: - 提醒

    suspend fun take(reminderId: String)

    suspend fun skip(reminderId: String)

    suspend fun snooze(reminderId: String, minutes: Int? = null)

    // MARK: - 药品

    suspend fun addMedication(input: MedicationInput): Medication

    suspend fun updateMedication(id: String, patch: (Medication) -> Medication)

    suspend fun deleteMedication(id: String)

    suspend fun restockMedication(id: String, amount: Int)

    // MARK: - 用药人

    suspend fun addPerson(input: PersonInput): Person

    suspend fun updatePerson(id: String, patch: (Person) -> Person)

    suspend fun deletePerson(id: String)

    // MARK: - 用药配置

    suspend fun addPlan(input: PlanInput)

    suspend fun updatePlan(id: String, patch: (MedicationPlan) -> MedicationPlan)

    suspend fun deletePlan(id: String)

    /** 一次落多笔配置变更，只重排一次通知。 */
    suspend fun applyPlanChanges(changes: PlanChanges)

    // MARK: - 板装孪生

    suspend fun openBlisterTwin(medicationId: String, spec: BlisterSpec)

    suspend fun appendBlisterPacks(medicationId: String, count: Int)

    suspend fun consumeBlisterSlot(slotId: String, personId: String)

    suspend fun voidBlisterSlot(slotId: String)

    suspend fun restoreBlisterSlot(slotId: String)

    suspend fun undoUsage(usageId: String)

    // MARK: - 设置

    suspend fun updateSettings(patch: (Settings) -> Settings)
}
