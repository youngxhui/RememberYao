package top.youngxhui.rememberyao.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.DateRange
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.DateKey
import top.youngxhui.rememberyao.core.domain.missedStreaks
import top.youngxhui.rememberyao.core.domain.weekStats
import top.youngxhui.rememberyao.core.l10n.L10n
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.ArchiveEntry
import top.youngxhui.rememberyao.ui.components.ArchiveRow
import top.youngxhui.rememberyao.ui.components.ClickableRow
import top.youngxhui.rememberyao.ui.components.ConnectedListItem
import top.youngxhui.rememberyao.ui.components.EmptyState
import top.youngxhui.rememberyao.ui.components.LeadingIconCircle
import top.youngxhui.rememberyao.ui.components.MiniArchive
import top.youngxhui.rememberyao.ui.components.SectionCard
import top.youngxhui.rememberyao.ui.components.connectedListItemShape
import top.youngxhui.rememberyao.ui.components.testId

/**
 * 我的：本周概览 + 家庭成员 + 菜单（服药记录 / 设置）。
 *
 * 视觉基准 M3 Expressive 设计稿：顶部应用栏右侧 settings 图标按钮；
 * primary 底 28dp 圆角的概览大卡（里面叠 surfaceContainerHigh 的统计小格）；
 * 「家庭成员」标题与「添加」填充按钮（S 号 40dp 高、拉伸占满剩余宽度）
 * 同一行；成员走 72dp 相连列表（person 图标 + 姓名 + 配置数 + chevron）。
 * 屏幕只读快照并派发动作。
 *
 * 顶部通栏是 Mini Archive 收藏夹：每味药一张说明书，水平滚动与列表的垂直
 * 滚动方向正交，作为列表第一项不抢手势。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    viewModel: AppViewModel,
    onOpenRecords: () -> Unit,
    onOpenSettings: () -> Unit,
    onOpenPersons: () -> Unit,
    onOpenPerson: (String) -> Unit,
    onOpenMedication: (String) -> Unit
) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.reload() }

    val snapshot = data
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        containerColor = MaterialTheme.colorScheme.surface,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.profile_title)) },
                actions = {
                    IconButton(
                        onClick = onOpenSettings,
                        modifier = Modifier.testId("profile-settings-button")
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Settings,
                            contentDescription = stringResource(R.string.settings_title)
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

        val today = DateKey.today()
        val weekStart = DateKey.weekStart(today)
        val stats = weekStats(snapshot.reminders, weekStart, today)
        val watched = missedStreaks(snapshot.reminders, snapshot.settings.missedAlertStreak)
        val plansByPerson = snapshot.plans.groupBy { it.personId }

        // 说明书条目在屏幕层拼好（含词条），组件只负责摆 —— 与 ReminderCard
        // 一族「派生数据在屏幕」的分工一致。只展示 store 里真实存在的字段。
        val context = LocalContext.current
        val archiveEntries = snapshot.medications.map { medication ->
            val unit = L10n.unitLabel(context, medication.unit)
            val notes = medication.notes.trim()
            ArchiveEntry(
                id = medication.id,
                name = medication.name,
                rows = listOf(
                    ArchiveRow(
                        stringResource(R.string.medication_totalQuantity),
                        "${medication.totalQuantity} $unit"
                    ),
                    ArchiveRow(
                        stringResource(R.string.medication_remaining),
                        "${medication.remainingQuantity} $unit"
                    ),
                    ArchiveRow(
                        stringResource(R.string.medication_packaging),
                        L10n.typeLabel(context, medication.type)
                    ),
                    ArchiveRow(
                        stringResource(R.string.medication_notes),
                        notes.ifEmpty { stringResource(R.string.common_none) }
                    )
                ),
                subtitle = stringResource(R.string.medication_archiveReadMe),
                footer = stringResource(
                    R.string.medication_archiveCreatedAt,
                    medication.createdAt.take(10)
                )
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
            // MARK: Mini Archive 收藏夹（每味药一张说明书，横向滚动与列表正交）
            item {
                MiniArchive(
                    entries = archiveEntries,
                    onSelectEntry = { onOpenMedication(it.id) },
                    modifier = Modifier.testId("profile-mini-archive")
                )
            }

            // MARK: 本周概览（primary 大卡 + 统计小格）
            item {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = MaterialTheme.shapes.extraLarge,
                    color = MaterialTheme.colorScheme.primary
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.profile_weekOverview),
                            style = MaterialTheme.typography.titleLarge,
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                        Text(
                            text = stringResource(
                                R.string.profile_plannedCount,
                                stats.planned
                            ),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            StatBox(
                                value = "${stats.adherence}%",
                                label = stringResource(R.string.profile_adherence),
                                modifier = Modifier.weight(1f)
                            )
                            StatBox(
                                value = "${stats.taken}",
                                label = stringResource(R.string.profile_onTime),
                                modifier = Modifier.weight(1f)
                            )
                            StatBox(
                                value = "${stats.missed}",
                                label = stringResource(R.string.profile_missed),
                                modifier = Modifier.weight(1f),
                                accent = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }
            }

            // MARK: 家庭成员（标题 + 添加按钮同一行，按钮拉伸占满剩余宽度）
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = stringResource(R.string.family_title),
                        style = MaterialTheme.typography.titleLarge,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Button(
                        onClick = onOpenPersons,
                        modifier = Modifier
                            .weight(1f)
                            .height(40.dp)
                            .testId("profile-add-member-button"),
                        contentPadding = ButtonDefaults.ContentPadding
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Add,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = stringResource(R.string.common_add),
                            modifier = Modifier.padding(start = 8.dp),
                            maxLines = 1
                        )
                    }
                }
            }

            if (snapshot.persons.isEmpty()) {
                item {
                    EmptyState(
                        text = stringResource(R.string.profile_emptyFamily),
                        icon = Icons.Rounded.Person
                    )
                }
            }

            itemsIndexed(
                snapshot.persons,
                key = { _, person -> person.id }
            ) { index, person ->
                PersonListItem(
                    person = person,
                    planCount = plansByPerson[person.id]?.size ?: 0,
                    watched = person.id in watched,
                    shape = connectedListItemShape(index, snapshot.persons.size),
                    onClick = { onOpenPerson(person.id) }
                )
            }

            // MARK: 菜单
            item {
                SectionCard {
                    ClickableRow(
                        label = stringResource(R.string.records_title),
                        icon = Icons.Rounded.DateRange,
                        onClick = onOpenRecords,
                        testId = "profile-records"
                    )
                    ClickableRow(
                        label = stringResource(R.string.settings_title),
                        icon = Icons.Rounded.Settings,
                        onClick = onOpenSettings,
                        testId = "profile-settings"
                    )
                }
            }
        }
    }
}

/** 统计小格：大数字 + 标签，叠在概览大卡里。 */
@Composable
private fun StatBox(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    accent: Color = MaterialTheme.colorScheme.onSurface
) {
    Surface(
        modifier = modifier.heightIn(min = 100.dp),
        shape = MaterialTheme.shapes.extraLarge,
        color = MaterialTheme.colorScheme.surfaceContainerHigh
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp, horizontal = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.headlineMedium,
                color = accent,
                textAlign = TextAlign.Center
            )
            Text(
                text = label,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}

/** 家庭成员一项：person 图标 + 姓名 + 配置数 + chevron；连续漏服的姓名转红。 */
@Composable
private fun PersonListItem(
    person: Person,
    planCount: Int,
    watched: Boolean,
    shape: Shape,
    onClick: () -> Unit
) {
    ConnectedListItem(
        headline = person.name,
        supporting = stringResource(R.string.person_planCount, planCount),
        shape = shape,
        headlineColor = if (watched) {
            MaterialTheme.colorScheme.error
        } else {
            MaterialTheme.colorScheme.onSurface
        },
        leading = { LeadingIconCircle(Icons.Rounded.Person) },
        trailing = {
            Icon(
                imageVector = Icons.Rounded.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        onClick = onClick,
        testId = "profile-person-${person.id}"
    )
}
