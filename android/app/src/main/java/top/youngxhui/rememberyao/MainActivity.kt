package top.youngxhui.rememberyao

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject
import top.youngxhui.rememberyao.core.domain.Repository
import top.youngxhui.rememberyao.core.l10n.LanguageStore
import top.youngxhui.rememberyao.core.l10n.LocaleManager
import top.youngxhui.rememberyao.core.notification.NotificationScheduler
import top.youngxhui.rememberyao.ui.RememberYaoApp
import top.youngxhui.rememberyao.ui.theme.RememberYaoTheme

/**
 * 唯一的 Activity（单 Activity 架构）：页面切换全交给 Navigation Compose。
 *
 * locale 在 [attachBaseContext] 里包 —— 这是唯一能赶在资源加载前换掉语言的时机，
 * `onCreate` 里再改就晚了。切换语言由设置页写偏好后 `recreate()` 完成。
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var scheduler: NotificationScheduler

    @Inject
    lateinit var store: Repository

    @Inject
    lateinit var languageStore: LanguageStore

    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(LocaleManager.wrap(newBase))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // 语言切换走 recreate()，Application.onCreate 不会再跑：
        // 渠道名是系统设置里给用户看的，停在上一种语言会很违和
        scheduler.createChannel()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            store.ensureDefaultPerson(languageStore.language)
        }
        setContent {
            RememberYaoTheme {
                RememberYaoApp()
            }
        }
    }
}
