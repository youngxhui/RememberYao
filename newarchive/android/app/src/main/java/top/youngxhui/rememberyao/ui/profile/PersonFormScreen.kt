package top.youngxhui.rememberyao.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.PersonInput
import top.youngxhui.rememberyao.core.model.Gender
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.ui.components.LabeledField
import top.youngxhui.rememberyao.ui.components.NumberField
import top.youngxhui.rememberyao.ui.components.testId

/**
 * 添加 / 编辑用药人。
 *
 * 名字必填，性别 / 年龄 / 过敏原 / 基础病都可选 —— 家庭场景里「先记下来」
 * 比「填完整」重要。用原生 `AlertDialog` 承载而不是另起一屏：字段就五个，
 * 起一屏反而让列表空掉。
 */
@Composable
fun PersonFormScreen(
    existing: Person?,
    onDismiss: () -> Unit,
    onSave: (PersonInput) -> Unit
) {
    var name by remember { mutableStateOf(existing?.name ?: "") }
    var gender by remember { mutableStateOf(existing?.gender) }
    var age by remember { mutableStateOf(existing?.age?.toString() ?: "") }
    var allergies by remember { mutableStateOf(existing?.allergies?.joinToString("、") ?: "") }
    var conditions by remember {
        mutableStateOf(existing?.underlyingConditions?.joinToString("、") ?: "")
    }
    var filled by remember { mutableStateOf(existing != null) }

    // 编辑态回填一次：existing 异步到达，用 filled 防止用户改到一半被覆盖
    LaunchedEffect(existing?.id) {
        if (existing != null && !filled) {
            filled = true
            name = existing.name
            gender = existing.gender
            age = existing.age?.toString() ?: ""
            allergies = existing.allergies.joinToString("、")
            conditions = existing.underlyingConditions.joinToString("、")
        }
    }

    val valid = name.isNotBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                stringResource(
                    if (existing != null) R.string.common_edit else R.string.person_addMember
                )
            )
        },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                LabeledField(
                    label = stringResource(R.string.person_name),
                    value = name,
                    onValueChange = { name = it },
                    placeholder = stringResource(R.string.person_nameInputPlaceholder),
                    supportingText = if (valid) {
                        null
                    } else {
                        stringResource(R.string.person_nameRequired)
                    },
                    isError = !valid,
                    testId = "person-name-input"
                )

                Text(
                    text = stringResource(R.string.person_gender),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                // 四段（未填写 / 男 / 女 / 其他）在对话框里横向吃紧，
                // 套一层横向滚动：系统大字号下挤不下时能滑，不会把文字截断。
                // 这里不能写 fillMaxWidth —— 横向滚动容器给的是无限宽，
                // 段按钮要按内容自身宽度排布才滚得动
                Row(modifier = Modifier.horizontalScroll(rememberScrollState())) {
                    SingleChoiceSegmentedButtonRow {
                        val options = listOf<Gender?>(null) + Gender.entries
                        options.forEachIndexed { index, option ->
                            SegmentedButton(
                                selected = gender == option,
                                onClick = { gender = option },
                                shape = SegmentedButtonDefaults.itemShape(
                                    index = index,
                                    count = options.size
                                ),
                                modifier = Modifier.testId(
                                    "person-gender-${option?.name ?: "none"}"
                                )
                            ) {
                                Text(
                                    stringResource(
                                        when (option) {
                                            Gender.MALE -> R.string.person_genderMale
                                            Gender.FEMALE -> R.string.person_genderFemale
                                            Gender.OTHER -> R.string.person_genderOther
                                            null -> R.string.common_none
                                        }
                                    )
                                )
                            }
                        }
                    }
                }

                NumberField(
                    label = stringResource(R.string.person_age),
                    value = age,
                    onValueChange = { age = it },
                    placeholder = stringResource(R.string.person_agePlaceholder),
                    testId = "person-age-input"
                )

                LabeledField(
                    label = stringResource(R.string.person_allergies),
                    value = allergies,
                    onValueChange = { allergies = it },
                    placeholder = stringResource(R.string.person_allergiesPlaceholder),
                    supportingText = stringResource(R.string.person_optionalHint),
                    testId = "person-allergies-input"
                )

                LabeledField(
                    label = stringResource(R.string.person_underlyingConditions),
                    value = conditions,
                    onValueChange = { conditions = it },
                    placeholder = stringResource(R.string.person_conditionsPlaceholder),
                    supportingText = stringResource(R.string.person_optionalHint),
                    testId = "person-conditions-input"
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(
                        PersonInput(
                            name = name.trim(),
                            gender = gender,
                            age = age.toIntOrNull(),
                            allergies = splitList(allergies),
                            underlyingConditions = splitList(conditions)
                        )
                    )
                },
                enabled = valid,
                modifier = Modifier.testId("person-save-button")
            ) { Text(stringResource(R.string.action_save)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) }
        }
    )
}

/**
 * 顿号 / 逗号 / 换行分隔的自由文本 → 列表。
 *
 * 表单里让用户一次输入多项比反复点「加一项」快，分隔符三种都认，
 * 空段丢掉。
 */
internal fun splitList(raw: String): List<String> =
    raw.split("、", ",", "，", "\n")
        .map { it.trim() }
        .filter { it.isNotEmpty() }

/** 把表单收集到的值翻译成 `Person -> Person` 的 patch（编辑成员用）。 */
internal fun personPatch(
    name: String,
    gender: Gender?,
    age: Int?,
    allergies: List<String>,
    conditions: List<String>
): (Person) -> Person = { person ->
    person.copy(
        name = name.trim(),
        gender = gender,
        age = age,
        allergies = allergies,
        underlyingConditions = conditions
    )
}
