package top.youngxhui.rememberyao.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import top.youngxhui.rememberyao.core.domain.BlisterSpec
import top.youngxhui.rememberyao.core.domain.MedicationInput
import top.youngxhui.rememberyao.core.domain.PersonInput
import top.youngxhui.rememberyao.core.domain.PlanChanges
import top.youngxhui.rememberyao.core.domain.PlanInput
import top.youngxhui.rememberyao.core.domain.Repository
import top.youngxhui.rememberyao.core.model.BlisterPack
import top.youngxhui.rememberyao.core.model.BlisterSlot
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.MedicationPlan
import top.youngxhui.rememberyao.core.model.MedicationUsage
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.core.model.Reminder
import top.youngxhui.rememberyao.core.model.Settings

/**
 * 全应用共享的界面状态容器。
 *
 * 数据库是唯一真相源（Room DAO 的 Flow），这里把每个集合转成 StateFlow 供
 * 屏幕订阅。屏幕只订阅自己关心的集合 —— 一处写入只让相关屏幕重组，不再
 * 是全量快照变更、全app重算。
 *
 * 作用域是 Activity：底部三个 tab 与推入的详情页共享同一份数据，任何一处
 * 写完后其余屏幕立刻跟着刷新。
 */
@HiltViewModel
class AppViewModel @Inject constructor(
    private val repository: Repository
) : ViewModel() {

    val medications: StateFlow<List<Medication>> =
        repository.medications.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val persons: StateFlow<List<Person>> =
        repository.persons.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val plans: StateFlow<List<MedicationPlan>> =
        repository.plans.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val reminders: StateFlow<List<Reminder>> =
        repository.reminders.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val usages: StateFlow<List<MedicationUsage>> =
        repository.usages.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val packs: StateFlow<List<BlisterPack>> =
        repository.packs.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val blisterSlots: StateFlow<List<BlisterSlot>> =
        repository.blisterSlots.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val settings: StateFlow<Settings> =
        repository.settings.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Settings.DEFAULT)

    val loading: StateFlow<Boolean> = repository.loading

    /** 进屏 / 回前台时补生成提醒并重排通知（幂等，无变更则空转）。 */
    fun reload() {
        viewModelScope.launch { repository.reload() }
    }

    // MARK: - 写操作转发
    // 每个方法都在 viewModelScope 里启动，屏幕只管调用，不自己管协程生命周期。

    fun take(reminderId: String) = launchWrite { repository.take(reminderId) }

    fun skip(reminderId: String) = launchWrite { repository.skip(reminderId) }

    fun snooze(reminderId: String, minutes: Int? = null) =
        launchWrite { repository.snooze(reminderId, minutes) }

    fun addMedication(input: MedicationInput, onCreated: (Medication) -> Unit = {}) {
        viewModelScope.launch { onCreated(repository.addMedication(input)) }
    }

    fun updateMedication(id: String, patch: (Medication) -> Medication) =
        launchWrite { repository.updateMedication(id, patch) }

    fun deleteMedication(id: String) = launchWrite { repository.deleteMedication(id) }

    fun restockMedication(id: String, amount: Int) =
        launchWrite { repository.restockMedication(id, amount) }

    fun appendBlisterPacks(medicationId: String, count: Int) =
        launchWrite { repository.appendBlisterPacks(medicationId, count) }

    fun openBlisterTwin(medicationId: String, spec: BlisterSpec) =
        launchWrite { repository.openBlisterTwin(medicationId, spec) }

    fun addPerson(input: PersonInput, onCreated: (Person) -> Unit = {}) {
        viewModelScope.launch { onCreated(repository.addPerson(input)) }
    }

    fun updatePerson(id: String, patch: (Person) -> Person) =
        launchWrite { repository.updatePerson(id, patch) }

    fun deletePerson(id: String) = launchWrite { repository.deletePerson(id) }

    fun addPlan(input: PlanInput) = launchWrite { repository.addPlan(input) }

    fun applyPlanChanges(changes: PlanChanges) =
        launchWrite { repository.applyPlanChanges(changes) }

    fun deletePlan(id: String) = launchWrite { repository.deletePlan(id) }

    fun updatePlan(id: String, patch: (MedicationPlan) -> MedicationPlan) =
        launchWrite { repository.updatePlan(id, patch) }

    fun consumeBlisterSlot(slotId: String, personId: String) =
        launchWrite { repository.consumeBlisterSlot(slotId, personId) }

    fun voidBlisterSlot(slotId: String) = launchWrite { repository.voidBlisterSlot(slotId) }

    fun restoreBlisterSlot(slotId: String) = launchWrite { repository.restoreBlisterSlot(slotId) }

    fun undoUsage(usageId: String) = launchWrite { repository.undoUsage(usageId) }

    fun updateSettings(patch: (Settings) -> Settings) =
        launchWrite { repository.updateSettings(patch) }

    private fun launchWrite(block: suspend () -> Unit) {
        viewModelScope.launch { block() }
    }
}
