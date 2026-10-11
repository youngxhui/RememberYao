# 保留行号便于崩溃排查
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# kotlinx.serialization：@Serializable 生成的 serializer 由编译器生成，无需规则，
# 但保留注解避免被剥离导致导航参数解析失败
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**

# Room
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**
