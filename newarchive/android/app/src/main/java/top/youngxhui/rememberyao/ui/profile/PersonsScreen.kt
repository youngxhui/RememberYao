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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.pickAvatarColor
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.Avatar
import top.youngxhui.rememberyao.ui.components.EmptyState
import top.youngxhui.rememberyao.ui.components.ScreenScaffold
import top.youngxhui.rememberyao.ui.components.testId

/**
 * 家庭成员列表：头像 + 姓名 + 用药配置数。
 *
 * 新增成员走 `PersonFormScreen`（同文件底部）：一个名字必填、其余可选的表单。
 */
@Composable
fun PersonsScreen(
    viewModel: AppViewModel,
    onBack: () -> Unit,
    onOpenPerson: (String) -> Unit
) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.reload() }

    val snapshot = data
    var showForm by remember { mutableStateOf(false) }

    ScreenScaffold(
        title = stringResource(R.string.person_listTitle),
        onBack = onBack,
        backTestId = "persons-back",
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { showForm = true },
                icon = { Icon(Icons.Rounded.Add, contentDescription = null) },
                text = { Text(stringResource(R.string.person_addMemberButton)) },
                modifier = Modifier.testId("person-add-button")
            )
        }
    ) { innerPadding ->
        if (snapshot == null) {
            Column(modifier = Modifier.fillMaxSize()) {}
            return@ScreenScaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = innerPadding,
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            if (snapshot.persons.isEmpty()) {
                item {
                    EmptyState(
                        text = stringResource(R.string.profile_emptyFamily),
                        hint = stringResource(R.string.person_planCount, 0)
                    )
                }
            }
            items(snapshot.persons, key = { it.id }) { person ->
                val planCount = snapshot.plans.count { it.personId == person.id }
                PersonRow(
                    person = person,
                    planCount = planCount,
                    onClick = { onOpenPerson(person.id) }
                )
            }
        }
    }

    if (showForm) {
        PersonFormScreen(
            existing = null,
            onDismiss = { showForm = false },
            onSave = { input ->
                viewModel.addPerson(input)
                showForm = false
            }
        )
    }
}

/** 成员行：头像 + 姓名，右侧配置数。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PersonRow(
    person: Person,
    planCount: Int,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .testId("person-item-${person.id}"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Avatar(
                name = person.name,
                colorHex = person.avatarColor.ifBlank { pickAvatarColor(person.name) }
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(person.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    text = stringResource(R.string.person_planCount, planCount),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
