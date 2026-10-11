package top.youngxhui.rememberyao.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import top.youngxhui.rememberyao.core.model.BlisterPack
import top.youngxhui.rememberyao.core.model.BlisterSlot
import top.youngxhui.rememberyao.core.model.BlisterSlotStatus
import top.youngxhui.rememberyao.core.model.Medication
import top.youngxhui.rememberyao.core.model.MedicationCategory
import top.youngxhui.rememberyao.core.model.MedicationPlan
import top.youngxhui.rememberyao.core.model.MedicationType
import top.youngxhui.rememberyao.core.model.MedicationUnit
import top.youngxhui.rememberyao.core.model.Gender
import top.youngxhui.rememberyao.core.model.MedicationUsage
import top.youngxhui.rememberyao.core.model.Person
import top.youngxhui.rememberyao.core.model.Reminder
import top.youngxhui.rememberyao.core.model.ReminderStatus
import top.youngxhui.rememberyao.core.model.Settings

/**
 * Room 实体 ↔ 领域实体。
 *
 * 数据库只做持久化，列名 / 表结构与领域层解耦：改领域模型不必迁移数据库，
 * 反之亦然。业务规则一律在领域层，这里只有字段搬运。
 */

@Entity(tableName = "medications", indices = [Index("category")])
data class MedicationEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: MedicationType,
    val category: MedicationCategory,
    val specification: String,
    val unit: MedicationUnit,
    val totalQuantity: Int,
    val remainingQuantity: Int,
    val blisterRows: Int?,
    val blisterCols: Int?,
    val expiryDate: String?,
    val prescription: Boolean,
    val notes: String,
    val createdAt: String,
    val updatedAt: String
)

@Entity(tableName = "persons")
data class PersonEntity(
    @PrimaryKey val id: String,
    val name: String,
    val avatarColor: String,
    val gender: Gender?,
    val age: Int?,
    /** 过敏原列表，JSON 列。 */
    val allergies: List<String>,
    /** 基础病列表，JSON 列。 */
    val underlyingConditions: List<String>,
    val createdAt: String
)

@Entity(tableName = "plans", indices = [Index("medicationId"), Index("personId")])
data class PlanEntity(
    @PrimaryKey val id: String,
    val medicationId: String,
    val personId: String,
    val doseAmount: Int,
    /** 每日服用时间 "HH:MM"，JSON 列，长度即每日次数。 */
    val times: List<String>,
    val startDate: String,
    val endDate: String?,
    val enabled: Boolean,
    val createdAt: String,
    val updatedAt: String
)

@Entity(tableName = "reminders", indices = [Index("planId"), Index("date")])
data class ReminderEntity(
    @PrimaryKey val id: String,
    val planId: String,
    val medicationId: String,
    val personId: String,
    val date: String,
    val time: String,
    val doseAmount: Int,
    val status: ReminderStatus,
    val snoozedUntil: String?,
    val resolvedAt: String?,
    val createdAt: String
)

@Entity(tableName = "usages", indices = [Index("medicationId"), Index("personId")])
data class UsageEntity(
    @PrimaryKey val id: String,
    val reminderId: String?,
    val planId: String?,
    val medicationId: String,
    val personId: String,
    val personName: String,
    val medicationName: String,
    val time: String,
    val amount: Int,
    val late: Boolean,
    val takenAt: String,
    val createdAt: String
)

@Entity(tableName = "packs", indices = [Index("medicationId")])
data class PackEntity(
    @PrimaryKey val id: String,
    val medicationId: String,
    val seq: Int,
    val rows: Int,
    val cols: Int,
    val createdAt: String
)

@Entity(tableName = "blister_slots", indices = [Index("packId"), Index("usageId")])
data class BlisterSlotEntity(
    @PrimaryKey val id: String,
    val packId: String,
    val slotIndex: Int,
    val status: BlisterSlotStatus,
    val usageId: String?,
    val consumedAt: String?,
    val consumedBy: String?
)

/** 全局设置，恒为一行（id 固定 0）。 */
@Entity(tableName = "settings")
data class SettingsEntity(
    @PrimaryKey val id: Int = SINGLETON_ID,
    val notificationsEnabled: Boolean,
    val snoozeMinutes: Int,
    val quietStart: String?,
    val quietEnd: String?,
    val soundEnabled: Boolean,
    val missedAlertStreak: Int
) {
    companion object {
        const val SINGLETON_ID = 0
    }
}

// MARK: - 映射

fun MedicationEntity.toDomain(): Medication = Medication(
    id = id,
    name = name,
    type = type,
    category = category,
    specification = specification,
    unit = unit,
    totalQuantity = totalQuantity,
    remainingQuantity = remainingQuantity,
    blisterRows = blisterRows,
    blisterCols = blisterCols,
    expiryDate = expiryDate,
    prescription = prescription,
    notes = notes,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun Medication.toEntity(): MedicationEntity = MedicationEntity(
    id = id,
    name = name,
    type = type,
    category = category,
    specification = specification,
    unit = unit,
    totalQuantity = totalQuantity,
    remainingQuantity = remainingQuantity,
    blisterRows = blisterRows,
    blisterCols = blisterCols,
    expiryDate = expiryDate,
    prescription = prescription,
    notes = notes,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun PersonEntity.toDomain(): Person = Person(
    id = id,
    name = name,
    avatarColor = avatarColor,
    gender = gender,
    age = age,
    allergies = allergies,
    underlyingConditions = underlyingConditions,
    createdAt = createdAt
)

fun Person.toEntity(): PersonEntity = PersonEntity(
    id = id,
    name = name,
    avatarColor = avatarColor,
    gender = gender,
    age = age,
    allergies = allergies,
    underlyingConditions = underlyingConditions,
    createdAt = createdAt
)

fun PlanEntity.toDomain(): MedicationPlan = MedicationPlan(
    id = id,
    medicationId = medicationId,
    personId = personId,
    doseAmount = doseAmount,
    times = times,
    startDate = startDate,
    endDate = endDate,
    enabled = enabled,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun MedicationPlan.toEntity(): PlanEntity = PlanEntity(
    id = id,
    medicationId = medicationId,
    personId = personId,
    doseAmount = doseAmount,
    times = times,
    startDate = startDate,
    endDate = endDate,
    enabled = enabled,
    createdAt = createdAt,
    updatedAt = updatedAt
)

fun ReminderEntity.toDomain(): Reminder = Reminder(
    id = id,
    planId = planId,
    medicationId = medicationId,
    personId = personId,
    date = date,
    time = time,
    doseAmount = doseAmount,
    status = status,
    snoozedUntil = snoozedUntil,
    resolvedAt = resolvedAt,
    createdAt = createdAt
)

fun Reminder.toEntity(): ReminderEntity = ReminderEntity(
    id = id,
    planId = planId,
    medicationId = medicationId,
    personId = personId,
    date = date,
    time = time,
    doseAmount = doseAmount,
    status = status,
    snoozedUntil = snoozedUntil,
    resolvedAt = resolvedAt,
    createdAt = createdAt
)

fun UsageEntity.toDomain(): MedicationUsage = MedicationUsage(
    id = id,
    reminderId = reminderId,
    planId = planId,
    medicationId = medicationId,
    personId = personId,
    personName = personName,
    medicationName = medicationName,
    time = time,
    amount = amount,
    late = late,
    takenAt = takenAt,
    createdAt = createdAt
)

fun MedicationUsage.toEntity(): UsageEntity = UsageEntity(
    id = id,
    reminderId = reminderId,
    planId = planId,
    medicationId = medicationId,
    personId = personId,
    personName = personName,
    medicationName = medicationName,
    time = time,
    amount = amount,
    late = late,
    takenAt = takenAt,
    createdAt = createdAt
)

fun PackEntity.toDomain(): BlisterPack = BlisterPack(
    id = id,
    medicationId = medicationId,
    seq = seq,
    rows = rows,
    cols = cols,
    createdAt = createdAt
)

fun BlisterPack.toEntity(): PackEntity = PackEntity(
    id = id,
    medicationId = medicationId,
    seq = seq,
    rows = rows,
    cols = cols,
    createdAt = createdAt
)

fun BlisterSlotEntity.toDomain(): BlisterSlot = BlisterSlot(
    id = id,
    packId = packId,
    index = slotIndex,
    status = status,
    usageId = usageId,
    consumedAt = consumedAt,
    consumedBy = consumedBy
)

fun BlisterSlot.toEntity(): BlisterSlotEntity = BlisterSlotEntity(
    id = id,
    packId = packId,
    slotIndex = index,
    status = status,
    usageId = usageId,
    consumedAt = consumedAt,
    consumedBy = consumedBy
)

fun SettingsEntity.toDomain(): Settings = Settings(
    notificationsEnabled = notificationsEnabled,
    snoozeMinutes = snoozeMinutes,
    quietStart = quietStart,
    quietEnd = quietEnd,
    soundEnabled = soundEnabled,
    missedAlertStreak = missedAlertStreak
)

fun Settings.toEntity(): SettingsEntity = SettingsEntity(
    id = SettingsEntity.SINGLETON_ID,
    notificationsEnabled = notificationsEnabled,
    snoozeMinutes = snoozeMinutes,
    quietStart = quietStart,
    quietEnd = quietEnd,
    soundEnabled = soundEnabled,
    missedAlertStreak = missedAlertStreak
)
