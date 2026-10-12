package top.youngxhui.rememberyao.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow
import top.youngxhui.rememberyao.core.model.BlisterSlotStatus
import top.youngxhui.rememberyao.core.model.Gender
import top.youngxhui.rememberyao.core.model.ListCodec
import top.youngxhui.rememberyao.core.model.MedicationCategory
import top.youngxhui.rememberyao.core.model.MedicationType
import top.youngxhui.rememberyao.core.model.MedicationUnit
import top.youngxhui.rememberyao.core.model.ReminderStatus

/**
 * Room 类型转换器。
 *
 * 枚举 ↔ String、List<String> ↔ JSON 列。列表用手工拼的 JSON
 * （见 [ListCodec]），不引入 kotlinx.serialization —— 后者只用于导航参数。
 */
class Converters {
    @TypeConverter
    fun medicationTypeToRaw(value: MedicationType): String = value.raw

    @TypeConverter
    fun rawToMedicationType(value: String): MedicationType = MedicationType.from(value)

    @TypeConverter
    fun medicationCategoryToRaw(value: MedicationCategory): String = value.raw

    @TypeConverter
    fun rawToMedicationCategory(value: String): MedicationCategory = MedicationCategory.from(value)

    @TypeConverter
    fun medicationUnitToRaw(value: MedicationUnit): String = value.raw

    @TypeConverter
    fun rawToMedicationUnit(value: String): MedicationUnit = MedicationUnit.from(value)

    @TypeConverter
    fun genderToRaw(value: Gender?): String? = value?.raw

    @TypeConverter
    fun rawToGender(value: String?): Gender? = Gender.from(value)

    @TypeConverter
    fun reminderStatusToRaw(value: ReminderStatus): String = value.raw

    @TypeConverter
    fun rawToReminderStatus(value: String): ReminderStatus = ReminderStatus.from(value)

    @TypeConverter
    fun slotStatusToRaw(value: BlisterSlotStatus): String = value.raw

    @TypeConverter
    fun rawToSlotStatus(value: String): BlisterSlotStatus = BlisterSlotStatus.from(value)

    @TypeConverter
    fun stringListToJson(value: List<String>): String = ListCodec.encode(value)

    @TypeConverter
    fun jsonToStringList(value: String?): List<String> = ListCodec.decode(value)
}

/**
 * DAO 层约定：读走 Flow（数据库是唯一真相源，变更自动推送 UI），写只提供
 * 单行 / 批量 upsert 与按 id 删除 —— 全量删表重插已随快照架构一起移除，
 * 每次写操作只动它真正影响的那些行。
 */

/** 药品表。 */
@Dao
interface MedicationDao {
    @Query("SELECT * FROM medications")
    fun observeAll(): Flow<List<MedicationEntity>>

    @Query("SELECT * FROM medications")
    suspend fun getAll(): List<MedicationEntity>

    @Query("SELECT * FROM medications WHERE id = :id")
    suspend fun byId(id: String): MedicationEntity?

    @Upsert
    suspend fun upsert(row: MedicationEntity)

    @Upsert
    suspend fun upsertAll(rows: List<MedicationEntity>)

    @Query("DELETE FROM medications WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)
}

/** 用药人表。 */
@Dao
interface PersonDao {
    @Query("SELECT * FROM persons")
    fun observeAll(): Flow<List<PersonEntity>>

    @Query("SELECT * FROM persons")
    suspend fun getAll(): List<PersonEntity>

    @Query("SELECT * FROM persons WHERE id = :id")
    suspend fun byId(id: String): PersonEntity?

    @Upsert
    suspend fun upsert(row: PersonEntity)

    @Upsert
    suspend fun upsertAll(rows: List<PersonEntity>)

    @Query("DELETE FROM persons WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)
}

/** 用药配置表。 */
@Dao
interface PlanDao {
    @Query("SELECT * FROM plans")
    fun observeAll(): Flow<List<PlanEntity>>

    @Query("SELECT * FROM plans")
    suspend fun getAll(): List<PlanEntity>

    @Query("SELECT * FROM plans WHERE id = :id")
    suspend fun byId(id: String): PlanEntity?

    @Query("SELECT * FROM plans WHERE medicationId = :medicationId")
    suspend fun byMedication(medicationId: String): List<PlanEntity>

    @Query("SELECT * FROM plans WHERE personId = :personId")
    suspend fun byPerson(personId: String): List<PlanEntity>

    @Upsert
    suspend fun upsert(row: PlanEntity)

    @Upsert
    suspend fun upsertAll(rows: List<PlanEntity>)

    @Query("DELETE FROM plans WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)
}

/** 提醒表。 */
@Dao
interface ReminderDao {
    @Query("SELECT * FROM reminders")
    fun observeAll(): Flow<List<ReminderEntity>>

    @Query("SELECT * FROM reminders")
    suspend fun getAll(): List<ReminderEntity>

    @Query("SELECT * FROM reminders WHERE id = :id")
    suspend fun byId(id: String): ReminderEntity?

    @Query("SELECT * FROM reminders WHERE planId IN (:planIds)")
    suspend fun byPlanIds(planIds: List<String>): List<ReminderEntity>

    @Upsert
    suspend fun upsert(row: ReminderEntity)

    @Upsert
    suspend fun upsertAll(rows: List<ReminderEntity>)

    @Query("DELETE FROM reminders WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)
}

/** 服用记录表。 */
@Dao
interface UsageDao {
    @Query("SELECT * FROM usages")
    fun observeAll(): Flow<List<UsageEntity>>

    @Query("SELECT * FROM usages")
    suspend fun getAll(): List<UsageEntity>

    @Query("SELECT * FROM usages WHERE id = :id")
    suspend fun byId(id: String): UsageEntity?

    @Upsert
    suspend fun upsert(row: UsageEntity)

    @Query("DELETE FROM usages WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)
}

/** 药板表。 */
@Dao
interface PackDao {
    @Query("SELECT * FROM packs")
    fun observeAll(): Flow<List<PackEntity>>

    @Query("SELECT * FROM packs")
    suspend fun getAll(): List<PackEntity>

    @Query("SELECT * FROM packs WHERE id = :id")
    suspend fun byId(id: String): PackEntity?

    @Query("SELECT * FROM packs WHERE medicationId = :medicationId")
    suspend fun byMedication(medicationId: String): List<PackEntity>

    @Upsert
    suspend fun upsertAll(rows: List<PackEntity>)

    @Query("DELETE FROM packs WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)
}

/** 槽位表。 */
@Dao
interface BlisterSlotDao {
    @Query("SELECT * FROM blister_slots")
    fun observeAll(): Flow<List<BlisterSlotEntity>>

    @Query("SELECT * FROM blister_slots")
    suspend fun getAll(): List<BlisterSlotEntity>

    @Query("SELECT * FROM blister_slots WHERE id = :id")
    suspend fun byId(id: String): BlisterSlotEntity?

    @Query("SELECT * FROM blister_slots WHERE packId IN (:packIds)")
    suspend fun byPackIds(packIds: List<String>): List<BlisterSlotEntity>

    @Query("SELECT * FROM blister_slots WHERE usageId = :usageId")
    suspend fun byUsageId(usageId: String): List<BlisterSlotEntity>

    @Upsert
    suspend fun upsert(row: BlisterSlotEntity)

    @Upsert
    suspend fun upsertAll(rows: List<BlisterSlotEntity>)

    @Query("DELETE FROM blister_slots WHERE id IN (:ids)")
    suspend fun deleteByIds(ids: List<String>)
}

/** 设置表（单行）。 */
@Dao
interface SettingsDao {
    @Query("SELECT * FROM settings WHERE id = ${SettingsEntity.SINGLETON_ID} LIMIT 1")
    fun observe(): Flow<SettingsEntity?>

    @Query("SELECT * FROM settings WHERE id = ${SettingsEntity.SINGLETON_ID} LIMIT 1")
    suspend fun get(): SettingsEntity?

    @Upsert
    suspend fun upsert(row: SettingsEntity)
}

/**
 * 本地数据库。
 *
 * `exportSchema = false`：schema 快照对单机应用没有消费者，导出只会多一份
 * 需要维护的 JSON。
 */
@Database(
    entities = [
        MedicationEntity::class,
        PersonEntity::class,
        PlanEntity::class,
        ReminderEntity::class,
        UsageEntity::class,
        PackEntity::class,
        BlisterSlotEntity::class,
        SettingsEntity::class
    ],
    version = 1,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun medicationDao(): MedicationDao
    abstract fun personDao(): PersonDao
    abstract fun planDao(): PlanDao
    abstract fun reminderDao(): ReminderDao
    abstract fun usageDao(): UsageDao
    abstract fun packDao(): PackDao
    abstract fun blisterSlotDao(): BlisterSlotDao
    abstract fun settingsDao(): SettingsDao

    companion object {
        const val NAME = "rememberyao.db"
    }
}
