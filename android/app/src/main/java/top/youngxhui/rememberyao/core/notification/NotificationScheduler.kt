package top.youngxhui.rememberyao.core.notification

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import top.youngxhui.rememberyao.MainActivity
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.domain.Clock
import top.youngxhui.rememberyao.core.domain.Store
import top.youngxhui.rememberyao.core.domain.dueDate
import top.youngxhui.rememberyao.core.domain.inQuietHours
import top.youngxhui.rememberyao.core.domain.missDate
import top.youngxhui.rememberyao.core.domain.missedStreaks
import top.youngxhui.rememberyao.core.l10n.L10n
import top.youngxhui.rememberyao.core.l10n.LanguageStore
import top.youngxhui.rememberyao.core.model.AppData
import top.youngxhui.rememberyao.core.model.Iso8601
import top.youngxhui.rememberyao.core.model.ReminderStatus

/**
 * 本地通知调度。
 *
 * 与领域规格第 5 节逐条对齐：
 * - 每次重排先取消全部已调度通知，再逐条重排
 * - 总开关关闭时只清空不调度
 * - 触发时间 = max(计划时间 or 宽限期结束, 稍后提醒时刻)
 * - 免打扰只压声音，不压通知本身 —— 漏服是安全相关的事
 * - 连续漏服达到阈值的成员补发一条即时通知，且只在连击重新攒起来时再响
 *
 * 串行执行：连续的数据变更会合并为几次重排，不会并发取消 / 调度。
 */
@Singleton
class NotificationScheduler @Inject constructor(
    @ApplicationContext private val context: Context,
    private val languageStore: LanguageStore
) {
    private val alarmManager: AlarmManager = context.getSystemService(AlarmManager::class.java)
    private val notificationManager: NotificationManager =
        context.getSystemService(NotificationManager::class.java)

    /** 上一轮同步时已提醒过的「连续漏服」成员，避免每次重排都重复弹一条。 */
    private val alertedStreaks = mutableSetOf<String>()

    /** 已排定的提醒 id，用于精确取消。 */
    private val scheduledIds = mutableSetOf<String>()

    private val resyncMutex = Mutex()

    // MARK: - 初始化

    /**
     * 建通知渠道。语言切换后也要重跑一次 —— 渠道名是系统设置里给用户看的，
     * 停在旧语言会很违和。
     *
     * 分「有声」与「静音」两条渠道而不是在通知上覆盖声音：API 26 起声音与震动
     * 由渠道承载，`Notification.Builder.setSound` 那一套已废弃且对渠道无效。
     * 免打扰 / 关掉声音都改走静音渠道。
     */
    fun createChannel() {
        val name = L10n.get(context, "notification.channelName")
        notificationManager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_HIGH).apply {
                description = name
                enableVibration(true)
                setShowBadge(true)
            }
        )
        val silentName = L10n.get(context, "notification.channelSilent")
        notificationManager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID_SILENT, silentName, NotificationManager.IMPORTANCE_LOW)
                .apply {
                    description = silentName
                    enableVibration(false)
                    setShowBadge(true)
                }
        )
    }

    /** 语言切换后重注册通知栏文案（渠道名 + 按钮标题）。 */
    fun registerLocalizedTexts() {
        createChannel()
    }

    /** 当前是否已获得通知权限。 */
    fun isAuthorized(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        } else {
            notificationManager.areNotificationsEnabled()
        }

    /** 是否可以排精确闹钟（用户在系统设置里关掉时需要退回普通调度）。 */
    fun canScheduleExactAlarms(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }

    // MARK: - 重排

    /** 按当前数据重排全部未来的提醒通知；串行执行。 */
    suspend fun resync(data: AppData) {
        resyncMutex.withLock {
            rescheduleReminders(data)
            notifyMissedStreaks(data)
        }
    }

    private fun cancelAllScheduled() {
        for (id in scheduledIds) {
            alarmManager.cancel(
                PendingIntent.getBroadcast(
                    context,
                    id.hashCode(),
                    Intent(context, ReminderAlarmReceiver::class.java)
                        .setAction(ACTION_FIRE)
                        .putExtra(EXTRA_REMINDER_ID, id),
                    PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
                ) ?: continue
            )
        }
        scheduledIds.clear()
        notificationManager.cancelAll()
    }

    private fun rescheduleReminders(data: AppData) {
        cancelAllScheduled()
        // 总开关关掉就到此为止：清空已排的，未来的也不再排。
        // 这里必须 return，否则会顺手把静音 / 免打扰的判断也跳过了
        if (!data.settings.notificationsEnabled) return

        val now = Instant.now()
        val medications = data.medications.associateBy { it.id }
        val persons = data.persons.associateBy { it.id }

        for (reminder in data.reminders) {
            if (reminder.status != ReminderStatus.PENDING) continue
            val due = reminder.dueDate ?: continue
            val miss = reminder.missDate ?: continue
            val snoozed = Iso8601.parse(reminder.snoozedUntil) ?: Instant.EPOCH
            val base = if (due > now) due else miss
            val at = if (snoozed > now) maxOf(base, snoozed) else base
            if (!at.isAfter(now)) continue

            val overdue = due <= now
            val medication = medications[reminder.medicationId]
            val person = persons[reminder.personId]
            // 免打扰只压掉声音，不压掉通知本身
            val silent = !data.settings.soundEnabled ||
                inQuietHours(data.settings, Clock.time(at))
            val amount = reminder.doseAmount.toString() +
                (medication?.let { L10n.unitLabel(context, it.unit) } ?: "")

            val title = L10n.get(
                context,
                if (overdue) "notification.titleOverdue" else "notification.title"
            )
            val body = L10n.format(
                context,
                "notification.body",
                person?.name ?: L10n.get(context, "notification.defaultPerson"),
                medication?.name ?: L10n.get(context, "notification.defaultMedication"),
                amount
            )
            schedule(at, reminder.id, silent, title, body)
        }
    }

    /** 静音（免打扰 / 关掉声音）走静音渠道。 */
    private fun channelId(silent: Boolean): String =
        if (silent) CHANNEL_ID_SILENT else CHANNEL_ID

    private fun schedule(
        at: Instant,
        reminderId: String,
        silent: Boolean,
        title: String,
        body: String
    ) {
        val triggerAtMillis = at.toEpochMilli()
        val requestCode = reminderId.hashCode()

        val launchIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            requestCode,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val views = RemoteViews(context.packageName, R.layout.notification_reminder).apply {
            setTextViewText(R.id.notification_title, title)
            setTextViewText(R.id.notification_body, body)
            setTextViewText(
                R.id.notification_action_taken,
                L10n.get(context, "notification.actionTaken")
            )
            setTextViewText(
                R.id.notification_action_skip,
                L10n.get(context, "notification.actionSkip")
            )
            setOnClickPendingIntent(
                R.id.notification_action_taken,
                actionPendingIntent(reminderId, ACTION_TAKEN)
            )
            setOnClickPendingIntent(
                R.id.notification_action_skip,
                actionPendingIntent(reminderId, ACTION_SKIP)
            )
        }

        val builder = Notification.Builder(context, channelId(silent))
            .setSmallIcon(R.drawable.ic_stat_reminder)
            .setContentTitle(title)
            .setContentText(body)
            .setCustomContentView(views)
            .setCustomBigContentView(views)
            .setContentIntent(contentIntent)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_ALARM)
            .setWhen(triggerAtMillis)
            .setShowWhen(true)

        val alarmIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            Intent(context, ReminderAlarmReceiver::class.java)
                .setAction(ACTION_FIRE)
                .putExtra(EXTRA_REMINDER_ID, reminderId)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_BODY, body),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        // Android 优先精确闹钟（漏服是安全相关的事，不能容忍 Doze 推迟），
        // 用户在系统里关掉精确闹钟权限时退回普通调度
        if (canScheduleExactAlarms()) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAtMillis,
                alarmIntent
            )
        } else {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerAtMillis,
                alarmIntent
            )
        }
        scheduledIds.add(reminderId)
    }

    private fun actionPendingIntent(reminderId: String, action: String): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            ("$action|$reminderId").hashCode(),
            Intent(context, ReminderActionReceiver::class.java)
                .setAction(action)
                .putExtra(EXTRA_REMINDER_ID, reminderId),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    /**
     * 补一条「某人连续漏服」的即时通知。
     *
     * 与常规提醒分开：它不挂在某个具体剂量上，而是在重排时发现成员的漏服连击
     * 达到阈值就立刻发一次。用 [alertedStreaks] 记住已提醒的人，只有当连击
     * 「重新攒起来」时才会再响，避免每次重排都刷屏。
     */
    private fun notifyMissedStreaks(data: AppData) {
        val settings = data.settings
        // 阈值关掉时清空记忆，用户重新打开后不会收到一串补发的提醒
        if (settings.missedAlertStreak <= 0) {
            alertedStreaks.clear()
            return
        }
        if (!settings.notificationsEnabled) return

        val streaks = missedStreaks(data.reminders, settings.missedAlertStreak)
        // 本轮不再命中的成员（用户已经处理完了）从记忆里移除，
        // 这样下次重新攒够会正常再提醒
        alertedStreaks.retainAll(streaks)

        val fresh = streaks - alertedStreaks.toSet()
        if (fresh.isEmpty()) return
        alertedStreaks.addAll(streaks)

        val names = fresh.mapNotNull { id ->
            data.persons.firstOrNull { it.id == id }?.name
        }
        if (names.isEmpty()) return

        val title = L10n.get(context, "notification.missedStreakTitle")
        val body = L10n.format(
            context,
            "notification.missedStreakBody",
            names.joinToString(L10n.listSeparator(languageStore.language)),
            settings.missedAlertStreak
        )
        val builder = Notification.Builder(context, channelId(!settings.soundEnabled))
            .setSmallIcon(R.drawable.ic_stat_reminder)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER)
        notificationManager.notify(MISSED_STREAK_NOTIFICATION_ID, builder.build())
    }

    companion object {
        const val CHANNEL_ID = "medication-reminder"
        const val CHANNEL_ID_SILENT = "medication-reminder-silent"
        const val ACTION_TAKEN = "top.youngxhui.rememberyao.action.TAKEN"
        const val ACTION_SKIP = "top.youngxhui.rememberyao.action.SKIP"
        const val ACTION_FIRE = "top.youngxhui.rememberyao.action.FIRE"
        const val EXTRA_REMINDER_ID = "reminderId"
        const val EXTRA_TITLE = "title"
        const val EXTRA_BODY = "body"
        const val MISSED_STREAK_NOTIFICATION_ID = 9001
    }
}

/** 到点发通知。文案在排程时算好随 intent 带上，避免接收方再查一次库。 */
class ReminderAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != NotificationScheduler.ACTION_FIRE) return
        val title = intent.getStringExtra(NotificationScheduler.EXTRA_TITLE) ?: return
        val body = intent.getStringExtra(NotificationScheduler.EXTRA_BODY) ?: return
        val notification = Notification.Builder(context, NotificationScheduler.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_reminder)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_ALARM)
            .build()
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.notify(title.hashCode(), notification)
    }
}

/**
 * 通知栏「已服用 / 跳过」按钮。
 *
 * 点击后直接落库并重排通知，不需要打开 App —— 吃药这件事常常手里正拿着东西。
 */
@AndroidEntryPoint
class ReminderActionReceiver : BroadcastReceiver() {

    @Inject
    lateinit var store: Store

    @Inject
    lateinit var notifications: NotificationScheduler

    override fun onReceive(context: Context, intent: Intent) {
        val reminderId = intent.getStringExtra(NotificationScheduler.EXTRA_REMINDER_ID) ?: return
        val action = intent.action ?: return
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                when (action) {
                    NotificationScheduler.ACTION_TAKEN -> store.take(reminderId)
                    NotificationScheduler.ACTION_SKIP -> store.skip(reminderId)
                }
                notifications.resync(store.current)
            } finally {
                pendingResult.finish()
            }
        }
    }
}

/** 开机 / 升级后重排通知：闹钟不跨重启保留。 */
@AndroidEntryPoint
class BootReceiver : BroadcastReceiver() {

    @Inject
    lateinit var store: Store

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.Default).launch {
            try {
                store.load()
            } finally {
                pendingResult.finish()
            }
        }
    }
}
