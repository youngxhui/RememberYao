package top.youngxhui.rememberyao.core.domain

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import top.youngxhui.rememberyao.core.model.AppData
import top.youngxhui.rememberyao.core.model.BlisterPack
import top.youngxhui.rememberyao.core.model.BlisterSlot
import top.youngxhui.rememberyao.core.model.BlisterSlotStatus
import top.youngxhui.rememberyao.core.model.Iso8601
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.MedicationPlan
import top.youngxhui.rememberyao.core.model.PackStatus
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.core.model.Reminder
import top.youngxhui.rememberyao.core.model.ReminderStatus
import top.youngxhui.rememberyao.core.model.Settings
import top.youngxhui.rememberyao.core.model.StockLevel
import kotlin.math.ceil
import kotlin.math.roundToInt

/**
 * 领域常量与纯函数。
 *
 * 与 `docs/domain-spec.md` 第 2、3 节逐条对齐，改这里必须同步改文档。
 * 这一层不做任何 IO，也不持有状态，方便用普通单元测试覆盖。
 */
object Domain {
    /** 宽限期（分钟）：到点后这么久仍未处理才标记为漏服。 */
    const val GRACE_MINUTES = 60

    /** 提醒保留天数：更早的已处理提醒会被清理，服用记录永久保留。 */
    const val REMINDER_KEEP_DAYS = 90

    /** 低库存阈值：按当前计划估算剩余可服用天数 ≤ 该值时视为库存不足。 */
    const val LOW_STOCK_DAYS = 3

    /** 提前生成的天数（含今天）。 */
    const val GENERATE_AHEAD_DAYS = 7

    /** 每板单边格数上限：防手滑填出 100×100 的「药板」把网格和账一起撑坏。 */
    const val MAX_PACK_SIDE = 12

    /** 补货板数上限。 */
    const val MAX_PACK_COUNT = 20

    /** 头像色板。姓名 → 稳定取色，重名同色。 */
    val PERSON_AVATAR_COLORS = listOf(
        "#0F766E", "#D97706", "#DC2626", "#2563EB", "#7C3AED", "#DB2777"
    )

    /** 药饼 / 胶囊配色：按药品 id 稳定取色（重录同药同色，改名不改色）。 */
    data class PillTint(val body: String, val cap: String, val score: String)

    val PILL_TINTS = listOf(
        PillTint("#FDFDFA", "#F2DFB4", "#E5DEC9"),
        PillTint("#FFF6DE", "#F2C94C", "#E8D49A"),
        PillTint("#FDEBEB", "#E86A6A", "#EFC3C3"),
        PillTint("#FFF1D6", "#F2994A", "#EBD2A6"),
        PillTint("#EAF2FD", "#4A7FD4", "#C9D9F0"),
        PillTint("#EDF7EF", "#5FA777", "#CDE6D5")
    )

    /** 设置可选的稍后提醒间隔（分钟）。首项是默认值 10。 */
    val SNOOZE_OPTIONS = listOf(10, 15, 30, 60)

    /** 新建配置的默认服用时间。 */
    val DEFAULT_TIMES = listOf("08:00", "12:00", "18:00", "21:00", "10:00", "15:00")

    /** 药品已被删除时的历史占位名。 */
    const val DELETED_MEDICATION_NAME = "已删除的药品"

    /** 用药人已被删除时的历史占位名。 */
    const val DELETED_PERSON_NAME = "已删除的用药人"
}

// MARK: - 稳定 hash 取色

/**
 * 姓名 → 取色索引：对字符串做稳定的 31 倍滚动 hash，再对色板长度取模。
 *
 * 纯函数，同名恒得同色。用 UTF-16 code unit 累加，跨运行 / 跨语言稳定
 * —— 与 iOS 端 `stableHash` 逐位一致。
 *
 * ⚠️ 累加必须**按 Int32 回绕**：iOS 那边 `h` 是 `Int32`，`&*` / `&+` 溢出即回绕。
 * 药品 id 是 36 位 UUID，`31^35` 远超 32 位，如果这里用 JVM 的 64 位 `Int`
 * 硬乘，算出来的 hash 与 iOS 不同，同一味药在两端会取到不同的配色。
 *
 * ⚠️ 返回值**只取低 31 位**（掩掉符号位），不是 `abs(h)`：Kotlin 的
 * `abs(Int.MIN_VALUE)` 仍返回负数，取模会出负下标越界；iOS 那边
 * `abs(Int32.min)` 更是直接 trap。掩符号位两端逐位一致且必然非负。
 */
fun stableHash(s: String): Int {
    var h = 0
    for (unit in s) {
        // 先按 64 位算，再截回低 32 位（有符号解释）= Int32 的回绕语义
        h = ((h.toLong() * 31 + unit.code) and 0xFFFFFFFFL).toInt()
    }
    return h and 0x7FFFFFFF
}

/** 按姓名 hash 从头像色板取色（重名同色）。 */
fun pickAvatarColor(name: String): String {
    if (Domain.PERSON_AVATAR_COLORS.isEmpty()) return "#0F766E"
    val trimmed = name.trim()
    val index = stableHash(trimmed) % Domain.PERSON_AVATAR_COLORS.size
    return Domain.PERSON_AVATAR_COLORS[index]
}

/** 按药品 id hash 从药饼干配色取色。 */
fun pickPillTint(id: String): Domain.PillTint {
    if (Domain.PILL_TINTS.isEmpty()) {
        return Domain.PillTint("#FDFDFA", "#F2DFB4", "#E5DEC9")
    }
    return Domain.PILL_TINTS[stableHash(id) % Domain.PILL_TINTS.size]
}

// MARK: - 日期 / 时间

/**
 * 全项目禁止引入日期库，日期运算只允许这几个函数。
 *
 * 日期 key 一律 "YYYY-MM-DD"（本地时区），时间一律 "HH:MM"。
 */
object DateKey {
    private val zone: ZoneId get() = ZoneId.systemDefault()
    private val dateFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    /** 本地时区的「今天」。 */
    fun today(): String = key(Instant.now())

    /** Instant → 本地 YYYY-MM-DD。 */
    fun key(instant: Instant): String =
        dateFormatter.format(instant.atZone(zone).toLocalDate())

    /** "YYYY-MM-DD" ± n 天。非法输入原样返回。 */
    fun addDays(key: String, days: Int): String =
        parse(key)?.plusDays(days.toLong())?.format(dateFormatter) ?: key

    /** "YYYY-MM-DD" → 本地当天 00:00 的 Instant。非法输入返回 null。 */
    fun date(key: String): Instant? =
        parse(key)?.atStartOfDay(zone)?.toInstant()

    /** 解析 "YYYY-MM-DD" + "HH:MM" 为本地 Instant。时间非法时按当天 00:00。 */
    fun dateTime(key: String, time: String): Instant? {
        val day = parse(key) ?: return null
        val parts = time.split(":").mapNotNull { it.trim().toIntOrNull() }
        if (parts.isEmpty()) return day.atStartOfDay(zone).toInstant()
        val localTime = LocalTime.of(
            parts[0].coerceIn(0, 23),
            if (parts.size > 1) parts[1].coerceIn(0, 59) else 0
        )
        return day.atTime(localTime).atZone(zone).toInstant()
    }

    /** 本周起始日（周一）的日期 key。ISO 周以周一为首日。 */
    fun weekStart(today: String = DateKey.today()): String {
        val day = parse(today) ?: return today
        // DayOfWeek: 周一 = 1 … 周日 = 7，转成「周一 = 0」再回退
        val offset = day.dayOfWeek.value - 1
        return addDays(today, -offset)
    }

    /** 比较两个 "HH:MM"。字典序等价于时间序，且不依赖 locale。 */
    fun compareTime(a: String, b: String): Int = a.compareTo(b)

    private fun parse(key: String): LocalDate? = try {
        LocalDate.parse(key, dateFormatter)
    } catch (_: Exception) {
        null
    }
}

/** 时间工具（"HH:MM" ↔ Instant）。 */
object Clock {
    private val timeFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    /** Instant → "HH:MM"（本地时区）。 */
    fun time(instant: Instant): String =
        timeFormatter.format(instant.atZone(ZoneId.systemDefault()).toLocalTime())

    /** "HH:MM" → 今天的这个时刻。 */
    fun date(time: String): Instant {
        val parts = time.split(":").mapNotNull { it.trim().toIntOrNull() }
        val localTime = LocalTime.of(
            if (parts.isNotEmpty()) parts[0].coerceIn(0, 23) else 0,
            if (parts.size > 1) parts[1].coerceIn(0, 59) else 0
        )
        return LocalDate.now().atTime(localTime).atZone(ZoneId.systemDefault()).toInstant()
    }

    /** 取前 n 个默认时间。 */
    fun defaultTimes(count: Int): List<String> =
        if (count <= 0) emptyList() else Domain.DEFAULT_TIMES.take(count)
}

// MARK: - 配置生效与状态

/** 配置在指定日期是否生效。 */
fun MedicationPlan.isActive(day: String): Boolean {
    if (!enabled) return false
    if (day < startDate) return false
    val end = endDate
    if (end != null && day > end) return false
    return true
}

/** 配置的展示状态键：停用 / 已结束 / 服用中。 */
val MedicationPlan.statusKey: String
    get() = when {
        !enabled -> "plan.statusDisabled"
        endDate != null && endDate < DateKey.today() -> "plan.statusEnded"
        else -> "plan.statusActive"
    }

// MARK: - 提醒派生时间

/** 提醒的计划服用时间。 */
val Reminder.dueDate: Instant?
    get() = DateKey.dateTime(date, time)

/** 提醒的漏服判定时间（计划时间 + 宽限期）。 */
val Reminder.missDate: Instant?
    get() = dueDate?.plusSeconds(Domain.GRACE_MINUTES * 60L)

/** 该提醒是否处于「稍后提醒」中（推迟时刻还没到）。 */
fun Reminder.isSnoozed(now: Instant = Instant.now()): Boolean {
    val until = Iso8601.parse(snoozedUntil) ?: return false
    return until > now
}

// MARK: - 库存

/**
 * 库存充裕度：只看「还剩多少」，不看还能吃几天。
 *
 * [Medication.totalQuantity] 为 0（没记库存）时按 critical 处理：把 0 库存
 * 说成充足比说成缺货更糟。
 */
val Medication.stockLevel: StockLevel
    get() {
        val ratio = if (totalQuantity > 0) {
            remainingQuantity.toDouble() / totalQuantity.toDouble()
        } else {
            0.0
        }
        return when {
            ratio <= 0.15 -> StockLevel.CRITICAL
            ratio <= 0.30 -> StockLevel.LOW
            else -> StockLevel.OK
        }
    }

/** 按当前生效配置估算某药品的消耗与剩余天数。 */
data class StockSummary(
    val dailyDose: Int,
    /** 还能吃几天；没有生效配置时为 null。 */
    val daysLeft: Int?,
    val low: Boolean
)

/**
 * 按当前生效配置估算某药品的消耗与剩余天数。
 *
 * 与 [stockLevel] 是两个维度，别混用 —— 后者只依赖库存自身，前者依赖
 * 「有人在吃这个药」。
 */
fun stockSummary(medication: Medication, plans: List<MedicationPlan>): StockSummary {
    val today = DateKey.today()
    val dailyDose = plans
        .filter { it.medicationId == medication.id && it.isActive(day = today) }
        .sumOf { it.doseAmount * it.times.size }
    val daysLeft = if (dailyDose > 0) medication.remainingQuantity / dailyDose else null
    return StockSummary(
        dailyDose = dailyDose,
        daysLeft = daysLeft,
        low = daysLeft?.let { it <= Domain.LOW_STOCK_DAYS } ?: false
    )
}

// MARK: - 板装孪生

/** 夹紧每板行列：板是物理实体，1~12 之间。 */
fun clampSide(n: Int): Int = n.coerceIn(1, Domain.MAX_PACK_SIDE)

/** 板的展示状态：由槽位推导，不落库。 */
fun List<BlisterSlot>.packStatus(): PackStatus = when {
    isEmpty() -> PackStatus.SEALED
    none { it.status == BlisterSlotStatus.FULL } -> PackStatus.CONSUMED
    any { it.status != BlisterSlotStatus.FULL } -> PackStatus.OPEN
    else -> PackStatus.SEALED
}

/** 某药品的孪生概览。 */
data class BlisterSummary(
    /** 是否已建孪生。 */
    val enabled: Boolean,
    val packCount: Int,
    /** 每板格数（取第一板）。 */
    val slotsPerPack: Int,
    val totalSlots: Int,
    val fullSlots: Int,
    /** 下一块要开的板（还有药的板里序号最小）；null = 全部吃完。 */
    val openPack: BlisterPack?
)

fun blisterSummary(
    medication: Medication,
    packs: List<BlisterPack>,
    slots: List<BlisterSlot>
): BlisterSummary {
    val own = packs.filter { it.medicationId == medication.id }.sortedBy { it.seq }
    val packIds = own.map { it.id }.toSet()
    val ownSlots = slots.filter { it.packId in packIds }
    return BlisterSummary(
        enabled = own.isNotEmpty(),
        packCount = own.size,
        slotsPerPack = own.firstOrNull()?.let { it.rows * it.cols } ?: 0,
        totalSlots = ownSlots.size,
        fullSlots = ownSlots.count { it.status == BlisterSlotStatus.FULL },
        openPack = own.firstOrNull { pack ->
            ownSlots.any { it.packId == pack.id && it.status == BlisterSlotStatus.FULL }
        }
    )
}

/**
 * 按「板序 → 格序」取前 count 个 full 槽位 —— 泡罩从左到右、从上到下消耗，
 * 与真人嗑药片的顺序一致。
 */
fun nextFullSlots(
    packs: List<BlisterPack>,
    slots: List<BlisterSlot>,
    count: Int
): List<BlisterSlot> {
    if (count <= 0) return emptyList()
    val ordered = packs.sortedBy { it.seq }
    val result = mutableListOf<BlisterSlot>()
    for (pack in ordered) {
        val packSlots = slots
            .filter { it.packId == pack.id && it.status == BlisterSlotStatus.FULL }
            .sortedBy { it.index }
        for (slot in packSlots) {
            if (result.size >= count) return result
            result.add(slot)
        }
    }
    return result
}

// MARK: - 统计

/** 一周服药统计：服药率 + 按时数 + 漏服数。 */
data class WeekStats(
    /** 服药率 0–100，整数。 */
    val adherence: Int,
    /** 按时服用次数。 */
    val taken: Int,
    /** 漏服次数。 */
    val missed: Int,
    /** 跳过次数。 */
    val skipped: Int,
    /** 本周应服总次数（pending 也算）。 */
    val planned: Int
)

/**
 * 统计从 [from]（含）到 [to]（含）的服药情况。
 *
 * 「应服」= 该区间内所有提醒（pending 也算），「按时」= 已服用，
 * 「漏服」= 已判漏服，跳过既不计按时也不计漏服。
 */
fun weekStats(reminders: List<Reminder>, from: String, to: String): WeekStats {
    val inRange = reminders.filter { it.date >= from && it.date <= to }
    val taken = inRange.count { it.status == ReminderStatus.TAKEN }
    val missed = inRange.count { it.status == ReminderStatus.MISSED }
    val skipped = inRange.count { it.status == ReminderStatus.SKIPPED }
    val planned = inRange.size
    return WeekStats(
        adherence = if (planned > 0) (taken.toDouble() / planned * 100).roundToInt() else 0,
        taken = taken,
        missed = missed,
        skipped = skipped,
        planned = planned
    )
}

/**
 * 找出「连续漏服达到阈值」的成员。
 *
 * 按成员分组后，从最近的提醒往回数连续 missed 的条数，一旦遇到
 * taken / skipped 就中断 —— pending 也中断，因为「还没到点的剂量」不代表中间断过。
 */
fun missedStreaks(reminders: List<Reminder>, threshold: Int): Set<String> {
    val result = mutableSetOf<String>()
    if (threshold <= 0) return result

    val byPerson = reminders.groupBy { it.personId }
    for ((personId, list) in byPerson) {
        // 最新的排在前面，倒序扫 = 从现在往回数
        val sorted = list.sortedByDescending { it.date + "|" + it.time }
        var streak = 0
        for (reminder in sorted) {
            when (reminder.status) {
                ReminderStatus.MISSED -> {
                    streak += 1
                    if (streak >= threshold) {
                        result.add(personId)
                        break
                    }
                }
                // 未来待服用不计入，也不打断
                ReminderStatus.PENDING -> break
                // 已服用或已跳过 → 连续记录被打断
                else -> streak = 0
            }
        }
    }
    return result
}

// MARK: - 免打扰

/**
 * 免打扰时段是否覆盖给定的 "HH:MM"。
 *
 * 跨零点的区间（如 22:00–07:00）要拆成两段比较，否则整段永远判为不在区间内。
 */
fun inQuietHours(settings: Settings, hhmm: String): Boolean {
    val start = settings.quietStart ?: return false
    val end = settings.quietEnd ?: return false
    if (start == end) return false
    return if (start < end) {
        hhmm >= start && hhmm < end
    } else {
        hhmm >= start || hhmm < end
    }
}

// MARK: - 杂项

/** 按 personId 建索引，通知调度时按 id 反查姓名用。 */
fun Map<String, Person>.nameOf(id: String): String =
    this[id]?.name ?: Domain.DELETED_PERSON_NAME

/** 向上取整的板数：装得下 [remaining] 至少需要几块每板 [perPack] 格的板。 */
fun packsNeeded(remaining: Int, perPack: Int): Int =
    if (perPack <= 0) 1 else ceil(remaining.toDouble() / perPack.toDouble()).toInt().coerceAtLeast(1)

/** 便于测试 / 调试：把 AppData 打平成可读摘要。 */
fun AppData.describe(): String =
    "medications=${medications.size} persons=${persons.size} plans=${plans.size} " +
        "reminders=${reminders.size} usages=${usages.size} packs=${packs.size} " +
        "slots=${blisterSlots.size}"
