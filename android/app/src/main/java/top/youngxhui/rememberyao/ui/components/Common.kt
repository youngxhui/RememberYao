package top.youngxhui.rememberyao.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DateRange
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * 共享的排版基元。
 *
 * 一律由 Material 3 原生组件拼出来（Card / ListItem / OutlinedTextField /
 * AlertDialog / DatePicker / TimePicker / Surface）。唯一自造的是「分区卡片」
 * 这一层组合：把若干行收进一张圆角描边卡里，对应 iOS 的 insetGrouped 分组，
 * 而这是本项目复用最多的一个形状。
 */

/** 给可交互控件打测试标识，格式 `<屏幕>-<角色>` kebab-case。 */
fun Modifier.testId(id: String): Modifier = this.testTag(id)

/** "#rrggbb" → Color；解析不了退回主色，不让一个脏数据把整屏拖崩。 */
@Composable
fun parseHexColor(hex: String): Color {
    val fallback = MaterialTheme.colorScheme.primary
    val cleaned = hex.removePrefix("#")
    if (cleaned.length != 6) return fallback
    val value = cleaned.toLongOrNull(16) ?: return fallback
    return Color(0xFF000000L or value)
}

/**
 * 分区卡片：可选标题 + 若干行。
 *
 * M3 填充卡：`surfaceContainerLow` 底、12dp 圆角、无描边 —— 设计稿「卡片
 * 圆角克制」一档，描边留给输入框这类需要界定边界的控件。
 */
@Composable
fun SectionCard(
    modifier: Modifier = Modifier,
    title: String? = null,
    content: @Composable () -> Unit
) {
    Column(modifier = modifier.fillMaxWidth()) {
        if (title != null) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 6.dp)
            )
        }
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            shape = MaterialTheme.shapes.medium,
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceContainerLow
            )
        ) {
            Column { content() }
        }
    }
}

/** 分组内的一行：左侧标题，右侧 / 下方辅助文字。对应 iOS 的 valueCell。 */
@Composable
fun InfoRow(
    label: String,
    modifier: Modifier = Modifier,
    value: String? = null,
    labelColor: Color = MaterialTheme.colorScheme.onSurface,
    valueColor: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    icon: ImageVector? = null,
    iconTint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    trailing: @Composable (() -> Unit)? = null,
    testId: String? = null
) {
    ListItem(
        modifier = modifier.then(testId?.let { Modifier.testTag(it) } ?: Modifier),
        headlineContent = { Text(label, color = labelColor) },
        supportingContent = value?.let { { Text(it, color = valueColor) } },
        leadingContent = icon?.let {
            { Icon(it, contentDescription = null, tint = iconTint) }
        },
        trailingContent = trailing,
        colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    )
}

/** 分组内的一条可点击行。 */
@Composable
fun ClickableRow(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    labelColor: Color = MaterialTheme.colorScheme.onSurface,
    icon: ImageVector? = null,
    iconTint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    trailing: @Composable (() -> Unit)? = null,
    testId: String? = null
) {
    ListItem(
        modifier = modifier
            .then(testId?.let { Modifier.testTag(it) } ?: Modifier)
            .clickable(onClick = onClick),
        headlineContent = { Text(label, color = labelColor) },
        supportingContent = supporting?.let { { Text(it) } },
        leadingContent = icon?.let {
            { Icon(it, contentDescription = null, tint = iconTint) }
        },
        trailingContent = trailing,
        colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    )
}

/** 表单字段：标签在上、圆角描边输入盒在下（添加药品 / 添加成员 / 配置表单同一套排版）。 */
@Composable
fun LabeledField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
    readOnly: Boolean = false,
    supportingText: String? = null,
    isError: Boolean = false,
    testId: String? = null,
    trailing: @Composable (() -> Unit)? = null
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp)
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .then(testId?.let { Modifier.testTag(it) } ?: Modifier),
            placeholder = placeholder?.let { { Text(it) } },
            readOnly = readOnly,
            singleLine = singleLine,
            isError = isError,
            supportingText = supportingText?.let { { Text(it) } },
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            shape = MaterialTheme.shapes.medium,
            trailingIcon = trailing
        )
    }
}

/** 数字输入框：过滤非数字字符，空串由调用方按「未填写」处理。 */
@Composable
fun NumberField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    supportingText: String? = null,
    isError: Boolean = false,
    testId: String? = null
) {
    LabeledField(
        label = label,
        value = value,
        onValueChange = { raw -> onValueChange(raw.filter(Char::isDigit)) },
        modifier = modifier,
        placeholder = placeholder,
        keyboardType = KeyboardType.Number,
        supportingText = supportingText,
        isError = isError,
        testId = testId
    )
}

/**
 * 日期字段：整体是一颗可点的描边框，点一下弹原生 `DatePickerDialog`。
 *
 * 不用只读 `OutlinedTextField`：它的输入框会吞掉点击，要把点击透出来得再叠
 * 一层透明热区，位置还得手工对齐，反而不如直接画一颗框。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(
    label: String,
    /** "YYYY-MM-DD"；空串表示未选。 */
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    dialogTitle: String,
    confirmText: String,
    cancelText: String,
    testId: String? = null
) {
    var showDialog by remember { mutableStateOf(false) }
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp)
        )
        PickerTriggerBox(
            text = value.ifEmpty { "—" },
            onClick = { showDialog = true },
            testId = testId
        )
    }

    if (showDialog) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = parseDateMillis(value) ?: System.currentTimeMillis()
        )
        DatePickerDialog(
            onDismissRequest = { showDialog = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onValueChange(formatDateMillis(it)) }
                    showDialog = false
                }) { Text(confirmText) }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text(cancelText) }
            }
        ) {
            DatePicker(state = state, title = { Text(dialogTitle) })
        }
    }
}

/** 时间字段：同 [DateField]，弹原生 `TimePicker`。 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimeField(
    label: String,
    /** "HH:MM"；空串表示未选。 */
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    dialogTitle: String,
    confirmText: String,
    cancelText: String,
    testId: String? = null
) {
    var showDialog by remember { mutableStateOf(false) }
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp)
        )
        PickerTriggerBox(
            text = value.ifEmpty { "—" },
            onClick = { showDialog = true },
            testId = testId
        )
    }

    if (showDialog) {
        val (hour, minute) = parseTime(value)
        val state = rememberTimePickerState(initialHour = hour, initialMinute = minute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title = { Text(dialogTitle) },
            text = { TimePicker(state = state) },
            confirmButton = {
                TextButton(onClick = {
                    onValueChange("%02d:%02d".format(state.hour, state.minute))
                    showDialog = false
                }) { Text(confirmText) }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text(cancelText) }
            }
        )
    }
}

/** 日期 / 时间选择器的外框：一颗带日历图标的描边框。 */
@Composable
private fun PickerTriggerBox(
    text: String,
    onClick: () -> Unit,
    testId: String?
) {
    Surface(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .then(testId?.let { Modifier.testTag(it) } ?: Modifier),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = text,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f)
            )
            Icon(
                imageVector = Icons.Rounded.DateRange,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/** 多选 chip 行：逐个点选，选中态用主色容器 + 主色描边。 */
@Composable
fun <T> ChoiceChipRow(
    options: List<T>,
    isSelected: (T) -> Boolean,
    onToggle: (T) -> Unit,
    label: (T) -> String,
    modifier: Modifier = Modifier,
    testId: (T) -> String? = { null }
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        options.forEach { option ->
            val selected = isSelected(option)
            val id = testId(option)
            Surface(
                onClick = { onToggle(option) },
                modifier = id?.let { Modifier.testTag(it) } ?: Modifier,
                shape = MaterialTheme.shapes.small,
                color = if (selected) {
                    MaterialTheme.colorScheme.primaryContainer
                } else {
                    MaterialTheme.colorScheme.surface
                },
                border = BorderStroke(
                    1.dp,
                    if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
                )
            ) {
                Text(
                    text = label(option),
                    style = MaterialTheme.typography.labelLarge,
                    color = if (selected) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.onSurface
                    },
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                )
            }
        }
    }
}

/** 勾选行：checkbox 逐行列，项多也不会横向溢出屏外。 */
@Composable
fun CheckRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    testId: String? = null
) {
    ListItem(
        modifier = modifier
            .then(testId?.let { Modifier.testTag(it) } ?: Modifier)
            .clickable { onCheckedChange(!checked) },
        headlineContent = { Text(label) },
        supportingContent = supporting?.let { { Text(it) } },
        leadingContent = { Checkbox(checked = checked, onCheckedChange = onCheckedChange) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    )
}

/** 开关行：`Switch` 放右侧，label 在左。 */
@Composable
fun SwitchRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    testId: String? = null
) {
    ListItem(
        modifier = modifier
            .then(testId?.let { Modifier.testTag(it) } ?: Modifier)
            .clickable { onCheckedChange(!checked) },
        headlineContent = { Text(label) },
        supportingContent = supporting?.let { { Text(it) } },
        trailingContent = { Switch(checked = checked, onCheckedChange = onCheckedChange) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent)
    )
}

/** 空态。首屏加载没结束时不显示（由调用方保证）。 */
@Composable
fun EmptyState(
    text: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    icon: ImageVector? = null
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 32.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(40.dp)
            )
        }
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        if (hint != null) {
            Text(
                text = hint,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}

/** 主操作按钮：表单保存、开启孪生这类「这一屏的主要动作」。胶囊形（M3 Expressive 按钮默认）。 */
@Composable
fun PrimaryAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    testId: String? = null
) {
    Button(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .then(testId?.let { Modifier.testTag(it) } ?: Modifier),
        enabled = enabled
    ) { Text(text) }
}

/** 破坏性操作按钮：删除。 */
@Composable
fun DestructiveAction(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    testId: String? = null
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier
            .fillMaxWidth()
            .then(testId?.let { Modifier.testTag(it) } ?: Modifier),
        enabled = enabled,
        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
    ) { Text(text) }
}

/** 二次确认对话框。删除一律走这里。 */
@Composable
fun ConfirmDialog(
    title: String,
    confirmText: String,
    dismissText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    message: String? = null,
    destructive: Boolean = false
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        shape = MaterialTheme.shapes.medium,
        title = { Text(title) },
        text = message?.let { { Text(it) } },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(
                    confirmText,
                    color = if (destructive) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    }
                )
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(dismissText) } }
    )
}

/** 单个数字输入对话框：补货、开启孪生都走它。 */
@Composable
fun NumberPromptDialog(
    title: String,
    placeholder: String,
    confirmText: String,
    dismissText: String,
    onConfirm: (Int) -> Unit,
    onDismiss: () -> Unit,
    message: String? = null,
    initialValue: String = ""
) {
    var text by remember { mutableStateOf(initialValue) }
    AlertDialog(
        onDismissRequest = onDismiss,
        shape = MaterialTheme.shapes.medium,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (message != null) Text(message)
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it.filter(Char::isDigit) },
                    placeholder = { Text(placeholder) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { text.toIntOrNull()?.let(onConfirm) },
                enabled = text.toIntOrNull() != null
            ) { Text(confirmText) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(dismissText) } }
    )
}

/** 状态圆点。色弱用户靠旁边的文字补足，颜色不单独承载语义。 */
@Composable
fun StatusDot(color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(8.dp)
            .then(Modifier)
    ) {
        Surface(shape = CircleShape, color = color, content = {})
    }
}

// MARK: - M3 Expressive 列表 / 搜索 / 拆分按钮

/** 相连列表的外侧圆角（M3 Expressive 列表样式）。 */
private val ListOuterCorner = 28.dp

/** 相连列表的内侧圆角：相邻两张卡片之间只把贴着的那两个角收小。 */
private val ListInnerCorner = 8.dp

/**
 * 相连列表第 [index] 项（共 [count] 项）的形状。
 *
 * M3 Expressive 的列表样式：上下相连的列表以 3dp 间距排列，外侧圆角 28dp、
 * 相邻内侧圆角 8dp。单列一张时四角全圆。
 */
fun connectedListItemShape(index: Int, count: Int): Shape = when {
    count <= 1 -> RoundedCornerShape(ListOuterCorner)
    index == 0 -> RoundedCornerShape(
        topStart = ListOuterCorner,
        topEnd = ListOuterCorner,
        bottomEnd = ListInnerCorner,
        bottomStart = ListInnerCorner
    )
    index == count - 1 -> RoundedCornerShape(
        topStart = ListInnerCorner,
        topEnd = ListInnerCorner,
        bottomEnd = ListOuterCorner,
        bottomStart = ListOuterCorner
    )
    else -> RoundedCornerShape(ListInnerCorner)
}

/** 列表项左侧图标：24dp 图标放在 40dp 的 primaryContainer 圆里。 */
@Composable
fun LeadingIconCircle(
    icon: ImageVector,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    containerColor: Color = MaterialTheme.colorScheme.primaryContainer,
    iconTint: Color = MaterialTheme.colorScheme.onPrimaryContainer
) {
    Surface(
        modifier = modifier.size(40.dp),
        shape = CircleShape,
        color = containerColor
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = iconTint,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

/**
 * 相连列表的一项：高 72dp，左图标 + 主 / 辅两行文字 + 右插槽。
 *
 * 形状由调用方按在组内的位置给（[connectedListItemShape]）—— 同一组里
 * 首项、中间项、末项的圆角不同，组件自己不猜位置。
 */
@Composable
fun ConnectedListItem(
    headline: String,
    modifier: Modifier = Modifier,
    supporting: String? = null,
    shape: Shape = RoundedCornerShape(ListOuterCorner),
    containerColor: Color = MaterialTheme.colorScheme.surfaceContainerLow,
    headlineColor: Color = MaterialTheme.colorScheme.onSurface,
    leading: @Composable (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
    onClick: (() -> Unit)? = null,
    testId: String? = null
) {
    val rowModifier = modifier
        .fillMaxWidth()
        .heightIn(min = 72.dp)
        .then(testId?.let { Modifier.testTag(it) } ?: Modifier)
    Surface(
        onClick = onClick ?: {},
        enabled = onClick != null,
        modifier = rowModifier,
        shape = shape,
        color = containerColor
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            if (leading != null) {
                leading()
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = headline,
                    style = MaterialTheme.typography.bodyLarge,
                    color = headlineColor,
                    maxLines = 1
                )
                if (supporting != null) {
                    Text(
                        text = supporting,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }
            }
            if (trailing != null) {
                trailing()
            }
        }
    }
}

/**
 * 搜索栏：高 56dp、完全圆角、`surfaceContainerHigh` 底。
 *
 * 用标准 `TextField` 而不是需要点开的 `SearchBar`：本App一次只搜一个字段，
 * 顶部常驻输入框更直接。右侧默认是语音搜索（麦克风），有输入时换成清除。
 */
@Composable
fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    voiceSearchDescription: String? = null,
    onVoiceSearch: (() -> Unit)? = null,
    testId: String? = null
) {
    TextField(
        value = value,
        onValueChange = onValueChange,
        modifier = (testId?.let { Modifier.testTag(it) } ?: Modifier)
            .fillMaxWidth()
            .height(56.dp)
            .then(modifier),
        placeholder = { Text(placeholder) },
        leadingIcon = {
            Icon(Icons.Rounded.Search, contentDescription = null)
        },
        trailingIcon = {
            if (value.isEmpty()) {
                if (onVoiceSearch != null) {
                    IconButton(onClick = onVoiceSearch) {
                        Icon(
                            Icons.Rounded.Mic,
                            contentDescription = voiceSearchDescription
                        )
                    }
                }
            } else {
                IconButton(onClick = { onValueChange("") }) {
                    Icon(Icons.Rounded.Close, contentDescription = null)
                }
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(percent = 50),
        colors = TextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            disabledContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            errorContainerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            disabledIndicatorColor = Color.Transparent,
            errorIndicatorColor = Color.Transparent
        )
    )
}

/**
 * 拆分按钮：左段主操作 + 右段箭头开菜单（M3 Expressive SplitButton）。
 *
 * 两段间距 2dp，外侧完全圆角、相邻内侧圆角 8dp；菜单展开时箭头旋转 180°、
 * 右段收成圆形。高度沿用按钮的 M3 尺寸（这里固定 M 56dp）。
 */
@Composable
fun SplitButton(
    text: String,
    icon: ImageVector,
    onClick: () -> Unit,
    menuItems: List<SplitMenuItem>,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    height: Dp = 56.dp,
    testId: String? = null
) {
    var expanded by remember { mutableStateOf(false) }
    val rotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        label = "splitButtonArrow"
    )

    Box(modifier = modifier) {
        // 外侧圆角取高度的一半（= 胶囊端），内侧 8dp：M3 相连按钮组
        val half = height / 2
        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Button(
                onClick = onClick,
                enabled = enabled,
                modifier = Modifier
                    .height(height)
                    .then(testId?.let { Modifier.testTag(it) } ?: Modifier),
                shape = RoundedCornerShape(
                    topStart = half,
                    bottomStart = half,
                    topEnd = 8.dp,
                    bottomEnd = 8.dp
                ),
                contentPadding = PaddingValues(start = 24.dp, end = 16.dp)
            ) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(24.dp))
                Text(
                    text = text,
                    modifier = Modifier.padding(start = 8.dp),
                    maxLines = 1
                )
            }
            Button(
                onClick = { expanded = true },
                enabled = enabled,
                modifier = Modifier
                    .height(height)
                    .width(height),
                shape = if (expanded) {
                    CircleShape
                } else {
                    RoundedCornerShape(
                        topStart = 8.dp,
                        bottomStart = 8.dp,
                        topEnd = half,
                        bottomEnd = half
                    )
                },
                contentPadding = PaddingValues(0.dp)
            ) {
                Icon(
                    imageVector = Icons.Rounded.ArrowDropDown,
                    contentDescription = null,
                    modifier = Modifier
                        .size(24.dp)
                        .rotate(rotation)
                )
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            menuItems.forEach { item ->
                DropdownMenuItem(
                    text = { Text(item.label) },
                    onClick = {
                        expanded = false
                        item.onClick()
                    }
                )
            }
        }
    }
}

/** 拆分按钮菜单的一项。 */
data class SplitMenuItem(val label: String, val onClick: () -> Unit)

/** 头像：圆形底 + 姓名首字。成员列表与详情共用。 */
@Composable
fun Avatar(name: String, colorHex: String, size: Int = 44) {
    Surface(
        modifier = Modifier.size(size.dp),
        shape = CircleShape,
        color = parseHexColor(colorHex)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = name.take(1),
                style = MaterialTheme.typography.titleMedium,
                color = Color.White
            )
        }
    }
}

// MARK: - 日期时间工具

/** "YYYY-MM-DD" → UTC 毫秒；空串或非法返回 null。 */
internal fun parseDateMillis(key: String): Long? {
    if (key.length != 10) return null
    return try {
        java.time.LocalDate.parse(key)
            .atStartOfDay(java.time.ZoneOffset.UTC)
            .toInstant()
            .toEpochMilli()
    } catch (_: Exception) {
        null
    }
}

/** UTC 毫秒 → "YYYY-MM-DD"。 */
internal fun formatDateMillis(millis: Long): String =
    java.time.Instant.ofEpochMilli(millis)
        .atZone(java.time.ZoneOffset.UTC)
        .toLocalDate()
        .toString()

/** "HH:MM" → (hour, minute)；非法回落 09:00。 */
internal fun parseTime(value: String): Pair<Int, Int> {
    val parts = value.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull()?.coerceIn(0, 23) ?: 9
    val m = parts.getOrNull(1)?.toIntOrNull()?.coerceIn(0, 59) ?: 0
    return h to m
}
