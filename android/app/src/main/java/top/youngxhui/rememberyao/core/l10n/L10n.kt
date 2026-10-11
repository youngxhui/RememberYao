package top.youngxhui.rememberyao.core.l10n

import android.content.Context
import android.content.res.Configuration
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import top.youngxhui.rememberyao.R
import top.youngxhui.rememberyao.core.model.MedicationUnit

/** 界面 / 通知语言。SYSTEM = 跟随系统。 */
enum class AppLanguage(val tag: String) {
    SYSTEM("system"),
    CHINESE("zh"),
    ENGLISH("en");

    /** 实际生效的语言（SYSTEM 时按设备语言归一）。 */
    fun resolve(): AppLanguage = when (this) {
        SYSTEM -> if (Locale.getDefault().language.startsWith("zh")) CHINESE else ENGLISH
        else -> this
    }

    val locale: Locale
        get() = when (this) {
            CHINESE -> Locale.SIMPLIFIED_CHINESE
            ENGLISH -> Locale.ENGLISH
            SYSTEM -> Locale.getDefault()
        }
}

/**
 * SharedPreferences 键集中一处，避免 `LocaleManager`（静态工具）与
 * [LanguageStore]（Hilt 单例）各写一份文件名而读不到同一份数据。
 */
object Prefs {
    const val FILE = "rememberyao_prefs"
    const val KEY_LANGUAGE = "language"
    const val KEY_ONBOARDING_DONE = "onboarding_done"

    private fun prefs(context: Context) =
        context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    /** 引导页是否已看过。Compose 侧同步读，不用为此把 DataStore 引进来。 */
    fun onboardingDone(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ONBOARDING_DONE, false)

    fun setOnboardingDone(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_ONBOARDING_DONE, value).apply()
    }
}

/**
 * 语言偏好与引导页标记。
 *
 * 用 SharedPreferences 而不是 DataStore：这两个值都要在 `attachBaseContext`
 * 里同步读出来包 locale，DataStore 的挂起 API 用不上。
 */
@Singleton
class LanguageStore @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val prefs
        get() = context.getSharedPreferences(Prefs.FILE, Context.MODE_PRIVATE)

    var language: AppLanguage
        get() = runCatching { AppLanguage.valueOf(prefs.getString(Prefs.KEY_LANGUAGE, null) ?: AppLanguage.SYSTEM.name) }
            .getOrDefault(AppLanguage.SYSTEM)
        set(value) {
            prefs.edit().putString(Prefs.KEY_LANGUAGE, value.name).apply()
        }

    /** 引导页是否已看过。 */
    var onboardingDone: Boolean
        get() = prefs.getBoolean(Prefs.KEY_ONBOARDING_DONE, false)
        set(value) {
            prefs.edit().putBoolean(Prefs.KEY_ONBOARDING_DONE, value).apply()
        }
}

/**
 * 按语言偏好包裹 Context。
 *
 * 语言切换后走 `Activity.recreate()` 重新 attach，新 locale 才生效；
 * 通知栏文案另外靠 [L10n] 在语言切换后重注册一次。
 */
object LocaleManager {
    fun wrap(context: Context): Context {
        val language = runCatching {
            AppLanguage.valueOf(
                context.getSharedPreferences(Prefs.FILE, Context.MODE_PRIVATE)
                    .getString(Prefs.KEY_LANGUAGE, null) ?: AppLanguage.SYSTEM.name
            )
        }.getOrDefault(AppLanguage.SYSTEM)
        if (language == AppLanguage.SYSTEM) return context
        val locale = language.locale
        Locale.setDefault(locale)
        val config = Configuration(context.resources.configuration)
        config.setLocale(locale)
        config.setLayoutDirection(locale)
        return context.createConfigurationContext(config)
    }
}

/**
 * 取词入口。
 *
 * Compose 界面用 `stringResource(R.string.xxx)`；通知层、BroadcastReceiver 等
 * React 之外的地方用这里的 [translator] / [format] —— 键名与 strings.xml
 * 里的资源名一一对应（点换成下划线）。
 */
object L10n {
    /** 语言切换后必须重跑，否则通知栏按钮标题停留在旧语言。 */
    fun translator(context: Context): (String) -> String = { key -> get(context, key) }

    fun get(context: Context, key: String): String {
        val id = resId(key)
        return if (id != 0) context.getString(id) else key
    }

    fun format(context: Context, key: String, vararg args: Any?): String {
        val id = resId(key)
        return if (id != 0) context.getString(id, *args) else key
    }

    /** 药品单位短标签：片 / 粒。 */
    fun unitLabel(context: Context, unit: MedicationUnit): String = get(
        context,
        when (unit) {
            MedicationUnit.TABLET -> "medication.unitTablet"
            MedicationUnit.PILL -> "medication.unitPill"
        }
    )

    /** 包装形式标签：板装 / 瓶装 / 散装。 */
    fun typeLabel(context: Context, type: top.youngxhui.rememberyao.core.model.MedicationType): String =
        get(
            context,
            when (type) {
                top.youngxhui.rememberyao.core.model.MedicationType.BLISTER -> "medication.typeBlister"
                top.youngxhui.rememberyao.core.model.MedicationType.BOTTLE -> "medication.typeBottle"
                top.youngxhui.rememberyao.core.model.MedicationType.LOOSE -> "medication.typeLoose"
            }
        )

    /** 用途分类标签：慢性病 / 临时用药 / 保健品。 */
    fun categoryLabel(
        context: Context,
        category: top.youngxhui.rememberyao.core.model.MedicationCategory
    ): String = get(
        context,
        when (category) {
            top.youngxhui.rememberyao.core.model.MedicationCategory.CHRONIC ->
                "medication.categoryChronic"
            top.youngxhui.rememberyao.core.model.MedicationCategory.ACUTE ->
                "medication.categoryAcute"
            top.youngxhui.rememberyao.core.model.MedicationCategory.SUPPLEMENT ->
                "medication.categorySupplement"
        }
    )

    /** 性别标签。 */
    fun genderLabel(
        context: Context,
        gender: top.youngxhui.rememberyao.core.model.Gender
    ): String = get(
        context,
        when (gender) {
            top.youngxhui.rememberyao.core.model.Gender.MALE -> "person.genderMale"
            top.youngxhui.rememberyao.core.model.Gender.FEMALE -> "person.genderFemale"
            top.youngxhui.rememberyao.core.model.Gender.OTHER -> "person.genderOther"
        }
    )

    /** 并列多人名时的分隔符：中文用顿号，英文用逗号。 */
    fun listSeparator(language: AppLanguage): String =
        if (language.resolve() == AppLanguage.CHINESE) "、" else ", "

    private fun resId(key: String): Int = try {
        R.string::class.java.getField(key.replace('.', '_')).getInt(null)
    } catch (_: Exception) {
        0
    }
}
