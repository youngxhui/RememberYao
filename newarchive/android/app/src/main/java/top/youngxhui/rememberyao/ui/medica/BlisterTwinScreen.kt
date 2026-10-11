package top.youngxhui.rememberyao.ui.medica

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.Domain
import top.youngxhui.rememberyao.core.domain.blisterSummary
import top.youngxhui.rememberyao.core.domain.pickPillTint
import top.youngxhui.rememberyao.core.model.BlisterSlot
import top.youngxhui.rememberyao.core.model.BlisterSlotStatus
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.EmptyState
import top.youngxhui.rememberyao.ui.components.ScreenScaffold
import top.youngxhui.rememberyao.ui.components.testId
import top.youngxhui.rememberyao.ui.theme.Foil
import top.youngxhui.rememberyao.ui.theme.StatusTint

/** 孪生页当前打开的对话框：空格子操作 / 选人 / 补一板。 */
private sealed interface TwinDialog {
    data object None : TwinDialog
    data class Slot(val slot: BlisterSlot, val packSeq: Int) : TwinDialog
    data class Person(val slot: BlisterSlot) : TwinDialog
    data object AddPack : TwinDialog
}

/**
 * 板装药数字孪生：逐格镜像实体泡罩，点格子可记一次服用 / 标记损坏 / 撤销 / 恢复。
 *
 * 网格用 `LazyVerticalGrid`（Compose 原生的等分网格，自带复用与无障碍）。
 * 药板视觉用图层叠出来：铝箔底 → 透明泡罩 → 药饼。Compose 的 modifiers 包
 * 没有 background 渐变，所以这里按「同心圆分层」保留体积感，观感与 iOS 的
 * 真渐变版本同源但不等价 —— 见 AGENTS.md 的说明。
 */
@Composable
fun BlisterTwinScreen(
    viewModel: AppViewModel,
    medicationId: String,
    onBack: () -> Unit
) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.reload() }

    var dialog by remember { mutableStateOf<TwinDialog>(TwinDialog.None) }

    val snapshot = data
    val medication = snapshot?.medications?.firstOrNull { it.id == medicationId }
    val summary = medication?.let {
        blisterSummary(it, snapshot.packs, snapshot.blisterSlots)
    }

    // 按板序 → 格序排：泡罩从左到右、从上到下消耗，与真人嗑药片的顺序一致
    val slots = snapshot?.packs
        ?.filter { it.medicationId == medicationId }
        ?.sortedBy { it.seq }
        ?.flatMap { pack ->
            snapshot.blisterSlots
                .filter { it.packId == pack.id }
                .sortedBy { it.index }
                .map { it to pack.seq }
        }
        .orEmpty()

    ScreenScaffold(
        title = medication?.name ?: stringResource(R.string.twin_enableTitle),
        onBack = onBack,
        backTestId = "twin-back",
        floatingActionButton = {
            // 补一板：板装药的补货走这里，不改总库存数字
            Button(
                onClick = { dialog = TwinDialog.AddPack },
                modifier = Modifier.testId("twin-add-pack")
            ) { Text(stringResource(R.string.twin_add_pack)) }
        }
    ) { innerPadding ->
        if (snapshot == null || medication == null || summary == null || !summary.enabled) {
            EmptyState(
                text = stringResource(R.string.twin_enableTitle),
                hint = stringResource(R.string.twin_enableBody),
                modifier = Modifier.padding(innerPadding)
            )
            return@ScreenScaffold
        }

        Column(modifier = Modifier.fillMaxSize()) {
            val openSeq = summary.openPack?.seq ?: summary.packCount
            Text(
                text = if (summary.fullSlots > 0) {
                    stringResource(
                        R.string.medication_twinProgressOpen,
                        openSeq,
                        summary.fullSlots,
                        summary.totalSlots
                    )
                } else {
                    stringResource(R.string.medication_twinProgressDone)
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
            )

            LazyVerticalGrid(
                columns = GridCells.Fixed(4),
                modifier = Modifier.fillMaxSize(),
                contentPadding = innerPadding,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(slots, key = { it.first.id }) { (slot, packSeq) ->
                    SlotCell(
                        slot = slot,
                        packSeq = packSeq,
                        tint = pickPillTint(medication.id),
                        onClick = { dialog = TwinDialog.Slot(slot, packSeq) }
                    )
                }
            }
        }
    }

    // `dialog` 是 by 委托的属性，智能转换不可用，先取一份快照再分支
    val current = dialog
    when (current) {
        TwinDialog.None -> Unit

        is TwinDialog.Slot -> {
            val slot = current.slot
            val packSeq = current.packSeq
            AlertDialog(
                onDismissRequest = { dialog = TwinDialog.None },
                title = {
                    Text(
                        stringResource(
                            R.string.twin_slotTitle,
                            slot.index + 1,
                            packSeq
                        )
                    )
                },
                confirmButton = {
                    Column {
                        when (slot.status) {
                            BlisterSlotStatus.FULL -> {
                                TextButton(onClick = { dialog = TwinDialog.Person(slot) }) {
                                    Text(stringResource(R.string.twin_actionConsume))
                                }
                                TextButton(onClick = {
                                    viewModel.voidBlisterSlot(slot.id)
                                    dialog = TwinDialog.None
                                }) { Text(stringResource(R.string.twin_actionVoid)) }
                            }

                            BlisterSlotStatus.EMPTY -> {
                                // 有服用记录才能撤销；历史补的空格（没记录）无撤销可言
                                val usageId = slot.usageId
                                if (usageId != null) {
                                    TextButton(onClick = {
                                        viewModel.undoUsage(usageId)
                                        dialog = TwinDialog.None
                                    }) { Text(stringResource(R.string.twin_actionUndo)) }
                                }
                                TextButton(onClick = {
                                    viewModel.restoreBlisterSlot(slot.id)
                                    dialog = TwinDialog.None
                                }) { Text(stringResource(R.string.twin_actionRestore)) }
                            }

                            BlisterSlotStatus.VOID -> {
                                TextButton(onClick = {
                                    viewModel.restoreBlisterSlot(slot.id)
                                    dialog = TwinDialog.None
                                }) { Text(stringResource(R.string.twin_actionRestore)) }
                            }
                        }
                    }
                },
                dismissButton = {
                    TextButton(onClick = { dialog = TwinDialog.None }) {
                        Text(stringResource(R.string.common_cancel))
                    }
                }
            )
        }

        // 手动记一次服用要知道是谁吃的：多名成员时先选人，一名时直接记
        is TwinDialog.Person -> {
            val slot = current.slot
            val persons = snapshot?.persons.orEmpty()
            if (persons.size <= 1) {
                LaunchedEffect(slot.id) {
                    persons.firstOrNull()?.let {
                        viewModel.consumeBlisterSlot(slot.id, it.id)
                    }
                    dialog = TwinDialog.None
                }
            } else {
                AlertDialog(
                    onDismissRequest = { dialog = TwinDialog.None },
                    title = { Text(stringResource(R.string.twin_personHint)) },
                    text = {
                        Column {
                            persons.forEach { person ->
                                Text(
                                    text = person.name,
                                    style = MaterialTheme.typography.bodyLarge,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            viewModel.consumeBlisterSlot(slot.id, person.id)
                                            dialog = TwinDialog.None
                                        }
                                        .padding(vertical = 12.dp)
                                        .testId("twin-person-${person.id}")
                                )
                            }
                        }
                    },
                    confirmButton = {
                        TextButton(onClick = { dialog = TwinDialog.None }) {
                            Text(stringResource(R.string.common_cancel))
                        }
                    }
                )
            }
        }

        TwinDialog.AddPack -> NumberOfPacksDialog(
            onConfirm = { count ->
                viewModel.appendBlisterPacks(medicationId, count)
                dialog = TwinDialog.None
            },
            onDismiss = { dialog = TwinDialog.None }
        )
    }
}

/** 单格泡罩：铝箔底 → 透明泡罩 → 药饼。服后的格子是顶破的凹坑，损坏的打叉。 */
@Composable
private fun SlotCell(
    slot: BlisterSlot,
    packSeq: Int,
    tint: Domain.PillTint,
    onClick: () -> Unit
) {
    val foil = Foil.Base
    val blister = when (slot.status) {
        BlisterSlotStatus.FULL -> Color.White.copy(alpha = 0.35f)
        else -> Foil.Dent
    }
    val border = when (slot.status) {
        BlisterSlotStatus.FULL -> Color.White.copy(alpha = 0.7f)
        else -> Foil.Shade
    }
    val pill = when (slot.status) {
        BlisterSlotStatus.FULL -> parseColor(tint.body)
        else -> Color.Transparent
    }

    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(8.dp))
            .background(foil)
            .border(1.dp, Foil.Ring, RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .testId("twin-slot-${slot.id}"),
        contentAlignment = Alignment.Center
    ) {
        // 泡罩：半透明圆，掠射角边缘压暗（用一圈深色描边近似）
        Box(
            modifier = Modifier
                .fillMaxSize(0.78f)
                .clip(CircleShape)
                .background(blister)
                .border(1.dp, border, CircleShape),
            contentAlignment = Alignment.Center
        ) {
            // 药饼：0.94 不透明度读作「在塑料底下」
            if (slot.status == BlisterSlotStatus.FULL) {
                Box(
                    modifier = Modifier
                        .fillMaxSize(0.62f)
                        .clip(CircleShape)
                        .background(pill.copy(alpha = 0.94f))
                )
            }
            if (slot.status == BlisterSlotStatus.VOID) {
                Text(
                    text = "×",
                    style = MaterialTheme.typography.titleLarge,
                    color = StatusTint.Danger
                )
            }
        }
    }
}

/** 补一板：只问板数，规格沿用老板（历史板保持自己的几何）。 */
@Composable
private fun NumberOfPacksDialog(onConfirm: (Int) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf("1") }
    val count = text.toIntOrNull()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.twin_add_pack)) },
        text = {
            androidx.compose.material3.OutlinedTextField(
                value = text,
                onValueChange = { text = it.filter(Char::isDigit) },
                singleLine = true
            )
        },
        confirmButton = {
            TextButton(
                onClick = { count?.let(onConfirm) },
                enabled = count != null && count in 1..Domain.MAX_PACK_COUNT
            ) { Text(stringResource(R.string.common_done)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) }
        }
    )
}

/** "#rrggbb" → Color。解析不了就退回中性色，不让整屏因为一个脏数据崩掉。 */
private fun parseColor(hex: String): Color {
    val cleaned = hex.removePrefix("#")
    if (cleaned.length != 6) return Foil.Shade
    val value = cleaned.toLongOrNull(16) ?: return Foil.Shade
    return Color(0xFF000000L or value)
}
