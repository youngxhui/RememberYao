package top.youngxhui.rememberyao.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch
import top.youngxhui.rememberyao.core.domain.BlisterSpec
import top.youngxhui.rememberyao.core.domain.MedicationInput
import top.youngxhui.rememberyao.core.domain.PersonInput
import top.youngxhui.rememberyao.core.domain.PlanChanges
import top.youngxhui.rememberyao.core.domain.Store
import top.youngxhui.rememberyao.core.model.AppData
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.core.model.Settings
import kotlinx.coroutines.flow.StateFlow

/**
 * 全应用共享的界面状态容器。
 *
 * 屏幕只读 [data] / [loading]，写操作一律转调 [Store] —— 与 Expo 版
 * `useAppData()` + `store.ts` 的分工一致。屏幕自己不碰 Room、不碰通知。
 *
 * 作用域是 Activity：底部三个 tab 与推入的详情页共享同一份快照，任何一处
 * 写完后其余屏幕立刻跟着刷新，不需要各页面再拉一次。
 */
@HiltViewModel
class AppViewModel @Inject constructor(
    val store: Store
) : ViewModel() {

    val data: StateFlow<AppData?> = store.data
    val loading: StateFlow<Boolean> = store.loading

    init {
        viewModelScope.launch { store.load() }
    }

    /** 屏幕进入前台时把别处的变更拉回来（与 Expo 版 `useFocusEffect(reload)` 对应）。 */
    fun reload() {
        viewModelScope.launch { store.reload() }
    }

    // MARK: - 写操作转发
    // 每个方法都在 viewModelScope 里启动，屏幕只管调用，不自己管协程生命周期。

    fun take(reminderId: String) = launchWrite { store.take(reminderId) }

    fun skip(reminderId: String) = launchWrite { store.skip(reminderId) }

    fun snooze(reminderId: String) = launchWrite { store.snooze(reminderId) }

    fun addMedication(input: MedicationInput, onCreated: (Medication) -> Unit = {}) {
        viewModelScope.launch { onCreated(store.addMedication(input)) }
    }

    fun updateMedication(id: String, patch: (Medication) -> Medication) =
        launchWrite { store.updateMedication(id, patch) }

    fun deleteMedication(id: String) = launchWrite { store.deleteMedication(id) }

    fun restockMedication(id: String, amount: Int) =
        launchWrite { store.restockMedication(id, amount) }

    fun appendBlisterPacks(medicationId: String, count: Int) =
        launchWrite { store.appendBlisterPacks(medicationId, count) }

    fun openBlisterTwin(medicationId: String, spec: BlisterSpec) =
        launchWrite { store.openBlisterTwin(medicationId, spec) }

    fun addPerson(input: PersonInput, onCreated: (Person) -> Unit = {}) {
        viewModelScope.launch { onCreated(store.addPerson(input)) }
    }

    fun updatePerson(id: String, patch: (Person) -> Person) =
        launchWrite { store.updatePerson(id, patch) }

    fun deletePerson(id: String) = launchWrite { store.deletePerson(id) }

    fun addPlan(input: top.youngxhui.rememberyao.core.domain.PlanInput) =
        launchWrite { store.addPlan(input) }

    fun applyPlanChanges(changes: PlanChanges) =
        launchWrite { store.applyPlanChanges(changes) }

    fun deletePlan(id: String) = launchWrite { store.deletePlan(id) }

    fun consumeBlisterSlot(slotId: String, personId: String) =
        launchWrite { store.consumeBlisterSlot(slotId, personId) }

    fun voidBlisterSlot(slotId: String) = launchWrite { store.voidBlisterSlot(slotId) }

    fun restoreBlisterSlot(slotId: String) = launchWrite { store.restoreBlisterSlot(slotId) }

    fun undoUsage(usageId: String) = launchWrite { store.undoUsage(usageId) }

    fun updateSettings(patch: (Settings) -> Settings) =
        launchWrite { store.updateSettings(patch) }

    private fun launchWrite(block: suspend () -> Unit) {
        viewModelScope.launch { block() }
    }
}
