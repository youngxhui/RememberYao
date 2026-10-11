package top.youngxhui.rememberyao.ui.medica

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.Domain
import top.youngxhui.rememberyao.core.domain.blisterSummary
import top.youngxhui.rememberyao.core.domain.stockLevel
import top.youngxhui.rememberyao.core.domain.stockSummary
import top.youngxhui.rememberyao.core.l10n.L10n
import top.youngxhui.rememberyao.core.model.BlisterSlotStatus
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.StockLevel
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.ClickableRow
import top.youngxhui.rememberyao.ui.components.ConfirmDialog
import top.youngxhui.rememberyao.ui.components.DestructiveAction
import top.youngxhui.rememberyao.ui.components.EmptyState
import top.youngxhui.rememberyao.ui.components.InfoRow
import top.youngxhui.rememberyao.ui.components.NumberPromptDialog
import top.youngxhui.rememberyao.ui.components.ScreenScaffold
import top.youngxhui.rememberyao.ui.components.SectionCard
import top.youngxhui.rememberyao.ui.components.testId
import top.youngxhui.rememberyao.ui.theme.StatusTint

/** 详情页当前打开的对话框。 */
private sealed interface DetailDialog {
    data object None : DetailDialog
    data object Restock : DetailDialog
    data object RestockPacks : DetailDialog
    data object EnableTwin : DetailDialog
    data object Delete : DetailDialog
}

/**
 * 药品详情：库存概览 + 基础信息 + 数字孪生入口 + 用药配置 + 补货 + 编辑 / 删除。
 *
 * 全部原生控件：`TopAppBar`、分组卡片、`AlertDialog`。屏幕只读快照并派发动作。
 */
@Composable
fun MedicaDetailScreen(
    viewModel: AppViewModel,
    medicationId: String,
    onBack: () -> Unit,
    onEdit: (String) -> Unit,
    onOpenTwin: (String) -> Unit,
    onAddPlan: (String) -> Unit
) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.reload() }

    val context = LocalContext.current
    var dialog by remember { mutableStateOf<DetailDialog>(DetailDialog.None) }

    val snapshot = data
    val medication = snapshot?.medications?.firstOrNull { it.id == medicationId }

    ScreenScaffold(
        title = medication?.name ?: stringResource(R.string.medication_listTitle),
        onBack = onBack,
        backTestId = "medication-detail-back"
    ) { innerPadding ->
        if (snapshot == null || medication == null) {
            EmptyState(
                text = stringResource(R.string.medication_notFound),
                modifier = Modifier.padding(innerPadding)
            )
            return@ScreenScaffold
        }

        val summary = stockSummary(medication, snapshot.plans)
        val twin = blisterSummary(medication, snapshot.packs, snapshot.blisterSlots)
        val plans = snapshot.plans.filter { it.medicationId == medication.id }
        val tint = when (medication.stockLevel) {
            StockLevel.OK -> StatusTint.Success
            StockLevel.LOW -> StatusTint.Warning
            StockLevel.CRITICAL -> StatusTint.Danger
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = innerPadding,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // MARK: 库存概览
            item {
                SectionCard(title = stringResource(R.string.medication_sectionStockManage)) {
                    InfoRow(
                        label = stringResource(R.string.medication_remaining),
                        value = "${medication.remainingQuantity} / ${medication.totalQuantity} " +
                            L10n.unitLabel(context, medication.unit),
                        labelColor = tint,
                        icon = Icons.Rounded.Info,
                        iconTint = tint
                    )
                    InfoRow(
                        label = stringResource(R.string.medication_daysLeftLabel),
                        value = summary.daysLeft?.let {
                            stringResource(
                                if (summary.low) R.string.medication_daysLeftHintLow
                                else R.string.medication_daysLeftHint,
                                it
                            )
                        } ?: stringResource(R.string.medication_noEstimate)
                    )
                    if (summary.dailyDose > 0) {
                        InfoRow(
                            label = stringResource(R.string.medication_dailyDose),
                            value = "${summary.dailyDose} ${L10n.unitLabel(context, medication.unit)}"
                        )
                    }
                }
            }

            // MARK: 基础信息
            item {
                SectionCard(title = stringResource(R.string.medication_sectionBasic)) {
                    InfoRow(
                        label = stringResource(R.string.medication_type),
                        value = L10n.typeLabel(context, medication.type)
                    )
                    InfoRow(
                        label = stringResource(R.string.medication_categoryField),
                        value = L10n.categoryLabel(context, medication.category)
                    )
                    if (medication.specification.isNotBlank()) {
                        InfoRow(
                            label = stringResource(R.string.medication_specification),
                            value = medication.specification
                        )
                    }
                    medication.expiryDate?.let { expiry ->
                        InfoRow(
                            label = stringResource(R.string.medication_expiryDate),
                            value = expiry
                        )
                    }
                    InfoRow(
                        label = stringResource(R.string.medication_prescription),
                        value = stringResource(
                            if (medication.prescription) R.string.medication_prescriptionYes
                            else R.string.medication_prescriptionNo
                        )
                    )
                    if (medication.notes.isNotBlank()) {
                        InfoRow(
                            label = stringResource(R.string.medication_notes),
                            value = medication.notes
                        )
                    }

                    // 孪生入口：已开启 → 进格子页；未开启且是板装 → 收集规格开启
                    if (twin.enabled) {
                        val openSeq = twin.openPack?.seq ?: twin.packCount
                        ClickableRow(
                            label = stringResource(R.string.medication_twinSection),
                            supporting = if (twin.fullSlots > 0) {
                                stringResource(
                                    R.string.medication_twinProgressOpen,
                                    openSeq,
                                    twin.fullSlots,
                                    twin.totalSlots
                                )
                            } else {
                                stringResource(R.string.medication_twinProgressDone)
                            },
                            onClick = { onOpenTwin(medication.id) },
                            testId = "medica-twin-entry"
                        )
                    } else if (medication.type == top.youngxhui.rememberyao.core.model.MedicationType.BLISTER) {
                        ClickableRow(
                            label = stringResource(R.string.medication_twinEnable),
                            onClick = { dialog = DetailDialog.EnableTwin },
                            testId = "medica-twin-enable"
                        )
                    }
                }
            }

            // MARK: 用药配置
            item {
                SectionCard(title = stringResource(R.string.medication_takers)) {
                    if (plans.isEmpty()) {
                        EmptyState(text = stringResource(R.string.medication_noPlans))
                    }
                }
            }
            items(plans, key = { it.id }) { plan ->
                val person = snapshot.persons.firstOrNull { it.id == plan.personId }
                InfoRow(
                    label = person?.name ?: stringResource(R.string.home_unknownPerson),
                    value = stringResource(R.string.plan_perDay, plan.times.size) +
                        " · " + plan.times.joinToString(" "),
                    modifier = Modifier.padding(horizontal = 16.dp),
                    testId = "medica-plan-row"
                )
            }
            item {
                ClickableRow(
                    label = stringResource(R.string.plan_emptyAddHint),
                    labelColor = MaterialTheme.colorScheme.primary,
                    onClick = { onAddPlan(medication.id) },
                    modifier = Modifier.padding(horizontal = 16.dp),
                    testId = "medica-add-plan"
                )
            }

            // MARK: 补货
            item {
                SectionCard(title = stringResource(R.string.medication_restock)) {
                    if (twin.enabled) {
                        val perPack = (medication.blisterRows ?: 1) * (medication.blisterCols ?: 1)
                        ClickableRow(
                            label = stringResource(R.string.medication_restock),
                            supporting = stringResource(
                                R.string.medication_restockPacksHint,
                                perPack,
                                L10n.unitLabel(context, medication.unit)
                            ),
                            onClick = { dialog = DetailDialog.RestockPacks },
                            testId = "medica-restock-packs"
                        )
                    } else {
                        ClickableRow(
                            label = stringResource(R.string.medication_restock),
                            supporting = stringResource(R.string.medication_restockHint),
                            onClick = { dialog = DetailDialog.Restock },
                            testId = "medica-restock"
                        )
                    }
                }
            }

            // MARK: 编辑 / 删除
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    TextButton(
                        onClick = { onEdit(medication.id) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testId("medica-edit-button")
                    ) { Text(stringResource(R.string.common_edit)) }
                    DestructiveAction(
                        text = stringResource(R.string.medication_deleteButton),
                        onClick = { dialog = DetailDialog.Delete },
                        testId = "medica-delete-button"
                    )
                }
            }
        }
    }

    when (dialog) {
        DetailDialog.None -> Unit

        DetailDialog.Restock -> NumberPromptDialog(
            title = stringResource(R.string.medication_restock),
            message = stringResource(R.string.medication_restockHint),
            placeholder = stringResource(R.string.medication_restockPlaceholder),
            confirmText = stringResource(R.string.medication_restockSubmit),
            dismissText = stringResource(R.string.common_cancel),
            onConfirm = { amount ->
                viewModel.restockMedication(medicationId, amount)
                dialog = DetailDialog.None
            },
            onDismiss = { dialog = DetailDialog.None }
        )

        DetailDialog.RestockPacks -> {
            val perPack = (medication?.blisterRows ?: 1) * (medication?.blisterCols ?: 1)
            NumberPromptDialog(
                title = stringResource(R.string.medication_restock),
                message = stringResource(
                    R.string.medication_restockPacksHint,
                    perPack,
                    medication?.let { L10n.unitLabel(context, it.unit) } ?: ""
                ),
                placeholder = stringResource(R.string.medication_restockPacksPlaceholder),
                confirmText = stringResource(R.string.medication_restockPacksSubmit),
                dismissText = stringResource(R.string.common_cancel),
                onConfirm = { count ->
                    viewModel.appendBlisterPacks(medicationId, count)
                    dialog = DetailDialog.None
                },
                onDismiss = { dialog = DetailDialog.None }
            )
        }

        DetailDialog.EnableTwin -> EnableTwinDialog(
            medication = medication,
            onConfirm = { rows, cols, packs ->
                viewModel.openBlisterTwin(
                    medicationId,
                    top.youngxhui.rememberyao.core.domain.BlisterSpec(rows, cols, packs)
                )
                dialog = DetailDialog.None
            },
            onDismiss = { dialog = DetailDialog.None }
        )

        DetailDialog.Delete -> ConfirmDialog(
            title = stringResource(R.string.medication_deleteButton),
            message = stringResource(R.string.medication_deleteHint),
            confirmText = stringResource(R.string.medication_deleteConfirmButton),
            dismissText = stringResource(R.string.common_cancel),
            destructive = true,
            onConfirm = {
                viewModel.deleteMedication(medicationId)
                dialog = DetailDialog.None
                onBack()
            },
            onDismiss = { dialog = DetailDialog.None }
        )
    }
}

/** 开启数字孪生：一次收集每板行列与板数三个字段。 */
@Composable
private fun EnableTwinDialog(
    medication: Medication?,
    onConfirm: (rows: Int, cols: Int, packs: Int) -> Unit,
    onDismiss: () -> Unit
) {
    var rows by remember { mutableStateOf((medication?.blisterRows ?: 2).toString()) }
    var cols by remember { mutableStateOf((medication?.blisterCols ?: 5).toString()) }
    var packs by remember { mutableStateOf("1") }

    val parsedRows = rows.toIntOrNull()
    val parsedCols = cols.toIntOrNull()
    val parsedPacks = packs.toIntOrNull()
    val valid = parsedRows != null && parsedCols != null && parsedPacks != null &&
        parsedRows in 1..Domain.MAX_PACK_SIDE &&
        parsedCols in 1..Domain.MAX_PACK_SIDE &&
        parsedPacks in 1..Domain.MAX_PACK_COUNT

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.twin_enableTitle)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.twin_enableBody))
                LabeledNumber(
                    label = stringResource(R.string.twin_specRows),
                    value = rows,
                    onValueChange = { rows = it },
                    testId = "twin-rows-input"
                )
                LabeledNumber(
                    label = stringResource(R.string.twin_specCols),
                    value = cols,
                    onValueChange = { cols = it },
                    testId = "twin-cols-input"
                )
                LabeledNumber(
                    label = stringResource(R.string.twin_specPacks),
                    value = packs,
                    onValueChange = { packs = it },
                    testId = "twin-packs-input"
                )
                if (!valid) {
                    Text(
                        text = stringResource(R.string.twin_specInvalid),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(parsedRows!!, parsedCols!!, parsedPacks!!) },
                enabled = valid
            ) { Text(stringResource(R.string.twin_specSubmit)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) }
        }
    )
}

@Composable
private fun LabeledNumber(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    testId: String
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.weight(1f)
        )
        androidx.compose.material3.OutlinedTextField(
            value = value,
            onValueChange = { onValueChange(it.filter(Char::isDigit)) },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth(0.4f)
                .testId(testId)
        )
    }
}

/** 槽位状态的本地化标签（孪生页与图例共用）。 */
internal fun slotStatusLabel(status: BlisterSlotStatus): Int = when (status) {
    BlisterSlotStatus.FULL -> R.string.twin_slotFull
    BlisterSlotStatus.EMPTY -> R.string.twin_slotTaken
    BlisterSlotStatus.VOID -> R.string.twin_slotVoid
}
