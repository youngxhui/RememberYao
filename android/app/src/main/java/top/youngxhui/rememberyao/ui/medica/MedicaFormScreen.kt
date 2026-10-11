package top.youngxhui.rememberyao.ui.medica

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.MedicationInput
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.MedicationCategory
import top.youngxhui.rememberyao.core.model.MedicationType
import top.youngxhui.rememberyao.core.model.MedicationUnit
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.DateField
import top.youngxhui.rememberyao.ui.components.LabeledField
import top.youngxhui.rememberyao.ui.components.NumberField
import top.youngxhui.rememberyao.ui.components.PrimaryAction
import top.youngxhui.rememberyao.ui.components.ScreenScaffold
import top.youngxhui.rememberyao.ui.components.SectionCard
import top.youngxhui.rememberyao.ui.components.SplitButton
import top.youngxhui.rememberyao.ui.components.SplitMenuItem
import top.youngxhui.rememberyao.ui.components.SwitchRow
import top.youngxhui.rememberyao.ui.components.testId

/**
 * 添加 / 编辑药品。
 *
 * 表单一律用平台原生：`SegmentedButton` 做单选（包装形式、单位）、
 * `Switch` 做布尔、`DatePicker` 选有效期、`OutlinedTextField` 收文本。
 * 新建时板装规格三字段可选填，填了就同时建数字孪生。
 *
 * 保存走 M3 Expressive 拆分按钮：左段「保存」，右段菜单给
 * 「保存并设置提醒 / 保存后再添加一个」。保存后底部弹「已保存」消息条，
 * 「撤销」可回退这一次写入（新建=删除，编辑=还原旧值）。
 */
@Composable
fun MedicaFormScreen(
    viewModel: AppViewModel,
    medicationId: String?,
    onBack: () -> Unit,
    onSavedWithPlan: (String) -> Unit = {}
) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.reload() }

    val existing = medicationId?.let { id -> data?.medications?.firstOrNull { it.id == id } }
    val isEdit = existing != null

    var name by remember { mutableStateOf("") }
    var type by remember { mutableStateOf(MedicationType.BLISTER) }
    var category by remember { mutableStateOf(MedicationCategory.DEFAULT) }
    var specification by remember { mutableStateOf("") }
    var unit by remember { mutableStateOf(MedicationUnit.TABLET) }
    var totalQuantity by remember { mutableStateOf("") }
    var remainingQuantity by remember { mutableStateOf("") }
    var blisterRows by remember { mutableStateOf("") }
    var blisterCols by remember { mutableStateOf("") }
    var blisterPacks by remember { mutableStateOf("1") }
    var expiryDate by remember { mutableStateOf("") }
    var prescription by remember { mutableStateOf(false) }
    var notes by remember { mutableStateOf("") }
    var filled by remember { mutableStateOf(false) }
    /** 编辑前的旧值：消息条「撤销」用它还原。 */
    var beforeEdit by remember { mutableStateOf<Medication?>(null) }
    /** 「保存后再添加一个」：+1 触发一次清空（LaunchedEffect 里做）。 */
    var resetTick by remember { mutableIntStateOf(0) }

    // 编辑态回填一次：existing 是异步来的，用 filled 保证只填一次，
    // 否则用户改到一半会被快照刷新覆盖掉
    LaunchedEffect(existing?.id) {
        if (existing != null && !filled) {
            filled = true
            beforeEdit = existing
            name = existing.name
            type = existing.type
            category = existing.category
            specification = existing.specification
            unit = existing.unit
            totalQuantity = existing.totalQuantity.toString()
            remainingQuantity = existing.remainingQuantity.toString()
            blisterRows = existing.blisterRows?.toString() ?: ""
            blisterCols = existing.blisterCols?.toString() ?: ""
            expiryDate = existing.expiryDate ?: ""
            prescription = existing.prescription
            notes = existing.notes
        }
    }

    // 保存后再添加一个：把所有字段退回新建默认值
    LaunchedEffect(resetTick) {
        if (resetTick == 0) return@LaunchedEffect
        name = ""
        type = MedicationType.BLISTER
        category = MedicationCategory.DEFAULT
        specification = ""
        unit = MedicationUnit.TABLET
        totalQuantity = ""
        remainingQuantity = ""
        blisterRows = ""
        blisterCols = ""
        blisterPacks = "1"
        expiryDate = ""
        prescription = false
        notes = ""
        filled = false
    }

    val cancel = stringResource(R.string.common_cancel)
    val done = stringResource(R.string.common_done)
    val savedText = stringResource(R.string.common_saved)
    val undoText = stringResource(R.string.common_undo)
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    /** 组装当前表单的输入；校验不过返回 null。 */
    fun buildInput(): MedicationInput? {
        if (name.isBlank() || totalQuantity.toIntOrNull() == null) return null
        val rows = blisterRows.toIntOrNull()
        val cols = blisterCols.toIntOrNull()
        val packs = blisterPacks.toIntOrNull()
        // 板装且三字段都填了才建孪生：半套规格开不出格子
        val spec = if (type == MedicationType.BLISTER &&
            rows != null && cols != null && packs != null
        ) {
            top.youngxhui.rememberyao.core.domain.BlisterSpec(rows, cols, packs)
        } else {
            null
        }
        val total = totalQuantity.toIntOrNull() ?: 0
        val remaining = remainingQuantity.toIntOrNull() ?: total
        return MedicationInput(
            name = name.trim(),
            type = type,
            category = category,
            specification = specification.trim(),
            unit = unit,
            totalQuantity = total,
            remainingQuantity = remaining,
            blisterRows = if (type == MedicationType.BLISTER) rows else null,
            blisterCols = if (type == MedicationType.BLISTER) cols else null,
            expiryDate = expiryDate.ifBlank { null },
            prescription = prescription,
            notes = notes.trim(),
            blister = spec
        )
    }

    /** 落库 + 弹可撤销的消息条。[afterCreate] 在新建成功、拿到 id 后回调。 */
    fun save(afterCreate: (String) -> Unit = {}, showUndo: Boolean = true) {
        val input = buildInput() ?: return
        val previous = beforeEdit
        if (existing != null) {
            viewModel.updateMedication(existing.id) { med ->
                med.copy(
                    name = input.name,
                    type = input.type,
                    category = input.category,
                    specification = input.specification,
                    unit = input.unit,
                    totalQuantity = input.totalQuantity,
                    remainingQuantity = input.remainingQuantity,
                    blisterRows = input.blisterRows,
                    blisterCols = input.blisterCols,
                    expiryDate = input.expiryDate,
                    prescription = input.prescription,
                    notes = input.notes
                )
            }
            if (!showUndo) return
            scope.launch {
                val result = snackbarHostState.showSnackbar(
                    message = savedText,
                    actionLabel = undoText
                )
                // 撤销 = 还原编辑前的旧值
                if (result == SnackbarResult.ActionPerformed && previous != null) {
                    viewModel.updateMedication(existing.id) { previous }
                }
            }
        } else {
            viewModel.addMedication(input) { created ->
                afterCreate(created.id)
                if (!showUndo) return@addMedication
                scope.launch {
                    val result = snackbarHostState.showSnackbar(
                        message = savedText,
                        actionLabel = undoText
                    )
                    // 撤销 = 删掉刚建的那条
                    if (result == SnackbarResult.ActionPerformed) {
                        viewModel.deleteMedication(created.id)
                    }
                }
            }
        }
    }

    ScreenScaffold(
        title = stringResource(
            if (isEdit) R.string.medication_editTitle else R.string.medication_formTitle
        ),
        onBack = onBack,
        backTestId = "medication-form-back",
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            SectionCard(title = stringResource(R.string.medication_sectionBasic)) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    LabeledField(
                        label = stringResource(R.string.medication_name),
                        value = name,
                        onValueChange = { name = it },
                        placeholder = stringResource(R.string.medication_namePlaceholder),
                        supportingText = if (name.isBlank()) {
                            stringResource(R.string.medication_nameRequired)
                        } else {
                            null
                        },
                        isError = name.isBlank(),
                        testId = "medication-name-input"
                    )

                    ChoiceRow(
                        label = stringResource(R.string.medication_type),
                        options = MedicationType.entries,
                        selected = type,
                        onSelect = { type = it },
                        labelOf = {
                            stringResource(
                                when (it) {
                                    MedicationType.BLISTER -> R.string.medication_typeBlister
                                    MedicationType.BOTTLE -> R.string.medication_typeBottle
                                    MedicationType.LOOSE -> R.string.medication_typeLoose
                                }
                            )
                        },
                        testId = "medication-type-"
                    )

                    ChoiceRow(
                        label = stringResource(R.string.medication_categoryField),
                        options = MedicationCategory.entries,
                        selected = category,
                        onSelect = { category = it },
                        labelOf = {
                            stringResource(
                                when (it) {
                                    MedicationCategory.CHRONIC -> R.string.medication_categoryChronic
                                    MedicationCategory.ACUTE -> R.string.medication_categoryAcute
                                    MedicationCategory.SUPPLEMENT -> R.string.medication_categorySupplement
                                }
                            )
                        },
                        testId = "medication-category-"
                    )

                    ChoiceRow(
                        label = stringResource(R.string.medication_unit),
                        options = MedicationUnit.entries,
                        selected = unit,
                        onSelect = { unit = it },
                        labelOf = {
                            stringResource(
                                when (it) {
                                    MedicationUnit.TABLET -> R.string.medication_unitTablet
                                    MedicationUnit.PILL -> R.string.medication_unitPill
                                }
                            )
                        },
                        testId = "medication-unit-"
                    )

                    LabeledField(
                        label = stringResource(R.string.medication_specification),
                        value = specification,
                        onValueChange = { specification = it },
                        placeholder = stringResource(R.string.medication_specificationPlaceholder),
                        testId = "medication-spec-input"
                    )
                }
            }

            SectionCard(title = stringResource(R.string.medication_sectionStockManage)) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    NumberField(
                        label = stringResource(R.string.medication_totalStock),
                        value = totalQuantity,
                        onValueChange = { totalQuantity = it },
                        placeholder = stringResource(R.string.medication_totalStockPlaceholder),
                        supportingText = if (totalQuantity.toIntOrNull() == null) {
                            stringResource(R.string.medication_quantityInvalid)
                        } else {
                            null
                        },
                        testId = "medication-total-input"
                    )
                    NumberField(
                        label = stringResource(R.string.medication_currentStock),
                        value = remainingQuantity,
                        onValueChange = { remainingQuantity = it },
                        placeholder = stringResource(R.string.medication_currentStockPlaceholder),
                        testId = "medication-remaining-input"
                    )

                    if (type == MedicationType.BLISTER) {
                        Text(
                            text = stringResource(R.string.medication_blisterSpecHintNew),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        NumberField(
                            label = stringResource(R.string.medication_blisterRows),
                            value = blisterRows,
                            onValueChange = { blisterRows = it },
                            placeholder = stringResource(R.string.medication_blisterRowsPlaceholder),
                            testId = "medication-rows-input"
                        )
                        NumberField(
                            label = stringResource(R.string.medication_blisterCols),
                            value = blisterCols,
                            onValueChange = { blisterCols = it },
                            placeholder = stringResource(R.string.medication_blisterColsPlaceholder),
                            testId = "medication-cols-input"
                        )
                        NumberField(
                            label = stringResource(R.string.medication_blisterPackCount),
                            value = blisterPacks,
                            onValueChange = { blisterPacks = it },
                            placeholder = stringResource(
                                R.string.medication_blisterPackCountPlaceholder
                            ),
                            testId = "medication-packs-input"
                        )
                    }
                }
            }

            SectionCard(title = stringResource(R.string.medication_sectionOther)) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    DateField(
                        label = stringResource(R.string.medication_expiryDate),
                        value = expiryDate,
                        onValueChange = { expiryDate = it },
                        dialogTitle = stringResource(R.string.date_picker_title),
                        confirmText = done,
                        cancelText = cancel,
                        testId = "medication-expiry-input"
                    )

                    SwitchRow(
                        label = stringResource(R.string.medication_prescription),
                        checked = prescription,
                        onCheckedChange = { prescription = it },
                        testId = "medication-prescription-switch"
                    )

                    LabeledField(
                        label = stringResource(R.string.medication_notes),
                        value = notes,
                        onValueChange = { notes = it },
                        placeholder = stringResource(R.string.medication_notesFieldPlaceholder),
                        singleLine = false,
                        testId = "medication-notes-input"
                    )
                }
            }

            if (isEdit) {
                PrimaryAction(
                    text = stringResource(R.string.medication_saveMedication),
                    onClick = { save() },
                    enabled = name.isNotBlank() && totalQuantity.toIntOrNull() != null,
                    modifier = Modifier.padding(horizontal = 16.dp),
                    testId = "medication-save-button"
                )
            } else {
                // 新建：拆分按钮。左段保存，右段菜单给两条常用后续动作
                SplitButton(
                    text = stringResource(R.string.medication_saveMedication),
                    icon = Icons.Rounded.Check,
                    onClick = { save() },
                    enabled = name.isNotBlank() && totalQuantity.toIntOrNull() != null,
                    modifier = Modifier.padding(horizontal = 16.dp),
                    testId = "medication-save-button",
                    menuItems = listOf(
                        SplitMenuItem(stringResource(R.string.medication_saveAndPlan)) {
                            // 直接换成配置表单（popUpTo 把本屏弹出栈），不回列表再点一次
                            save(afterCreate = { onSavedWithPlan(it) }, showUndo = false)
                        },
                        SplitMenuItem(stringResource(R.string.medication_saveAndAddAnother)) {
                            save(afterCreate = { resetTick++ })
                        }
                    )
                )
            }
        }
    }
}

/** 单选行：`SingleChoiceSegmentedButtonRow`，Android 上「二选一 / 三选一」的原生形态。 */
@Composable
private fun <T> ChoiceRow(
    label: String,
    options: List<T>,
    selected: T,
    onSelect: (T) -> Unit,
    labelOf: @Composable (T) -> String,
    testId: String
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp)
        )
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            options.forEachIndexed { index, option ->
                SegmentedButton(
                    selected = option == selected,
                    onClick = { onSelect(option) },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = options.size),
                    modifier = Modifier.testId("$testId${options.indexOf(option)}")
                ) {
                    Text(labelOf(option))
                }
            }
        }
    }
}
