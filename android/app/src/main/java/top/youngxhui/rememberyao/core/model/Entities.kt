package top.youngxhui.rememberyao.core.model

import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.random.Random

/**
 * 领域实体与枚举。
 *
 * 与 `docs/domain-spec.md` 第 1 节逐条对应：字段、含义、可空性都不自行发挥。
 * 这一层不认识 Room、不认识 Compose，只承载业务数据。
 */

/** 药品包装形式。与 [MedicationCategory]（用途分类）是两个正交维度。 */
enum class MedicationType(val raw: String) {
    BLISTER("blister"),
    BOTTLE("bottle"),
    LOOSE("loose");

    companion object {
        fun from(raw: String?): MedicationType = entries.firstOrNull { it.raw == raw } ?: LOOSE
    }
}

/** 药品用途分类。 */
enum class MedicationCategory(val raw: String) {
    CHRONIC("chronic"),
    ACUTE("acute"),
    SUPPLEMENT("supplement");

    companion object {
        /** 分类缺省值：与「添加药品」表单首项、数据库列默认值一致。 */
        val DEFAULT: MedicationCategory = CHRONIC

        fun from(raw: String?): MedicationCategory =
            entries.firstOrNull { it.raw == raw } ?: DEFAULT
    }
}

/** 药品单位。 */
enum class MedicationUnit(val raw: String) {
    TABLET("tablet"),
    PILL("pill");

    companion object {
        fun from(raw: String?): MedicationUnit = entries.firstOrNull { it.raw == raw } ?: TABLET
    }
}

/** 性别；未填写为 null。 */
enum class Gender(val raw: String) {
    MALE("male"),
    FEMALE("female"),
    OTHER("other");

    companion object {
        fun from(raw: String?): Gender? = entries.firstOrNull { it.raw == raw }
    }
}

/** 提醒状态机：`pending → taken / skipped / missed`。 */
enum class ReminderStatus(val raw: String) {
    PENDING("pending"),
    TAKEN("taken"),
    SKIPPED("skipped"),
    MISSED("missed");

    companion object {
        fun from(raw: String?): ReminderStatus =
            entries.firstOrNull { it.raw == raw } ?: PENDING
    }
}

/** 槽位状态：有药 / 已服（含历史消耗）/ 损坏遗失。 */
enum class BlisterSlotStatus(val raw: String) {
    FULL("full"),
    EMPTY("empty"),
    VOID("void");

    companion object {
        fun from(raw: String?): BlisterSlotStatus =
            entries.firstOrNull { it.raw == raw } ?: FULL
    }
}

/** 库存充裕度。只看「还剩多少」，不看还能吃几天。 */
enum class StockLevel { OK, LOW, CRITICAL }

/** 板的展示状态。由槽位推导，不落库。 */
enum class PackStatus { SEALED, OPEN, CONSUMED }

/** 药品：家里的实际药品和库存。 */
data class Medication(
    val id: String,
    val name: String,
    val type: MedicationType,
    val category: MedicationCategory,
    /** 规格，如 "10mg/片"。自由文本。 */
    val specification: String,
    val unit: MedicationUnit,
    /** 总数量（入库时的数量）。 */
    val totalQuantity: Int,
    /** 当前剩余数量。 */
    val remainingQuantity: Int,
    /** 每板行数；非板装或未记录为 null。 */
    val blisterRows: Int? = null,
    /** 每板列数（与 [blisterRows] 配对出现）。 */
    val blisterCols: Int? = null,
    /** 有效期 "YYYY-MM-DD"，null = 未记录（不参与到期提醒）。 */
    val expiryDate: String? = null,
    val prescription: Boolean,
    val notes: String,
    val createdAt: String,
    val updatedAt: String
)

/** 用药人：家庭中的具体用药人。 */
data class Person(
    val id: String,
    val name: String,
    /** 头像底色 `#rrggbb`。 */
    val avatarColor: String,
    /** 头像照片的本地文件 URI；`null` 表示没有照片，界面退回底色 + 姓名首字。 */
    val avatarUri: String? = null,
    val gender: Gender? = null,
    /** 年龄（周岁）；未填写为 null。 */
    val age: Int? = null,
    /** 过敏原列表；空数组表示未填写。 */
    val allergies: List<String> = emptyList(),
    /** 基础病 / 慢性病史列表。 */
    val underlyingConditions: List<String> = emptyList(),
    val createdAt: String
)

/** 用药配置：谁吃什么药、怎么吃。 */
data class MedicationPlan(
    val id: String,
    val medicationId: String,
    val personId: String,
    /** 每次剂量（单位：药品单位，片/粒）。 */
    val doseAmount: Int,
    /** 每日具体服用时间 "HH:MM"，数组长度即每日次数。 */
    val times: List<String>,
    /** 开始日期 YYYY-MM-DD。 */
    val startDate: String,
    /** 结束日期 YYYY-MM-DD，null = 长期。 */
    val endDate: String? = null,
    val enabled: Boolean = true,
    val createdAt: String,
    val updatedAt: String
)

/** 提醒：根据用药配置生成的某一次具体提醒。去重唯一键 `(planId, date, time)`。 */
data class Reminder(
    val id: String,
    val planId: String,
    val medicationId: String,
    val personId: String,
    /** 提醒日期 YYYY-MM-DD。 */
    val date: String,
    /** 提醒时间 HH:MM。 */
    val time: String,
    val doseAmount: Int,
    val status: ReminderStatus,
    /** 「稍后提醒」推迟到的时刻 ISO；未设置时按计划时间提醒。 */
    val snoozedUntil: String? = null,
    /** 已服用 / 跳过的处理时刻 ISO。 */
    val resolvedAt: String? = null,
    val createdAt: String
)

/**
 * 服用记录。
 *
 * [personName] / [medicationName] / [time] 是创建时的**快照**，药品或用药人
 * 被删除后历史记录仍可读。[reminderId] / [planId] 可空：孪生页手动点格子记的
 * 服用没有提醒来源。
 */
data class MedicationUsage(
    val id: String,
    val reminderId: String?,
    val planId: String?,
    val medicationId: String,
    val personId: String,
    val personName: String,
    val medicationName: String,
    /** 计划服用时间 "HH:MM"；手动记录为操作时刻。 */
    val time: String,
    val amount: Int,
    /** 是否漏服后补记。 */
    val late: Boolean,
    val takenAt: String,
    val createdAt: String
)

/**
 * 药板：一块实体泡罩。
 *
 * [rows] × [cols] 存在板自己身上：补货新建板时按药品规格来，而老板的规格可能
 * 已被用户改过，历史板必须保持自己的几何。
 */
data class BlisterPack(
    val id: String,
    val medicationId: String,
    /** 盒内第几板，从 1 开始。 */
    val seq: Int,
    val rows: Int,
    val cols: Int,
    val createdAt: String
)

/**
 * 槽位：泡罩里的一格。[index] 从 0 开始，从左到右、从上到下 ——
 * 消耗顺序与真人嗑药片的顺序一致（`nextFullSlots` 依赖这个排序）。
 */
data class BlisterSlot(
    val id: String,
    val packId: String,
    val index: Int,
    val status: BlisterSlotStatus,
    /** 消耗它的服用记录 id；手动记录 / 历史消耗为 null。 */
    val usageId: String? = null,
    val consumedAt: String? = null,
    /** 快照：消耗者姓名。 */
    val consumedBy: String? = null
)

/** 全局设置偏好。独立于业务实体存在，恒为一条。 */
data class Settings(
    /** 总开关：关闭后不再调度任何提醒通知。 */
    val notificationsEnabled: Boolean = true,
    /** 稍后提醒间隔（分钟）。 */
    val snoozeMinutes: Int = 10,
    /** 免打扰开始 "HH:MM"，null = 不启用。 */
    val quietStart: String? = null,
    /** 免打扰结束 "HH:MM"，null = 不启用。 */
    val quietEnd: String? = null,
    /** 提醒到达时是否发声 / 震动。 */
    val soundEnabled: Boolean = true,
    /** 同一成员连续漏服达到该次数时额外提醒；0 表示不提醒。 */
    val missedAlertStreak: Int = 2
) {
    companion object {
        val DEFAULT = Settings()
    }
}

// MARK: - 基础设施：id / 时间戳 / 列表编解码

/**
 * 全应用的时间戳格式：ISO8601，UTC，秒级精度。
 *
 * 统一走这里而不是散落各处 new formatter，避免同一份数据出现两种长度。
 */
object Iso8601 {
    private val formatter: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            .withZone(ZoneOffset.UTC)

    fun now(): String = string(Instant.now())

    fun string(instant: Instant): String = formatter.format(instant)

    /** 解析失败返回 null（调用方按「没有这个时间」处理）。 */
    fun parse(value: String?): Instant? {
        if (value.isNullOrEmpty()) return null
        return try {
            Instant.from(formatter.parse(value))
        } catch (_: Exception) {
            null
        }
    }
}

/** 实体 id 生成：时间戳 + 随机后缀，同一毫秒内创建多条也不会撞。 */
object IdGenerator {
    fun generate(): String {
        val ms = System.currentTimeMillis()
        val suffix = Random.nextInt(100_000)
        return "%d-%05d".format(Locale.US, ms, suffix)
    }
}

/**
 * 列表 ↔ 字符串编解码。
 *
 * 数据库里的 JSON 列（服药时间、过敏原等）用 `org.json` 手工拼，
 * 不用 kotlinx.serialization —— 后者只用于导航参数。
 */
object ListCodec {
    fun encode(values: List<String>): String {
        val array = org.json.JSONArray()
        values.forEach { array.put(it) }
        return array.toString()
    }

    fun decode(raw: String?): List<String> {
        if (raw.isNullOrEmpty()) return emptyList()
        return try {
            val array = org.json.JSONArray(raw)
            (0 until array.length()).map { array.getString(it) }
        } catch (_: Exception) {
            emptyList()
        }
    }
}
