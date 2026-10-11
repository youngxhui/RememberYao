package top.youngxhui.rememberyao.ui.medica

import android.content.Intent
import android.speech.RecognizerIntent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Medication
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.stockLevel
import top.youngxhui.rememberyao.core.domain.stockSummary
import top.youngxhui.rememberyao.core.l10n.L10n
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.MedicationCategory
import top.youngxhui.rememberyao.core.model.StockLevel
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.ConnectedListItem
import top.youngxhui.rememberyao.ui.components.EmptyState
import top.youngxhui.rememberyao.ui.components.LeadingIconCircle
import top.youngxhui.rememberyao.ui.components.SearchField
import top.youngxhui.rememberyao.ui.components.connectedListItemShape
import top.youngxhui.rememberyao.ui.components.testId

/**
 * 分类 / 低库存筛选。null = 全部。
 *
 * 标签片组按设计稿固定三枚：慢性病 / 保健品 / 库存不足。单选带Toggle：
 * 再点一次当前项即取消筛选回到全部，不需要额外占一枚「全部」。
 */
private enum class MedicaFilter(val labelRes: Int) {
    CHRONIC(R.string.medication_categoryChronic),
    SUPPLEMENT(R.string.medication_categorySupplement),
    LOW(R.string.medication_filterLow)
}

/**
 * 药品库：搜索栏 + 标签片组筛选 + 相连列表 + 添加 FAB。
 *
 * 视觉基准 M3 Expressive 设计稿：64dp 顶部应用栏、56dp 全圆角搜索栏
 * （左搜索右麦克风）、40dp 高相连标签片组、72dp 相连列表项（外侧 28dp、
 * 内侧 8dp 圆角）、右下角扩展 FAB。屏幕只读快照并派发动作。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MedicaListScreen(
    viewModel: AppViewModel,
    onOpenMedication: (String) -> Unit,
    onAddMedication: () -> Unit
) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    val loading by viewModel.loading.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.reload() }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val voiceUnavailable = stringResource(R.string.voice_unavailable)

    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf<MedicaFilter?>(null) }

    // 语音搜索：系统识别 Intent 回填查询。没有语音识别应用的设备直接提示，
    // 不让麦克风按钮点了没反应。
    val voiceLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val spoken = result.data
            ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
            ?.firstOrNull()
        if (spoken != null && spoken.isNotBlank()) {
            query = spoken
        }
    }

    val snapshot = data
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        containerColor = MaterialTheme.colorScheme.surface,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.nav_medica)) },
                scrollBehavior = scrollBehavior
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onAddMedication,
                icon = { Icon(Icons.Rounded.Add, contentDescription = null) },
                text = { Text(stringResource(R.string.common_add)) },
                modifier = Modifier.testId("medica-add-button")
            )
        }
    ) { innerPadding ->
        if (snapshot == null || (loading && snapshot.medications.isEmpty())) {
            Column(modifier = Modifier.fillMaxSize()) {}
            return@Scaffold
        }

        val visible = snapshot.medications
            .filter { medication ->
                val matchesQuery = query.isBlank() ||
                    medication.name.contains(query, ignoreCase = true)
                val matchesFilter = when (filter) {
                    null -> true
                    MedicaFilter.CHRONIC -> medication.category == MedicationCategory.CHRONIC
                    MedicaFilter.SUPPLEMENT -> medication.category == MedicationCategory.SUPPLEMENT
                    MedicaFilter.LOW ->
                        stockSummary(medication, snapshot.plans).low ||
                            medication.stockLevel != StockLevel.OK
                }
                matchesQuery && matchesFilter
            }
            .sortedBy { it.name }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                top = innerPadding.calculateTopPadding() + 8.dp,
                bottom = innerPadding.calculateBottomPadding() + 88.dp,
                start = 16.dp,
                end = 16.dp
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                SearchField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = stringResource(R.string.medication_searchHint),
                    voiceSearchDescription = stringResource(R.string.medication_voiceSearch),
                    onVoiceSearch = {
                        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                            putExtra(
                                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                            )
                        }
                        // 少数设备没有语音识别应用：抛 ActivityNotFound，转成提示
                        runCatching { voiceLauncher.launch(intent) }
                            .onFailure {
                                scope.launch { snackbarHostState.showSnackbar(voiceUnavailable) }
                            }
                    },
                    testId = "medica-search-input"
                )
            }

            item {
                MedicaFilterRow(
                    selected = filter,
                    onSelect = { picked -> filter = if (filter == picked) null else picked }
                )
            }

            if (visible.isEmpty()) {
                item {
                    EmptyState(
                        text = stringResource(
                            if (snapshot.medications.isEmpty()) {
                                R.string.medication_emptyTitle
                            } else {
                                R.string.medication_emptySearch
                            }
                        ),
                        hint = if (snapshot.medications.isEmpty()) {
                            stringResource(R.string.medication_empty)
                        } else {
                            null
                        },
                        icon = Icons.Rounded.Medication
                    )
                }
            }

            itemsIndexed(visible, key = { _, medication -> medication.id }) { index, medication ->
                MedicationListItem(
                    medication = medication,
                    shape = connectedListItemShape(index, visible.size),
                    onClick = { onOpenMedication(medication.id) }
                )
            }
        }
    }
}

/** 标签片组：慢性病 / 保健品 / 库存不足，高 40dp、居中、相连（内侧圆角 4dp）。 */
@Composable
private fun MedicaFilterRow(
    selected: MedicaFilter?,
    onSelect: (MedicaFilter) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(3.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically
    ) {
        MedicaFilter.entries.forEachIndexed { index, option ->
            val isSelected = selected == option
            FilterChip(
                selected = isSelected,
                onClick = { onSelect(option) },
                label = { Text(stringResource(option.labelRes)) },
                modifier = Modifier
                    .height(40.dp)
                    .testId("medica-filter-${option.name.lowercase()}"),
                shape = connectedChipShape(index, MedicaFilter.entries.size),
                leadingIcon = if (isSelected) {
                    {
                        Icon(
                            Icons.Rounded.Check,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                } else {
                    null
                },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
                    selectedLabelColor = MaterialTheme.colorScheme.onSecondaryContainer,
                    selectedLeadingIconColor = MaterialTheme.colorScheme.onSecondaryContainer
                )
            )
        }
    }
}

/**
 * 相连标签片第 [index] 项（共 [count] 项）的形状。
 *
 * 外侧保持标签片自己的 8dp 圆角，只把相邻的内侧两个角收小到 4dp ——
 * M3 Expressive 的相连 chip 组。
 */
private fun connectedChipShape(index: Int, count: Int): Shape = when {
    count <= 1 -> RoundedCornerShape(8.dp)
    index == 0 -> RoundedCornerShape(topStart = 8.dp, bottomStart = 8.dp, topEnd = 4.dp, bottomEnd = 4.dp)
    index == count - 1 -> RoundedCornerShape(topStart = 4.dp, bottomStart = 4.dp, topEnd = 8.dp, bottomEnd = 8.dp)
    else -> RoundedCornerShape(4.dp)
}

/** 药品列表项： medication 图标 + 名称 + 分类 + 右侧 chevron。 */
@Composable
private fun MedicationListItem(
    medication: Medication,
    shape: Shape,
    onClick: () -> Unit
) {
    val context = LocalContext.current
    ConnectedListItem(
        headline = medication.name,
        supporting = L10n.categoryLabel(context, medication.category),
        shape = shape,
        leading = { LeadingIconCircle(Icons.Rounded.Medication) },
        trailing = {
            Icon(
                imageVector = Icons.Rounded.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        onClick = onClick,
        testId = "medica-item-${medication.id}"
    )
}
