package top.youngxhui.rememberyao.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.Clock
import top.youngxhui.rememberyao.core.domain.DateKey
import top.youngxhui.rememberyao.core.domain.PlanChanges
import top.youngxhui.rememberyao.core.domain.PlanInput
import top.youngxhui.rememberyao.core.domain.PlanUpdate
import top.youngxhui.rememberyao.core.model.MedicationPlan
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.CheckRow
import top.youngxhui.rememberyao.ui.components.ChoiceChipRow
import top.youngxhui.rememberyao.ui.components.DateField
import top.youngxhui.rememberyao.ui.components.EmptyState
import top.youngxhui.rememberyao.ui.components.InfoRow
import top.youngxhui.rememberyao.ui.components.NumberField
import top.youngxhui.rememberyao.ui.components.PrimaryAction
import top.youngxhui.rememberyao.ui.components.ScreenScaffold
import top.youngxhui.rememberyao.ui.components.SectionCard
import top.youngxhui.rememberyao.ui.components.SwitchRow
import top.youngxhui.rememberyao.ui.components.testId

/** 配置表单当前打开的对话框。 */
private sealed interface PlanDialog {
    data object None : PlanDialog
    data class TimePicker(val index: Int) : PlanDialog
}

/**
 * 用药配置表单：人与药一对多。
 *
 * 「给一位家人一次配好几种药」是这个表单存在的理由，所以药品是多选的，
 * 每味药下面各出一个剂量输入（单位逐味不同），而用药人与服用时间是这组药
 * 共用的。保存走 `applyPlanChanges` 一次落多笔，只重排一次通知 ——
 * 逐笔落库会让选四种药闪四次。
 *
 * 编辑态取消勾选原来那味药 = 保存时移除该配置。
 */
@Composable
fun PlanFormScreen(
    viewModel: AppViewModel,
    planId: String?,
    personId: String?,
    medicationId: String?,
    onBack: () -> Unit
) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.reload() }

    val snapshot = data
    val existing = planId?.let { id -> snapshot?.plans?.firstOrNull { it.id == id } }

    var selectedPerson by remember { mutableStateOf(personId ?: existing?.personId) }
    var selectedMedications by remember {
        mutableStateOf(
            existing?.let { setOf(it.medicationId) }
                ?: medicationId?.let { setOf(it) }
                ?: emptySet<String>()
        )
    }
    /** 每味药一个剂量；键是药品 id，未填为空串。 */
    var doses by remember {
        mutableStateOf(
            existing?.let { mapOf(it.medicationId to it.doseAmount.toString()) }
                ?: emptyMap<String, String>()
        )
    }
    var times by remember {
        mutableStateOf(existing?.times ?: Clock.defaultTimes(3))
    }
    var startDate by remember { mutableStateOf(existing?.startDate ?: DateKey.today()) }
    var endDate by remember { mutableStateOf(existing?.endDate ?: "") }
    var enabled by remember { mutableStateOf(existing?.enabled ?: true) }
    var dialog by remember { mutableStateOf<PlanDialog>(PlanDialog.None) }

    val cancel = stringResource(R.string.common_cancel)
    val done = stringResource(R.string.common_done)

    ScreenScaffold(
        title = stringResource(
            if (existing != null) R.string.plan_editTitle else R.string.plan_formTitle
        ),
        onBack = onBack,
        backTestId = "plan-back"
    ) { innerPadding ->
        if (snapshot == null) {
            Column(modifier = Modifier.fillMaxSize()) {}
            return@ScreenScaffold
        }

        val persons = snapshot.persons
        val medications = snapshot.medications.sortedBy { it.name }
        val personName = persons.firstOrNull { it.id == selectedPerson }?.name

        // 校验：人、药、剂量、时间、起止日期都必须成立
        val dosesValid = selectedMedications.all { id ->
            doses[id]?.toIntOrNull()?.let { it > 0 } == true
        }
        val timesValid = times.isNotEmpty() && times.size == times.distinct().size
        val datesValid = endDate.isBlank() || endDate >= startDate
        val canSave = selectedPerson != null &&
            selectedMedications.isNotEmpty() &&
            dosesValid &&
            timesValid &&
            datesValid

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // MARK: 用药人
            SectionCard(title = stringResource(R.string.plan_sectionPerson)) {
                if (persons.isEmpty()) {
                    EmptyState(
                        text = stringResource(R.string.plan_noPersonHint),
                        hint = stringResource(R.string.person_addMember)
                    )
                } else {
                    InfoRow(
                        label = stringResource(R.string.plan_person),
                        value = personName ?: stringResource(R.string.person_pick_hint),
                        modifier = Modifier.testId("plan-person-row")
                    )
                    // 用药人固定时不再给选择器：从成员详情进来的人不该被改掉
                    if (personId == null && existing == null) {
                        ChoiceChipRow(
                            options = persons.map { it.id to it.name },
                            isSelected = { selectedPerson == it.first },
                            onToggle = { selectedPerson = it.first },
                            label = { it.second },
                            testId = { "plan-person-${it.first}" }
                        )
                    } else {
                        InfoRow(
                            label = stringResource(R.string.plan_personFixedHint),
                            value = personName.orEmpty()
                        )
                    }
                }
            }

            // MARK: 药品（多选）
            SectionCard(title = stringResource(R.string.plan_sectionMedications)) {
                if (medications.isEmpty()) {
                    EmptyState(
                        text = stringResource(R.string.plan_medications_empty),
                        hint = stringResource(R.string.plan_noMedicationHint)
                    )
                } else {
                    InfoRow(
                        label = stringResource(R.string.plan_selectedCount, selectedMedications.size)
                    )
                    medications.forEach { medication ->
                        val id = medication.id
                        CheckRow(
                            label = medication.name,
                            checked = id in selectedMedications,
                            onCheckedChange = { checked ->
                                selectedMedications = if (checked) {
                                    selectedMedications + id
                                } else {
                                    selectedMedications - id
                                }
                                // 勾上时预填一个剂量，少一次输入
                                if (checked && doses[id] == null) {
                                    doses = doses + (id to "1")
                                }
                            },
                            supporting = medication.specification.ifBlank { null },
                            testId = "plan-medication-$id"
                        )
                        // 勾中的每味药下方出一个剂量输入（单位逐味不同）
                        if (id in selectedMedications) {
                            NumberField(
                                label = stringResource(
                                    R.string.plan_doseForMedication,
                                    medication.name,
                                    unitLabelOf(medication.unit)
                                ),
                                value = doses[id] ?: "",
                                onValueChange = { text -> doses = doses + (id to text) },
                                modifier = Modifier.padding(horizontal = 16.dp),
                                placeholder = "1",
                                isError = doses[id]?.toIntOrNull()?.let { it <= 0 } != false,
                                testId = "plan-dose-input-$id"
                            )
                        }
                    }
                }
            }

            // MARK: 服用时间（这组药共用）
            SectionCard(title = stringResource(R.string.plan_sectionTimes)) {
                InfoRow(
                    label = stringResource(R.string.plan_timesPerDay),
                    value = stringResource(R.string.plan_perDay, times.size)
                )
                ChoiceChipRow(
                    options = DomainTimes,
                    isSelected = { it in times },
                    onToggle = { time ->
                        times = if (time in times) times - time else times + time
                    },
                    label = { it },
                    testId = { "plan-time-$it" }
                )
                Row(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    times.sorted().forEachIndexed { index, time ->
                        TextButton(
                            onClick = { dialog = PlanDialog.TimePicker(index) },
                            modifier = Modifier.testId("plan-time-edit-$index")
                        ) { Text(time) }
                    }
                    TextButton(
                        onClick = { dialog = PlanDialog.TimePicker(-1) },
                        modifier = Modifier.testId("plan-time-add")
                    ) { Text(stringResource(R.string.common_add)) }
                }
                if (!timesValid) {
                    Text(
                        text = stringResource(
                            if (times.isEmpty()) R.string.plan_errorTimes else R.string.plan_errorDuplicateTimes
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(horizontal = 16.dp)
                    )
                }
            }

            // MARK: 起止日期
            SectionCard(title = stringResource(R.string.plan_sectionDateRange)) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    DateField(
                        label = stringResource(R.string.plan_startDate),
                        value = startDate,
                        onValueChange = { startDate = it },
                        dialogTitle = stringResource(R.string.date_picker_title),
                        confirmText = done,
                        cancelText = cancel,
                        testId = "plan-start-date"
                    )
                    DateField(
                        label = stringResource(R.string.plan_endDate),
                        value = endDate,
                        onValueChange = { endDate = it },
                        dialogTitle = stringResource(R.string.date_picker_title),
                        confirmText = done,
                        cancelText = cancel,
                        testId = "plan-end-date"
                    )
                    Text(
                        text = stringResource(
                            if (endDate.isBlank()) R.string.plan_endDateUnlimited
                            else R.string.plan_endDateSet
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (!datesValid) {
                        Text(
                            text = stringResource(R.string.plan_errorEndDate),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }

            // MARK: 状态
            SectionCard(title = stringResource(R.string.plan_sectionStatus)) {
                SwitchRow(
                    label = stringResource(R.string.plan_enableLabel),
                    checked = enabled,
                    onCheckedChange = { enabled = it },
                    testId = "plan-enabled-switch"
                )
                InfoRow(
                    label = stringResource(R.string.plan_statusHint),
                    value = stringResource(
                        if (enabled) R.string.plan_enabledChip else R.string.plan_disabledChip
                    )
                )
            }

            PrimaryAction(
                text = stringResource(R.string.plan_savePlan),
                onClick = {
                    val changes = buildPlanChanges(
                        existing = existing,
                        personId = selectedPerson.orEmpty(),
                        medicationIds = selectedMedications,
                        doses = doses,
                        times = times.sorted(),
                        startDate = startDate,
                        endDate = endDate.ifBlank { null },
                        enabled = enabled
                    )
                    viewModel.applyPlanChanges(changes)
                    onBack()
                },
                enabled = canSave,
                modifier = Modifier.padding(horizontal = 16.dp),
                testId = "plan-save-button"
            )
        }
    }

    // MARK: 对话框

    when (val current = dialog) {
        PlanDialog.None -> Unit

        is PlanDialog.TimePicker -> {
            // index = -1 表示「新增一个时间点」，否则改现有的第 index 个
            val currentTime =
                if (current.index >= 0) times.sorted().getOrNull(current.index) ?: "09:00" else "09:00"
            TimePickerDialog(
                initial = currentTime,
                title = stringResource(R.string.time_picker_title),
                confirmText = done,
                cancelText = cancel,
                onConfirm = { picked ->
                    times = if (current.index >= 0) {
                        times - currentTime + picked
                    } else {
                        times + picked
                    }
                    dialog = PlanDialog.None
                },
                onDismiss = { dialog = PlanDialog.None }
            )
        }
    }
}

/** 默认时间点。 */
private val DomainTimes = listOf("07:00", "08:00", "12:00", "15:00", "18:00", "21:00")

/** 单位短标签（片 / 粒）。 */
@Composable
private fun unitLabelOf(unit: top.youngxhui.rememberyao.core.model.MedicationUnit): String {
    val context = androidx.compose.ui.platform.LocalContext.current
    return top.youngxhui.rememberyao.core.l10n.L10n.unitLabel(context, unit)
}

/**
 * 把表单状态翻译成一次多笔变更。
 *
 * 编辑态下，原来勾中而现在没勾的药 = 移除；仍然勾中的 = 更新；
 * 新勾上的 = 新增。语义与逐笔调用完全一致，但只重排一次通知。
 */
private fun buildPlanChanges(
    existing: MedicationPlan?,
    personId: String,
    medicationIds: Set<String>,
    doses: Map<String, String>,
    times: List<String>,
    startDate: String,
    endDate: String?,
    enabled: Boolean
): PlanChanges {
    val doseOf = { id: String -> doses[id]?.toIntOrNull() ?: 1 }

    if (existing == null) {
        return PlanChanges(
            add = medicationIds.map { id ->
                PlanInput(
                    medicationId = id,
                    personId = personId,
                    doseAmount = doseOf(id),
                    times = times,
                    startDate = startDate,
                    endDate = endDate,
                    enabled = enabled
                )
            }
        )
    }

    val stillThere = existing.medicationId in medicationIds
    val updates = if (stillThere) {
        listOf(
            PlanUpdate(existing.id) { plan ->
                plan.copy(
                    doseAmount = doseOf(plan.medicationId),
                    times = times,
                    startDate = startDate,
                    endDate = endDate,
                    enabled = enabled
                )
            }
        )
    } else {
        emptyList()
    }

    return PlanChanges(
        add = (medicationIds - existing.medicationId).map { id ->
            PlanInput(
                medicationId = id,
                personId = personId,
                doseAmount = doseOf(id),
                times = times,
                startDate = startDate,
                endDate = endDate,
                enabled = enabled
            )
        },
        update = updates,
        remove = if (stillThere) emptyList() else listOf(existing.id)
    )
}

/** 时间选择对话框：原生 `TimePicker`。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimePickerDialog(
    initial: String,
    title: String,
    confirmText: String,
    cancelText: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val (hour, minute) = top.youngxhui.rememberyao.ui.components.parseTime(initial)
    val state = rememberTimePickerState(initialHour = hour, initialMinute = minute, is24Hour = true)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { TimePicker(state = state) },
        confirmButton = {
            TextButton(onClick = { onConfirm("%02d:%02d".format(state.hour, state.minute)) }) {
                Text(confirmText)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(cancelText) } }
    )
}
