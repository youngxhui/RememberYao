package top.youngxhui.rememberyao.data.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import top.youngxhui.rememberyao.data.local.AppDatabase
import top.youngxhui.rememberyao.data.local.BlisterSlotDao
import top.youngxhui.rememberyao.data.local.MedicationDao
import top.youngxhui.rememberyao.data.local.PackDao
import top.youngxhui.rememberyao.data.local.PersonDao
import top.youngxhui.rememberyao.data.local.PlanDao
import top.youngxhui.rememberyao.data.local.ReminderDao
import top.youngxhui.rememberyao.data.local.SettingsDao
import top.youngxhui.rememberyao.data.local.UsageDao

/** Hilt 装配：数据库与各 DAO。 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): AppDatabase =
        androidx.room.Room
            .databaseBuilder(context, AppDatabase::class.java, AppDatabase.NAME)
            .build()

    @Provides
    fun provideMedicationDao(db: AppDatabase): MedicationDao = db.medicationDao()

    @Provides
    fun providePersonDao(db: AppDatabase): PersonDao = db.personDao()

    @Provides
    fun providePlanDao(db: AppDatabase): PlanDao = db.planDao()

    @Provides
    fun provideReminderDao(db: AppDatabase): ReminderDao = db.reminderDao()

    @Provides
    fun provideUsageDao(db: AppDatabase): UsageDao = db.usageDao()

    @Provides
    fun providePackDao(db: AppDatabase): PackDao = db.packDao()

    @Provides
    fun provideBlisterSlotDao(db: AppDatabase): BlisterSlotDao = db.blisterSlotDao()

    @Provides
    fun provideSettingsDao(db: AppDatabase): SettingsDao = db.settingsDao()
}
