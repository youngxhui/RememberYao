package top.youngxhui.rememberyao

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import top.youngxhui.rememberyao.core.domain.Store
import top.youngxhui.rememberyao.core.notification.NotificationScheduler

/**
 * 应用入口。
 *
 * 冷启动在这里做两件只需一次的事：建通知渠道、载入数据并重排通知。
 * 后者不能省 —— 闹钟不跨重启保留，上次排的提醒在装机后已经失效。
 */
@HiltAndroidApp
class RememberYaoApplication : Application() {

    @Inject
    lateinit var store: Store

    @Inject
    lateinit var scheduler: NotificationScheduler

    override fun onCreate() {
        super.onCreate()
        scheduler.createChannel()
        // 用 application 作用域的协程：不跟着任何屏幕生命周期取消
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            store.load()
        }
    }
}
