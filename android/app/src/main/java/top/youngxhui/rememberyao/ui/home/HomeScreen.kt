package top.youngxhui.rememberyao.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Medication
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.DateKey
import top.youngxhui.rememberyao.core.domain.dueDate
import top.youngxhui.rememberyao.core.domain.isSnoozed
import top.youngxhui.rememberyao.core.domain.stockSummary
import top.youngxhui.rememberyao.core.l10n.L10n
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.Reminder
import top.youngxhui.rememberyao.core.model.ReminderStatus
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.EmptyState
import top.youngxhui.rememberyao.ui.components.ReminderCardStack
import top.youngxhui.rememberyao.ui.components.StackCardItem
import top.youngxhui.rememberyao.ui.components.StackTone
import top.youngxhui.rememberyao.ui.components.parseHexColor
import top.youngxhui.rememberyao.ui.components.takeEarliest
import top.youngxhui.rememberyao.ui.components.testId
import top.youngxhui.rememberyao.ui.theme.StatusTint

/**
 * 首页（今日）：大字日期 + 成员筛选 + 今日待处理牌堆 + 今日安排 + 药品库存。
 *
 * 视觉基准 M3 Expressive 设计稿：64dp 顶部应用栏（标题为当天日期）、
 * 22sp 区块标题、`surfaceContainerHigh` 的 28dp 圆角容器（提醒卡牌堆放在
 * 里面）、药品库存一行一味药（16sp 药名 + 8dp 轨道进度条，向右拉伸）。
 * 屏幕只读 `Store` 并派发动作，业务判断（是否漏服、还能吃几天）全在
 * `core/domain` 里。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    viewModel: AppViewModel,
    onOpenMedication: (String) -> Unit
) {
    val reminders by viewModel.reminders.collectAsStateWithLifecycle()
    val medications by viewModel.medications.collectAsStateWithLifecycle()
    val persons by viewModel.persons.collectAsStateWithLifecycle()
    val plans by viewModel.plans.collectAsStateWithLifecycle()
    val loading by viewModel.loading.collectAsStateWithLifecycle()

    // 屏幕回到前台时把别处的变更拉回来（与 iOS 端 `viewWillAppear` 里的 reload 对应）
    LaunchedEffect(Unit) { viewModel.reload() }

    var memberFilter by remember { mutableStateOf<String?>(null) }
    var actionReminder by remember { mutableStateOf<Reminder?>(null) }

    val context = LocalContext.current
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        containerColor = MaterialTheme.colorScheme.surface,
        topBar = {
            TopAppBar(
                title = { Text(todayTitle()) },
                modifier = Modifier.testId("home-top-bar"),
                scrollBehavior = scrollBehavior
            )
        }
    ) { innerPadding ->
        // 首屏加载没结束时不显示 empty 态：刚打开 App 看到一片空白会被当成坏了
        if (loading && medications.isEmpty()) {
            Column(modifier = Modifier.fillMaxSize()) {}
            return@Scaffold
        }

        val todayReminders = reminders
            .filter { it.date == DateKey.today() }
            .filter { memberFilter == null || it.personId == memberFilter }
            .sortedBy { it.time }

        // 牌堆只认 pending/missed，按成员筛选后的全集取前三张
        val stackReminders = remember(reminders, memberFilter) {
            takeEarliest(
                reminders.filter { memberFilter == null || it.personId == memberFilter },
                3
            )
        }
        // 派生数据（含词条）在屏幕层拼好，组件只负责摆 —— 与 ReminderCard 一族分工一致
        val stackItems = stackReminders.map { reminder ->
            val medication = medications.firstOrNull { it.id == reminder.medicationId }
            val person = persons.firstOrNull { it.id == reminder.personId }
            val plan = plans.firstOrNull { it.id == reminder.planId }
            val summary = medication?.let { stockSummary(it, plans) }
            val unit = medication?.let { L10n.unitLabel(context, it.unit) }
                ?: stringResource(R.string.medication_unitTablet)
            val notes = medication?.notes?.trim().orEmpty()

            val timeLabel = when {
                reminder.date == DateKey.addDays(DateKey.today(), 1) ->
                    "${stringResource(R.string.records_tomorrow)} ${reminder.time}"
                reminder.date != DateKey.today() ->
                    stringResource(
                        R.string.records_monthDayTime,
                        reminder.date.drop(5).take(2).toInt(),
                        reminder.date.takeLast(2).toInt(),
                        reminder.time
                    )
                else -> reminder.time
            }
            // 状态与列表 / 通知层同一套判定（pending 未到点 / 已过点、snoozed）
            val (stateLabel, tone) = when (reminder.status) {
                ReminderStatus.TAKEN ->
                    stringResource(R.string.reminder_taken) to StackTone.Success
                ReminderStatus.SKIPPED ->
                    stringResource(R.string.reminder_skipped) to StackTone.Neutral
                ReminderStatus.MISSED ->
                    stringResource(R.string.reminder_missed) to StackTone.Danger
                ReminderStatus.PENDING -> when {
                    reminder.isSnoozed() ->
                        stringResource(R.string.reminder_snooze) to StackTone.Primary
                    (reminder.dueDate ?: Instant.now()) > Instant.now() ->
                        stringResource(R.string.reminder_pending) to StackTone.Primary
                    else ->
                        stringResource(R.string.reminder_notTaken) to StackTone.Warning
                }
            }
            val stockLine = when {
                summary?.daysLeft != null ->
                    stringResource(R.string.records_stockDaysLeft, summary.daysLeft)
                plan?.endDate != null ->
                    stringResource(
                        R.string.records_untilDate,
                        plan.endDate.drop(5).take(2).toInt(),
                        plan.endDate.takeLast(2).toInt()
                    )
                else -> stringResource(R.string.plan_endDateUnlimited)
            }

            StackCardItem(
                reminderId = reminder.id,
                timeLabel = timeLabel,
                stateLabel = stateLabel,
                stateTone = tone,
                title = medication?.name ?: stringResource(R.string.home_unknownMedication),
                doseLine = if (notes.isEmpty()) {
                    "${reminder.doseAmount}$unit"
                } else {
                    "${reminder.doseAmount}$unit · $notes"
                },
                personName = person?.name ?: stringResource(R.string.home_unknownPerson),
                accent = person?.let { parseHexColor(it.avatarColor) }
                    ?: MaterialTheme.colorScheme.primary,
                freqLine = stringResource(R.string.plan_perDay, plan?.times?.size ?: 1),
                stockLine = stockLine,
                stockLow = summary?.low ?: false,
                late = reminder.status == ReminderStatus.MISSED
            )
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                top = innerPadding.calculateTopPadding() + 4.dp,
                bottom = innerPadding.calculateBottomPadding() + 24.dp,
                start = 16.dp,
                end = 16.dp
            ),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            if (persons.isNotEmpty()) {
                item {
                    MemberFilterRow(
                        persons = persons.map { it.id to it.name },
                        selected = memberFilter,
                        onSelect = { memberFilter = it }
                    )
                }
            }

            // MARK: 今日待处理（牌堆容器）
            item {
                SectionHeading(stringResource(R.string.today_section))
            }
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.extraLarge,
                    color = MaterialTheme.colorScheme.surfaceContainerHigh
                ) {
                    Box(modifier = Modifier.padding(12.dp)) {
                        if (stackItems.isEmpty()) {
                            EmptyState(
                                text = stringResource(R.string.empty_reminders),
                                hint = stringResource(R.string.empty_reminders_hint)
                            )
                        } else {
                            ReminderCardStack(
                                items = stackItems,
                                onTake = { viewModel.take(it) }
                            )
                        }
                    }
                }
            }

            // MARK: 今日安排（全天列表，点一条可补服 / 稍后 / 跳过）
            item {
                SectionHeading(stringResource(R.string.home_todaySchedule))
            }
            if (todayReminders.isEmpty()) {
                item {
                    EmptyState(
                        text = stringResource(R.string.home_noSchedule),
                        hint = stringResource(R.string.home_noScheduleHint)
                    )
                }
            }
            items(todayReminders, key = { it.id }) { reminder ->
                val medication = medications.firstOrNull { it.id == reminder.medicationId }
                val person = persons.firstOrNull { it.id == reminder.personId }
                ReminderCard(
                    reminder = reminder,
                    medicationName = medication?.name
                        ?: stringResource(R.string.home_unknownMedication),
                    personName = person?.name ?: stringResource(R.string.home_unknownPerson),
                    unitLabel = medication?.let { L10n.unitLabel(context, it.unit) },
                    onClick = { actionReminder = reminder }
                )
            }

            // MARK: 药品库存（一味药一行：药名 + 库存进度条）
            item {
                SectionHeading(stringResource(R.string.home_stockListTitle))
            }
            if (medications.isEmpty()) {
                item {
                    EmptyState(
                        text = stringResource(R.string.home_stockListEmpty),
                        icon = Icons.Rounded.Medication
                    )
                }
            }
            itemsIndexed(
                medications.sortedBy { it.name },
                key = { _, medication -> medication.id }
            ) { _, medication ->
                StockProgressRow(
                    medication = medication,
                    onClick = { onOpenMedication(medication.id) }
                )
            }
        }
    }

    actionReminder?.let { reminder ->
        ReminderActionsDialog(
            reminder = reminder,
            onTake = {
                viewModel.take(reminder.id)
                actionReminder = null
            },
            onSnooze = {
                viewModel.snooze(reminder.id)
                actionReminder = null
            },
            onSkip = {
                viewModel.skip(reminder.id)
                actionReminder = null
            },
            onDismiss = { actionReminder = null }
        )
    }
}

/** 区块标题：22sp（titleLargeEmphasized），靠左。 */
@Composable
private fun SectionHeading(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.onSurface,
        modifier = Modifier.padding(top = 8.dp)
    )
}

/** 成员筛选：横向一排 chip，「全部」恒在首位。人多时横向滚动，不折行。 */
@Composable
private fun MemberFilterRow(
    persons: List<Pair<String, String>>,
    selected: String?,
    onSelect: (String?) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        FilterChip(
            selected = selected == null,
            onClick = { onSelect(null) },
            label = { Text(stringResource(R.string.home_all)) }
        )
        persons.forEach { (id, name) ->
            FilterChip(
                selected = selected == id,
                onClick = { onSelect(id) },
                label = { Text(name) }
            )
        }
    }
}

/** 今日一条安排：主文本药名，辅文时间 · 用药人 · 剂量，右侧状态。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReminderCard(
    reminder: Reminder,
    medicationName: String,
    personName: String,
    unitLabel: String?,
    onClick: () -> Unit
) {
    val statusColor = when (reminder.status) {
        ReminderStatus.TAKEN -> StatusTint.Success
        ReminderStatus.SKIPPED -> StatusTint.Neutral
        ReminderStatus.MISSED -> StatusTint.Danger
        ReminderStatus.PENDING -> MaterialTheme.colorScheme.onSurface
    }
    val amount = reminder.doseAmount.toString() + (unitLabel ?: "")

    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .testId("home-reminder-${reminder.id}"),
        shape = MaterialTheme.shapes.small,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow
        )
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = medicationName,
                    style = MaterialTheme.typography.titleMedium,
                    color = statusColor
                )
                Text(
                    text = "${reminder.time} · $personName · $amount",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            StatusLabel(status = reminder.status)
        }
    }
}

/** 状态用文字标出来，不靠颜色单独承载 —— 色弱用户看不出红绿。 */
@Composable
private fun StatusLabel(status: ReminderStatus) {
    val (text, color) = when (status) {
        ReminderStatus.PENDING ->
            stringResource(R.string.reminder_pending) to MaterialTheme.colorScheme.onSurfaceVariant
        ReminderStatus.TAKEN ->
            stringResource(R.string.reminder_taken) to StatusTint.Success
        ReminderStatus.SKIPPED ->
            stringResource(R.string.reminder_skipped) to StatusTint.Neutral
        ReminderStatus.MISSED ->
            stringResource(R.string.reminder_missed) to StatusTint.Danger
    }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        if (status == ReminderStatus.TAKEN) {
            Icon(
                Icons.Rounded.Check,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(16.dp)
            )
        }
        Text(text = text, style = MaterialTheme.typography.labelLarge, color = color)
    }
}

/**
 * 药品库存一行：药名（16sp）+ 线性进度条（轨道 8dp、圆端帽，向右拉伸占满）。
 *
 * 进度 = 剩余 / 总量；告急（剩余为 0）时进度条走 error 色。整行可点进
 * 药品详情，进度条另挂一条内容描述供读屏软件播报百分比。
 */
@Composable
private fun StockProgressRow(
    medication: Medication,
    onClick: () -> Unit
) {
    val percent = if (medication.totalQuantity > 0) {
        medication.remainingQuantity * 100 / medication.totalQuantity
    } else {
        0
    }
    val fraction = if (medication.totalQuantity > 0) {
        (medication.remainingQuantity.toFloat() / medication.totalQuantity).coerceIn(0f, 1f)
    } else {
        0f
    }
    val barColor = when {
        medication.remainingQuantity <= 0 -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.primary
    }
    val stockLabel = stringResource(R.string.home_stockProgress, medication.name, percent)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp)
            .testId("home-stock-${medication.id}"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = medication.name,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        LinearProgressIndicator(
            progress = { fraction },
            modifier = Modifier
                .weight(1f)
                .height(8.dp)
                .clearAndSetSemantics { contentDescription = stockLabel },
            color = barColor,
            trackColor = MaterialTheme.colorScheme.secondaryContainer,
            strokeCap = StrokeCap.Round
        )
    }
}

/** 点一条提醒：已服用 / 稍后提醒 / 跳过。 */
@Composable
private fun ReminderActionsDialog(
    reminder: Reminder,
    onTake: () -> Unit,
    onSnooze: () -> Unit,
    onSkip: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        shape = MaterialTheme.shapes.medium,
        title = { Text(stringResource(R.string.home_reminderActions)) },
        text = { Text(reminder.time) },
        confirmButton = {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = onSnooze) { Text(stringResource(R.string.reminder_snooze)) }
                TextButton(onClick = onTake) { Text(stringResource(R.string.reminder_markTaken)) }
                TextButton(onClick = onSkip) { Text(stringResource(R.string.reminder_skip)) }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) }
        }
    )
}

/**
 * 大字日期：跟随 App 当前语言，不硬编码语序
 * （中文「9月5日」vs 英文「Sep 5」）。
 *
 * 用系统的 `getBestDateTimePattern` 按 skeleton 生成格式：同一份 skeleton
 * 在各语言下由平台决定字段顺序与分隔符，比自带格式串可靠。
 */
@Composable
private fun todayTitle(): String {
    val locale = LocalConfiguration.current.locales[0]
    val pattern = android.text.format.DateFormat.getBestDateTimePattern(locale, "MMMMd")
    val today = Instant.now().atZone(ZoneId.systemDefault()).toLocalDate()
    return today.format(DateTimeFormatter.ofPattern(pattern, locale))
}
