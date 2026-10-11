package top.youngxhui.rememberyao.ui.profile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.provider.Settings as AndroidSettings
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
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
import top.youngxhui.rememberyao.BuildConfig
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.DateKey
import top.youngxhui.rememberyao.core.l10n.AppLanguage
import top.youngxhui.rememberyao.core.l10n.L10n
import top.youngxhui.rememberyao.core.l10n.LanguageStore
import top.youngxhui.rememberyao.core.model.AppData
import top.youngxhui.rememberyao.core.model.Settings
import top.youngxhui.rememberyao.ui.AppViewModel
import top.youngxhui.rememberyao.ui.components.ConnectedListItem
import top.youngxhui.rememberyao.ui.components.ScreenScaffold
import top.youngxhui.rememberyao.ui.components.TimeField
import top.youngxhui.rememberyao.ui.components.connectedListItemShape
import top.youngxhui.rememberyao.ui.components.testId
import top.youngxhui.rememberyao.ui.notificationPermissionGranted

/** 免打扰默认区间：22:00–07:00（跨零点）。 */
private const val DEFAULT_QUIET_START = "22:00"
private const val DEFAULT_QUIET_END = "07:00"

/** 稍后提醒间隔（分钟）。 */
private val SNOOZE_OPTIONS = listOf(10, 15, 30, 60)

/**
 * 设置页：通用 / 提醒 / 数据 / 关于四组。
 *
 * 视觉基准 M3 Expressive 设计稿：相连列表（3dp 间距、外侧 28dp、内侧 8dp），
 * 「语言」一行右侧是 keyboard_arrow_down，点开是暴露式下拉菜单；
 * 开关 / 取值都走行内右侧插槽。语言切换后会 `Activity.recreate()` 重新
 * attach —— locale 是在 `attachBaseContext` 里包上去的，不重建就还是旧语言。
 */
@Composable
fun SettingsScreen(
    viewModel: AppViewModel,
    onBack: () -> Unit
) {
    val data by viewModel.data.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.reload() }

    val context = LocalContext.current
    val snapshot = data

    var permissionGranted by remember { mutableStateOf(notificationPermissionGranted(context)) }
    var languageMenuOpen by remember { mutableStateOf(false) }
    var showSnooze by remember { mutableStateOf(false) }
    var showQuiet by remember { mutableStateOf(false) }
    var showPrivacy by remember { mutableStateOf(false) }

    val settings = snapshot?.settings ?: Settings.DEFAULT
    val quietOn = settings.quietStart != null && settings.quietEnd != null
    val language = remember { LanguageStore(context) }.language

    val cancel = stringResource(R.string.common_cancel)
    val done = stringResource(R.string.common_done)

    ScreenScaffold(
        title = stringResource(R.string.settings_title),
        onBack = onBack,
        backTestId = "settings-back"
    ) { innerPadding ->
        if (snapshot == null) {
            Column(modifier = Modifier.fillMaxSize()) {}
            return@ScreenScaffold
        }

        // MARK: 提醒
        val reminderRows = buildList {
            add(
                SettingsRow(
                    headline = stringResource(R.string.settings_notificationsTitle),
                    supporting = stringResource(R.string.settings_notificationsSub),
                    trailing = {
                        Switch(
                            checked = settings.notificationsEnabled,
                            onCheckedChange = { value ->
                                // 开总闸前先确认系统权限：没权限时开关是假的，
                                // 用户会以为「我开了怎么还不响」
                                if (value && !notificationPermissionGranted(context)) {
                                    permissionGranted = false
                                } else {
                                    permissionGranted = true
                                    viewModel.updateSettings { it.copy(notificationsEnabled = value) }
                                }
                            }
                        )
                    },
                    testId = "settings-notifications-switch"
                )
            )
            if (!permissionGranted) {
                add(
                    SettingsRow(
                        headline = stringResource(R.string.settings_permissionDenied),
                        onClick = {
                            // 跳系统设置的本应用通知页，让用户自己开
                            runCatching {
                                context.startActivity(
                                    Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS)
                                        .putExtra(
                                            AndroidSettings.EXTRA_APP_PACKAGE,
                                            context.packageName
                                        )
                                )
                            }
                        }
                    )
                )
            }
            add(
                SettingsRow(
                    headline = stringResource(R.string.settings_snoozeTitle),
                    supporting = stringResource(R.string.settings_snoozeSub),
                    trailing = {
                        Text(
                            text = stringResource(
                                R.string.settings_minutesValue,
                                settings.snoozeMinutes
                            ),
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    onClick = { showSnooze = true },
                    testId = "settings-snooze-row"
                )
            )
            // 免打扰收成一行：关着时显示「关闭」，点整行进对话框改时间。
            // 拆成「开关 + 时间」两行的话，开关一变行数就跳，列表会错位
            add(
                SettingsRow(
                    headline = stringResource(R.string.settings_quietTitle),
                    supporting = stringResource(R.string.settings_quietSub),
                    trailing = {
                        Text(
                            text = if (quietOn) {
                                "${settings.quietStart}–${settings.quietEnd}"
                            } else {
                                stringResource(R.string.settings_quietOff)
                            },
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    onClick = { showQuiet = true },
                    testId = "settings-quiet-row"
                )
            )
            add(
                SettingsRow(
                    headline = stringResource(R.string.settings_soundTitle),
                    supporting = stringResource(R.string.settings_soundSub),
                    trailing = {
                        Switch(
                            checked = settings.soundEnabled,
                            onCheckedChange = { value ->
                                viewModel.updateSettings { it.copy(soundEnabled = value) }
                            }
                        )
                    },
                    testId = "settings-sound-switch"
                )
            )
            add(
                SettingsRow(
                    headline = stringResource(R.string.settings_notifyMissedTitle),
                    supporting = stringResource(
                        R.string.settings_notifyMissedSub,
                        Settings.DEFAULT.missedAlertStreak
                    ),
                    trailing = {
                        Switch(
                            checked = settings.missedAlertStreak > 0,
                            onCheckedChange = { value ->
                                viewModel.updateSettings {
                                    it.copy(
                                        missedAlertStreak = if (value) {
                                            Settings.DEFAULT.missedAlertStreak
                                        } else {
                                            0
                                        }
                                    )
                                }
                            }
                        )
                    },
                    testId = "settings-missed-streak-switch"
                )
            )
        }

        // MARK: 数据 / 关于
        val dataRows = listOf(
            SettingsRow(
                headline = stringResource(R.string.settings_exportTitle),
                supporting = stringResource(R.string.settings_exportSubtitle),
                onClick = { shareReport(context, snapshot) },
                testId = "settings-export-row"
            )
        )
        val aboutRows = listOf(
            SettingsRow(
                headline = stringResource(R.string.settings_privacyTitle),
                supporting = stringResource(R.string.settings_privacySub),
                onClick = { showPrivacy = true },
                testId = "settings-privacy-row"
            ),
            SettingsRow(
                headline = stringResource(R.string.settings_version),
                supporting = BuildConfig.VERSION_NAME
            )
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                top = innerPadding.calculateTopPadding() + 4.dp,
                bottom = innerPadding.calculateBottomPadding() + 24.dp,
                start = 16.dp,
                end = 16.dp
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // MARK: 通用（语言行右侧 keyboard_arrow_down，点开暴露式下拉菜单）
            item {
                SettingsSection(title = stringResource(R.string.settings_sectionGeneral)) {
                    Box {
                        ConnectedListItem(
                            headline = stringResource(R.string.settings_language),
                            supporting = stringResource(languageLabelRes(language)),
                            shape = connectedListItemShape(0, 1),
                            trailing = {
                                Icon(
                                    imageVector = Icons.Rounded.KeyboardArrowDown,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            },
                            onClick = { languageMenuOpen = true },
                            testId = "settings-language-row"
                        )
                        DropdownMenu(
                            expanded = languageMenuOpen,
                            onDismissRequest = { languageMenuOpen = false },
                            modifier = Modifier.align(Alignment.TopEnd)
                        ) {
                            AppLanguage.entries.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(stringResource(languageLabelRes(option))) },
                                    leadingIcon = if (option == language) {
                                        { Icon(Icons.Rounded.Check, contentDescription = null) }
                                    } else {
                                        null
                                    },
                                    onClick = {
                                        LanguageStore(context).language = option
                                        languageMenuOpen = false
                                        // locale 在 attachBaseContext 里包，必须重建才生效
                                        (context as? Activity)?.recreate()
                                    }
                                )
                            }
                        }
                    }
                }
            }

            item {
                SettingsSection(title = stringResource(R.string.settings_sectionReminder)) {
                    reminderRows.forEachIndexed { index, row ->
                        ConnectedListItem(
                            headline = row.headline,
                            supporting = row.supporting,
                            shape = connectedListItemShape(index, reminderRows.size),
                            trailing = row.trailing,
                            onClick = row.onClick,
                            testId = row.testId
                        )
                    }
                }
            }

            item {
                SettingsSection(title = stringResource(R.string.settings_sectionData)) {
                    dataRows.forEachIndexed { index, row ->
                        ConnectedListItem(
                            headline = row.headline,
                            supporting = row.supporting,
                            shape = connectedListItemShape(index, dataRows.size),
                            trailing = row.trailing,
                            onClick = row.onClick,
                            testId = row.testId
                        )
                    }
                }
            }

            item {
                SettingsSection(title = stringResource(R.string.settings_sectionAbout)) {
                    aboutRows.forEachIndexed { index, row ->
                        ConnectedListItem(
                            headline = row.headline,
                            supporting = row.supporting,
                            shape = connectedListItemShape(index, aboutRows.size),
                            trailing = row.trailing,
                            onClick = row.onClick,
                            testId = row.testId
                        )
                    }
                    Text(
                        text = stringResource(R.string.settings_about_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp)
                    )
                }
            }
        }
    }

    if (showSnooze) {
        AlertDialog(
            onDismissRequest = { showSnooze = false },
            shape = MaterialTheme.shapes.medium,
            title = { Text(stringResource(R.string.settings_snoozePickerTitle)) },
            text = {
                Column {
                    SNOOZE_OPTIONS.forEach { minutes ->
                        ChoiceLine(
                            selected = minutes == settings.snoozeMinutes,
                            label = stringResource(R.string.settings_minutesValue, minutes),
                            onClick = {
                                viewModel.updateSettings { it.copy(snoozeMinutes = minutes) }
                                showSnooze = false
                            }
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showSnooze = false }) { Text(done) }
            }
        )
    }

    if (showQuiet) {
        QuietHoursDialog(
            start = settings.quietStart ?: DEFAULT_QUIET_START,
            end = settings.quietEnd ?: DEFAULT_QUIET_END,
            enabled = quietOn,
            confirmText = done,
            cancelText = cancel,
            onDismiss = { showQuiet = false },
            onConfirm = { on, start, end ->
                // 关掉时两个时间都置 null：只剩一个是 null 会被当成跨天区间算错
                viewModel.updateSettings {
                    it.copy(quietStart = if (on) start else null, quietEnd = if (on) end else null)
                }
                showQuiet = false
            }
        )
    }

    if (showPrivacy) {
        AlertDialog(
            onDismissRequest = { showPrivacy = false },
            shape = MaterialTheme.shapes.medium,
            title = { Text(stringResource(R.string.settings_privacyTitle)) },
            text = { Text(stringResource(R.string.settings_privacyBody)) },
            confirmButton = {
                TextButton(onClick = { showPrivacy = false }) { Text(done) }
            }
        )
    }
}

/** 设置页一行的展示数据：标题 + 辅助文字 + 右侧插槽 + 点击行为。 */
private class SettingsRow(
    val headline: String,
    val supporting: String? = null,
    val trailing: @Composable (() -> Unit)? = null,
    val onClick: (() -> Unit)? = null,
    val testId: String? = null
)

/** 一组相连列表项：组标题 + 3dp 间距的列表（圆角由 [connectedListItemShape] 算）。 */
@Composable
private fun SettingsSection(
    title: String,
    rows: @Composable () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 4.dp, bottom = 6.dp)
        )
        rows()
    }
}

/** 单选列表的一行：原生 `RadioButton` + 文字，整行可点。 */
@Composable
private fun ChoiceLine(
    selected: Boolean,
    label: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        RadioButton(selected = selected, onClick = null)
        Text(label)
    }
}

/** 语言选项 → 展示文案。 */
private fun languageLabelRes(language: AppLanguage): Int = when (language) {
    AppLanguage.SYSTEM -> R.string.settings_language_system
    AppLanguage.CHINESE -> R.string.settings_language_zh
    AppLanguage.ENGLISH -> R.string.settings_language_en
}

/** 免打扰时段对话框：一个总开关 + 起止两个时间。 */
@Composable
private fun QuietHoursDialog(
    start: String,
    end: String,
    enabled: Boolean,
    confirmText: String,
    cancelText: String,
    onDismiss: () -> Unit,
    onConfirm: (Boolean, String, String) -> Unit
) {
    var on by remember { mutableStateOf(enabled) }
    var startValue by remember { mutableStateOf(start) }
    var endValue by remember { mutableStateOf(end) }

    AlertDialog(
        onDismissRequest = onDismiss,
        shape = MaterialTheme.shapes.medium,
        title = { Text(stringResource(R.string.settings_quietTitle)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(R.string.settings_quietEnable),
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.weight(1f)
                    )
                    Switch(checked = on, onCheckedChange = { on = it })
                }
                TimeField(
                    label = stringResource(R.string.quiet_start),
                    value = startValue,
                    onValueChange = { startValue = it },
                    dialogTitle = stringResource(R.string.time_picker_title),
                    confirmText = confirmText,
                    cancelText = cancelText,
                    testId = "settings-quiet-start"
                )
                TimeField(
                    label = stringResource(R.string.quiet_end),
                    value = endValue,
                    onValueChange = { endValue = it },
                    dialogTitle = stringResource(R.string.time_picker_title),
                    confirmText = confirmText,
                    cancelText = cancelText,
                    testId = "settings-quiet-end"
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(on, startValue, endValue) }) { Text(confirmText) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(cancelText) } }
    )
}

/**
 * 生成一份纯文本用药报表并交给系统分享面板。
 *
 * 不引第三方依赖：用户可自行存文件、发邮件或发给自己。
 */
private fun shareReport(context: Context, snapshot: AppData) {
    val medLines = snapshot.medications.joinToString("\n") {
        "· ${it.name}  ${it.remainingQuantity}/${it.totalQuantity}"
    }
    val recentLines = snapshot.usages.takeLast(20).joinToString("\n") {
        "· ${it.takenAt.take(16).replace('T', ' ')}  ${it.personName}  ${it.medicationName}"
    }
    val header = L10n.get(context, "settings.exportHeader")
    val message = buildString {
        appendLine("$header（${DateKey.today()}）")
        appendLine()
        appendLine("[${L10n.get(context, "settings.exportMeds")}]")
        appendLine(medLines)
        appendLine()
        appendLine("[${L10n.get(context, "settings.exportRecent")}]")
        append(recentLines)
    }
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, header)
        putExtra(Intent.EXTRA_TEXT, message)
    }
    // 从 Activity context 起 chooser：SettingsScreen 挂在 Activity 下，context 就是它
    runCatching {
        context.startActivity(
            Intent.createChooser(send, L10n.get(context, "settings.exportShareTitle"))
        )
    }
}
