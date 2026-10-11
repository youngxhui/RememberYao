package top.youngxhui.rememberyao.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
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
import top.youngxhui.rememberyao.core.l10n.L10n
import top.youngxhui.rememberyao.core.model.MedicationPlan
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.Avatar
import top.youngxhui.rememberyao.ui.components.ClickableRow
import top.youngxhui.rememberyao.ui.components.ConfirmDialog
import top.youngxhui.rememberyao.ui.components.DestructiveAction
import top.youngxhui.rememberyao.ui.components.EmptyState
import top.youngxhui.rememberyao.ui.components.InfoRow
import top.youngxhui.rememberyao.ui.components.ScreenScaffold
import top.youngxhui.rememberyao.ui.components.SectionCard
import top.youngxhui.rememberyao.ui.components.testId

/**
 * 用药人详情：基础信息 + 健康信息 + 用药配置 + 编辑 / 删除。
 *
 * 从成员详情进来时用药人由入口定死，这里只提供「给这个人加配置」，
 * 不再给换人的选择器。
 */
@Composable
fun PersonDetailScreen(
    viewModel: AppViewModel,
    personId: String,
    onBack: () -> Unit,
    onEditPlan: (String) -> Unit,
    onAddPlan: () -> Unit
) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.reload() }

    val context = LocalContext.current
    var showForm by remember { mutableStateOf(false) }
    var showDelete by remember { mutableStateOf(false) }

    val snapshot = data
    val person = snapshot?.persons?.firstOrNull { it.id == personId }

    ScreenScaffold(
        title = person?.name ?: stringResource(R.string.person_listTitle),
        onBack = onBack,
        backTestId = "person-detail-back"
    ) { innerPadding ->
        if (snapshot == null || person == null) {
            EmptyState(
                text = stringResource(R.string.person_notFound),
                modifier = Modifier.padding(innerPadding)
            )
            return@ScreenScaffold
        }

        val plans = snapshot.plans.filter { it.personId == person.id }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = innerPadding,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                SectionCard(title = stringResource(R.string.person_basicInfo)) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Avatar(name = person.name, colorHex = person.avatarColor, size = 56)
                        Column {
                            Text(person.name, style = MaterialTheme.typography.titleLarge)
                            Text(
                                text = stringResource(R.string.person_planCount, plans.size),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    InfoRow(
                        label = stringResource(R.string.person_gender),
                        value = person.gender?.let { L10n.genderLabel(context, it) }
                            ?: stringResource(R.string.common_none)
                    )
                    InfoRow(
                        label = stringResource(R.string.person_age),
                        value = person.age?.toString() ?: stringResource(R.string.common_none)
                    )
                }
            }

            item {
                SectionCard(title = stringResource(R.string.person_healthInfo)) {
                    InfoRow(
                        label = stringResource(R.string.person_allergies),
                        value = person.allergies.joinToListOrNone()
                    )
                    InfoRow(
                        label = stringResource(R.string.person_underlyingConditions),
                        value = person.underlyingConditions.joinToListOrNone()
                    )
                }
            }

            item {
                SectionCard(title = stringResource(R.string.person_plans)) {
                    if (plans.isEmpty()) {
                        EmptyState(text = stringResource(R.string.medication_noPlans))
                    }
                }
            }
            items(plans, key = { it.id }) { plan ->
                PlanRow(
                    plan = plan,
                    medicationName = snapshot.medications
                        .firstOrNull { it.id == plan.medicationId }?.name
                        ?: stringResource(R.string.home_unknownMedication),
                    unitLabel = snapshot.medications
                        .firstOrNull { it.id == plan.medicationId }
                        ?.let { L10n.unitLabel(context, it.unit) }
                        .orEmpty(),
                    onClick = { onEditPlan(plan.id) }
                )
            }
            item {
                ClickableRow(
                    label = stringResource(R.string.plan_emptyAddHint),
                    labelColor = MaterialTheme.colorScheme.primary,
                    icon = Icons.Rounded.Add,
                    onClick = onAddPlan,
                    modifier = Modifier.padding(horizontal = 16.dp),
                    testId = "person-add-plan"
                )
            }

            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    TextButton(
                        onClick = { showForm = true },
                        modifier = Modifier
                            .fillMaxWidth()
                            .testId("person-edit-button")
                    ) { Text(stringResource(R.string.common_edit)) }
                    DestructiveAction(
                        text = stringResource(R.string.person_deleteButtonAlt),
                        onClick = { showDelete = true },
                        testId = "person-delete-button"
                    )
                }
            }
        }
    }

    if (showForm) {
        PersonFormScreen(
            existing = person,
            onDismiss = { showForm = false },
            onSave = { input ->
                viewModel.updatePerson(
                    personId,
                    personPatch(
                        name = input.name,
                        gender = input.gender,
                        age = input.age,
                        allergies = input.allergies,
                        conditions = input.underlyingConditions
                    )
                )
                showForm = false
            }
        )
    }

    if (showDelete) {
        ConfirmDialog(
            title = stringResource(R.string.common_confirmDelete),
            message = stringResource(R.string.person_deleteButtonAlt),
            confirmText = stringResource(R.string.common_confirmDelete),
            dismissText = stringResource(R.string.common_cancel),
            destructive = true,
            onConfirm = {
                viewModel.deletePerson(personId)
                showDelete = false
                onBack()
            },
            onDismiss = { showDelete = false }
        )
    }
}

/** 用药配置行：药名 + 每次剂量 + 时间。点进去编辑。 */
@Composable
private fun PlanRow(
    plan: MedicationPlan,
    medicationName: String,
    unitLabel: String,
    onClick: () -> Unit
) {
    val detail = stringResource(R.string.plan_perDay, plan.times.size) +
        " · " + plan.times.joinToString(" ") +
        " · " + stringResource(R.string.plan_doseForMedication, medicationName, "$plan.doseAmount$unitLabel")
    ClickableRow(
        label = medicationName,
        supporting = detail,
        onClick = onClick,
        modifier = Modifier.padding(horizontal = 16.dp),
        trailing = {
            Text(
                text = stringResource(planStatusLabel(plan)),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        testId = "person-plan-${plan.id}"
    )
}

/** 列表值：空列表显示「未填写」，否则用顿号连接。 */
@Composable
private fun List<String>.joinToListOrNone(): String {
    if (isEmpty()) return stringResource(R.string.common_none)
    return joinToString("、")
}

/** 配置展示状态 → 词条资源。 */
private fun planStatusLabel(plan: MedicationPlan): Int = when {
    !plan.enabled -> R.string.plan_statusDisabled
    plan.endDate != null && plan.endDate < top.youngxhui.rememberyao.core.domain.DateKey.today() ->
        R.string.plan_statusEnded
    else -> R.string.plan_statusActive
}
