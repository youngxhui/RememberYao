package top.youngxhui.rememberyao.ui.records

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeTopAppBar
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.DateKey
import top.youngxhui.rememberyao.core.l10n.L10n
import top.youngxhui.rememberyao.core.model.Reminder
import top.youngxhui.rememberyao.core.model.ReminderStatus
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.EmptyState
import top.youngxhui.rememberyao.ui.components.SectionCard
import top.youngxhui.rememberyao.ui.components.testId
import top.youngxhui.rememberyao.ui.theme.StatusTint

/**
 * 服药记录：按日期翻历史与当日服药率。
 *
 * 日期放在 `LargeTopAppBar` 的标题位，翻页箭头是右侧的 `IconButton` —— 这是
 * Android 上「在同一条目里翻页」的原生形态（日历、相册都这么做），比在内容区
 * 画两颗‹ ›更一致。左侧的 navigationIcon 留给返回：推入屏不能只有系统手势一条退路。
 * 未来日期的箭头置灰：记录还没发生，翻过去只会看到空态。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordsScreen(
    viewModel: AppViewModel,
    onBack: () -> Unit
) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.reload() }

    val snapshot = data
    val context = LocalContext.current
    val today = DateKey.today()
    var date by remember { mutableStateOf(today) }
    var actionReminder by remember { mutableStateOf<Reminder?>(null) }
    val scrollBehavior = TopAppBarDefaults.exitUntilCollapsedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            LargeTopAppBar(
                title = { Text(dayTitle(date)) },
                navigationIcon = {
                    // 返回必须占 navigationIcon：这是 Material 3 对「推入屏」的约定，
                    // 也是这屏除了系统返回手势外唯一的退出口。早先把它让给了「前一天」，
                    // 结果顶部两个箭头全是翻日期的，用户只能靠手势退出。
                    IconButton(
                        onClick = onBack,
                        modifier = Modifier.testId("records-back")
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.nav_back)
                        )
                    }
                },
                actions = {
                    // 翻日期改到右侧：与日历 / 相册的翻页位置一致
                    IconButton(
                        onClick = { date = DateKey.addDays(date, -1) },
                        modifier = Modifier.testId("records-prev-day")
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                            contentDescription = stringResource(R.string.records_prevDay)
                        )
                    }
                    IconButton(
                        onClick = { date = DateKey.addDays(date, 1) },
                        enabled = date < today,
                        modifier = Modifier.testId("records-next-day")
                    ) {
                        Icon(
                            Icons.AutoMirrored.Filled.KeyboardArrowRight,
                            contentDescription = stringResource(R.string.records_nextDay)
                        )
                    }
                },
                scrollBehavior = scrollBehavior
            )
        }
    ) { innerPadding ->
        if (snapshot == null) {
            Column(modifier = Modifier.fillMaxSize()) {}
            return@Scaffold
        }

        val dayReminders = snapshot.reminders.filter { it.date == date }.sortedBy { it.time }
        val taken = dayReminders.count { it.status == ReminderStatus.TAKEN }
        val missed = dayReminders.count { it.status == ReminderStatus.MISSED }
        val skipped = dayReminders.count { it.status == ReminderStatus.SKIPPED }
        val rate = if (dayReminders.isNotEmpty()) taken * 100 / dayReminders.size else 0

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = innerPadding,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (dayReminders.isNotEmpty()) {
                item {
                    SectionCard {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.Bottom,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Text(
                                    text = "$rate%",
                                    style = MaterialTheme.typography.headlineLarge
                                )
                                Text(
                                    text = stringResource(R.string.records_adherence),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            LinearProgressIndicator(
                                progress = { rate / 100f },
                                modifier = Modifier.fillMaxWidth()
                            )
                            Text(
                                text = stringResource(
                                    R.string.records_summary,
                                    dayReminders.size,
                                    taken,
                                    missed,
                                    skipped
                                ),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                items(dayReminders, key = { it.id }) { reminder ->
                    val medication = snapshot.medications
                        .firstOrNull { it.id == reminder.medicationId }
                    val person = snapshot.persons.firstOrNull { it.id == reminder.personId }
                    RecordRow(
                        reminder = reminder,
                        medicationName = medication?.name
                            ?: stringResource(R.string.home_unknownMedication),
                        personName = person?.name ?: stringResource(R.string.home_unknownPerson),
                        unitLabel = medication?.let { L10n.unitLabel(context, it.unit) },
                        // 只有今天还允许改：补昨天的账会让库存与通知对不上
                        interactive = date == today,
                        onClick = { actionReminder = reminder }
                    )
                }
            } else {
                item {
                    SectionCard {
                        EmptyState(text = stringResource(R.string.records_empty))
                    }
                }
            }
        }
    }

    actionReminder?.let { reminder ->
        AlertDialog(
            onDismissRequest = { actionReminder = null },
            title = { Text(stringResource(R.string.home_reminderActions)) },
            text = { Text("${reminder.time}") },
            confirmButton = {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(
                        onClick = {
                            viewModel.skip(reminder.id)
                            actionReminder = null
                        }
                    ) { Text(stringResource(R.string.reminder_skip)) }
                    TextButton(
                        onClick = {
                            viewModel.take(reminder.id)
                            actionReminder = null
                        }
                    ) { Text(stringResource(R.string.reminder_markTaken)) }
                }
            },
            dismissButton = {
                TextButton(onClick = { actionReminder = null }) {
                    Text(stringResource(R.string.common_cancel))
                }
            }
        )
    }
}

/** 一天里的一剂：药名 + 时间 / 人 / 剂量，右侧标状态。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RecordRow(
    reminder: Reminder,
    medicationName: String,
    personName: String,
    unitLabel: String?,
    interactive: Boolean,
    onClick: () -> Unit
) {
    val statusColor = when (reminder.status) {
        ReminderStatus.TAKEN -> StatusTint.Success
        ReminderStatus.SKIPPED -> StatusTint.Neutral
        ReminderStatus.MISSED -> StatusTint.Danger
        ReminderStatus.PENDING -> MaterialTheme.colorScheme.onSurface
    }
    val amount = reminder.doseAmount.toString() + (unitLabel ?: "")
    val statusLabel = stringResource(
        when (reminder.status) {
            ReminderStatus.PENDING -> R.string.reminder_pending
            ReminderStatus.TAKEN -> R.string.reminder_taken
            ReminderStatus.SKIPPED -> R.string.reminder_skipped
            ReminderStatus.MISSED -> R.string.reminder_missed
        }
    )

    Card(
        onClick = onClick,
        enabled = interactive,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .testId("records-item-${reminder.id}"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(medicationName, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = "${reminder.time} · $personName · $amount",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                text = statusLabel,
                style = MaterialTheme.typography.labelLarge,
                color = statusColor
            )
        }
    }
}

/**
 * 日期标题跟随 App 当前语言，不硬编码语序
 * （中文「2025年9月5日 周五」vs 英文「Sep 5, 2025 Fri」）。
 *
 * 用系统的 `getBestDateTimePattern` 按 skeleton 生成格式：同一份 skeleton
 * 在各语言下由平台决定字段顺序与分隔符，比自带格式串可靠。
 */
@Composable
private fun dayTitle(key: String): String {
    val locale = LocalConfiguration.current.locales[0]
    val pattern = android.text.format.DateFormat.getBestDateTimePattern(locale, "yMMMMdEEE")
    val date = DateKey.date(key)?.atZone(ZoneId.systemDefault())?.toLocalDate()
        ?: Instant.now().atZone(ZoneId.systemDefault()).toLocalDate()
    return date.format(DateTimeFormatter.ofPattern(pattern, locale))
}
