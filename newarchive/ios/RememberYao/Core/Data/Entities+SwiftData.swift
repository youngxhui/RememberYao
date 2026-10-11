import Foundation
import SwiftData

/// SwiftData 持久化实体。
///
/// 与 `Core/Model/Entities.swift` 里的领域结构体**刻意分开**：领域层要的是值
/// 语义（改一个字段拿到一个新 `AppData`，纯函数好测），SwiftData 要的是引用
/// 语义 + 托管对象上下文。两层之间只做机械映射，不放任何业务规则。
///
/// 枚举统一存 String rawValue：SwiftData 对非标准类型的编解码要走 `Codable`，
/// 而原始值就是最稳的编解码，也方便直接看库排查。
@Model
public final class MedicationEntity {
  @Attribute(.unique) public var id: String
  public var name: String
  public var type: String
  public var category: String
  public var specification: String
  public var unit: String
  public var totalQuantity: Int
  public var remainingQuantity: Int
  public var blisterRows: Int?
  public var blisterCols: Int?
  public var expiryDate: String?
  public var prescription: Bool
  public var notes: String
  public var createdAt: String
  public var updatedAt: String

  public init(
    id: String, name: String, type: String, category: String, specification: String,
    unit: String, totalQuantity: Int, remainingQuantity: Int, blisterRows: Int?,
    blisterCols: Int?, expiryDate: String?, prescription: Bool, notes: String,
    createdAt: String, updatedAt: String
  ) {
    self.id = id
    self.name = name
    self.type = type
    self.category = category
    self.specification = specification
    self.unit = unit
    self.totalQuantity = totalQuantity
    self.remainingQuantity = remainingQuantity
    self.blisterRows = blisterRows
    self.blisterCols = blisterCols
    self.expiryDate = expiryDate
    self.prescription = prescription
    self.notes = notes
    self.createdAt = createdAt
    self.updatedAt = updatedAt
  }
}

@Model
public final class PersonEntity {
  @Attribute(.unique) public var id: String
  public var name: String
  public var avatarColor: String
  public var gender: String?
  public var age: Int?
  /// 过敏原列表，JSON 字符串（整体读写，从不按元素查询）。
  public var allergies: String
  /// 基础病 / 慢性病史列表，JSON 字符串。
  public var underlyingConditions: String
  public var createdAt: String

  public init(
    id: String, name: String, avatarColor: String, gender: String?, age: Int?,
    allergies: String, underlyingConditions: String, createdAt: String
  ) {
    self.id = id
    self.name = name
    self.avatarColor = avatarColor
    self.gender = gender
    self.age = age
    self.allergies = allergies
    self.underlyingConditions = underlyingConditions
    self.createdAt = createdAt
  }
}

@Model
public final class PlanEntity {
  @Attribute(.unique) public var id: String
  public var medicationId: String
  public var personId: String
  public var doseAmount: Int
  /// 每日服用时间 "HH:MM" 数组，JSON 字符串。
  public var times: String
  public var startDate: String
  public var endDate: String?
  public var enabled: Bool
  public var createdAt: String
  public var updatedAt: String

  public init(
    id: String, medicationId: String, personId: String, doseAmount: Int, times: String,
    startDate: String, endDate: String?, enabled: Bool, createdAt: String,
    updatedAt: String
  ) {
    self.id = id
    self.medicationId = medicationId
    self.personId = personId
    self.doseAmount = doseAmount
    self.times = times
    self.startDate = startDate
    self.endDate = endDate
    self.enabled = enabled
    self.createdAt = createdAt
    self.updatedAt = updatedAt
  }
}

@Model
public final class ReminderEntity {
  @Attribute(.unique) public var id: String
  public var planId: String
  public var medicationId: String
  public var personId: String
  public var date: String
  public var time: String
  public var doseAmount: Int
  public var status: String
  public var snoozedUntil: String?
  public var resolvedAt: String?
  public var createdAt: String

  public init(
    id: String, planId: String, medicationId: String, personId: String, date: String,
    time: String, doseAmount: Int, status: String, snoozedUntil: String?,
    resolvedAt: String?, createdAt: String
  ) {
    self.id = id
    self.planId = planId
    self.medicationId = medicationId
    self.personId = personId
    self.date = date
    self.time = time
    self.doseAmount = doseAmount
    self.status = status
    self.snoozedUntil = snoozedUntil
    self.resolvedAt = resolvedAt
    self.createdAt = createdAt
  }
}

@Model
public final class UsageEntity {
  @Attribute(.unique) public var id: String
  public var reminderId: String?
  public var planId: String?
  public var medicationId: String
  public var personId: String
  /// 快照：用药人姓名。
  public var personName: String
  /// 快照：药品名称。
  public var medicationName: String
  /// 快照：计划中的服用时间 "HH:MM"。
  public var time: String
  public var amount: Int
  public var late: Bool
  public var takenAt: String
  public var createdAt: String

  public init(
    id: String, reminderId: String?, planId: String?, medicationId: String,
    personId: String, personName: String, medicationName: String, time: String,
    amount: Int, late: Bool, takenAt: String, createdAt: String
  ) {
    self.id = id
    self.reminderId = reminderId
    self.planId = planId
    self.medicationId = medicationId
    self.personId = personId
    self.personName = personName
    self.medicationName = medicationName
    self.time = time
    self.amount = amount
    self.late = late
    self.takenAt = takenAt
    self.createdAt = createdAt
  }
}

@Model
public final class PackEntity {
  @Attribute(.unique) public var id: String
  public var medicationId: String
  public var seq: Int
  public var rows: Int
  public var cols: Int
  public var createdAt: String

  public init(
    id: String, medicationId: String, seq: Int, rows: Int, cols: Int, createdAt: String
  ) {
    self.id = id
    self.medicationId = medicationId
    self.seq = seq
    self.rows = rows
    self.cols = cols
    self.createdAt = createdAt
  }
}

@Model
public final class BlisterSlotEntity {
  @Attribute(.unique) public var id: String
  public var packId: String
  /// 列名叫 slotIndex：SQLite 的 INDEX 是关键字，裸用会语法错误。
  public var slotIndex: Int
  public var status: String
  public var usageId: String?
  public var consumedAt: String?
  public var consumedBy: String?

  public init(
    id: String, packId: String, slotIndex: Int, status: String, usageId: String?,
    consumedAt: String?, consumedBy: String?
  ) {
    self.id = id
    self.packId = packId
    self.slotIndex = slotIndex
    self.status = status
    self.usageId = usageId
    self.consumedAt = consumedAt
    self.consumedBy = consumedBy
  }
}

/// 全局设置偏好，单行表（`id` 恒为 "singleton"）。
@Model
public final class SettingsEntity {
  @Attribute(.unique) public var id: String
  public var notificationsEnabled: Bool
  public var snoozeMinutes: Int
  public var quietStart: String?
  public var quietEnd: String?
  public var soundEnabled: Bool
  public var missedAlertStreak: Int

  public init(
    id: String = SettingsEntity.singletonID,
    notificationsEnabled: Bool, snoozeMinutes: Int, quietStart: String?,
    quietEnd: String?, soundEnabled: Bool, missedAlertStreak: Int
  ) {
    self.id = id
    self.notificationsEnabled = notificationsEnabled
    self.snoozeMinutes = snoozeMinutes
    self.quietStart = quietStart
    self.quietEnd = quietEnd
    self.soundEnabled = soundEnabled
    self.missedAlertStreak = missedAlertStreak
  }

  public static let singletonID = "singleton"
}

/// 全部实体。`ModelContainer` 的 schema 从这里取。
public enum AppSchema {
  public static let schema = Schema([
    MedicationEntity.self,
    PersonEntity.self,
    PlanEntity.self,
    ReminderEntity.self,
    UsageEntity.self,
    PackEntity.self,
    BlisterSlotEntity.self,
    SettingsEntity.self,
  ])
}

// MARK: - 领域结构体 ← 实体

extension Medication {
  init(_ entity: MedicationEntity) {
    self.init(
      id: entity.id,
      name: entity.name,
      // 枚举列在库里是自由 TEXT，读出来统一按枚举收窄；不在取值表内的值
      // （理论上不会有）落到首项，而不是把脏值带进 UI
      type: MedicationType(rawValue: entity.type) ?? .blister,
      category: MedicationCategory(rawValue: entity.category) ?? .default,
      specification: entity.specification,
      unit: MedicationUnit(rawValue: entity.unit) ?? .tablet,
      totalQuantity: entity.totalQuantity,
      remainingQuantity: entity.remainingQuantity,
      blisterRows: entity.blisterRows,
      blisterCols: entity.blisterCols,
      expiryDate: entity.expiryDate,
      prescription: entity.prescription,
      notes: entity.notes,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    )
  }
}

extension Person {
  init(_ entity: PersonEntity) {
    self.init(
      id: entity.id,
      name: entity.name,
      avatarColor: entity.avatarColor,
      gender: entity.gender.flatMap(Gender.init(rawValue:)),
      age: entity.age,
      allergies: Self.decodeTags(entity.allergies),
      underlyingConditions: Self.decodeTags(entity.underlyingConditions),
      createdAt: entity.createdAt
    )
  }

  /// JSON 字符串数组列 → [String]（过敏史 / 基础病），坏值退化成空数组。
  static func decodeTags(_ raw: String) -> [String] {
    guard let data = raw.data(using: .utf8),
      let decoded = try? JSONDecoder().decode([String].self, from: data)
    else { return [] }
    return decoded
  }

  func encodeTags() -> String { Self.encode(allergies) }
  func encodeConditions() -> String { Self.encode(underlyingConditions) }

  private static func encode(_ values: [String]) -> String {
    let data = (try? JSONEncoder().encode(values)) ?? Data()
    return String(data: data, encoding: .utf8) ?? "[]"
  }
}

extension MedicationPlan {
  init(_ entity: PlanEntity) {
    self.init(
      id: entity.id,
      medicationId: entity.medicationId,
      personId: entity.personId,
      doseAmount: entity.doseAmount,
      times: Self.decodeTimes(entity.times),
      startDate: entity.startDate,
      endDate: entity.endDate,
      enabled: entity.enabled,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    )
  }

  /// JSON 字符串数组列 → [String]，坏值退化成空数组。
  static func decodeTimes(_ raw: String) -> [String] {
    guard let data = raw.data(using: .utf8),
      let decoded = try? JSONDecoder().decode([String].self, from: data)
    else { return [] }
    return decoded
  }

  func encodeTimes() -> String {
    let data = (try? JSONEncoder().encode(times)) ?? Data()
    return String(data: data, encoding: .utf8) ?? "[]"
  }
}

extension Reminder {
  init(_ entity: ReminderEntity) {
    self.init(
      id: entity.id,
      planId: entity.planId,
      medicationId: entity.medicationId,
      personId: entity.personId,
      date: entity.date,
      time: entity.time,
      doseAmount: entity.doseAmount,
      status: ReminderStatus(rawValue: entity.status) ?? .pending,
      snoozedUntil: entity.snoozedUntil,
      resolvedAt: entity.resolvedAt,
      createdAt: entity.createdAt
    )
  }
}

extension MedicationUsage {
  init(_ entity: UsageEntity) {
    self.init(
      id: entity.id,
      reminderId: entity.reminderId,
      planId: entity.planId,
      medicationId: entity.medicationId,
      personId: entity.personId,
      personName: entity.personName,
      medicationName: entity.medicationName,
      time: entity.time,
      amount: entity.amount,
      late: entity.late,
      takenAt: entity.takenAt,
      createdAt: entity.createdAt
    )
  }
}

extension BlisterPack {
  init(_ entity: PackEntity) {
    self.init(
      id: entity.id,
      medicationId: entity.medicationId,
      seq: entity.seq,
      rows: entity.rows,
      cols: entity.cols,
      createdAt: entity.createdAt
    )
  }
}

extension BlisterSlot {
  init(_ entity: BlisterSlotEntity) {
    self.init(
      id: entity.id,
      packId: entity.packId,
      index: entity.slotIndex,
      status: BlisterSlotStatus(rawValue: entity.status) ?? .full,
      usageId: entity.usageId,
      consumedAt: entity.consumedAt,
      consumedBy: entity.consumedBy
    )
  }
}

extension Settings {
  init(_ entity: SettingsEntity) {
    self.init(
      notificationsEnabled: entity.notificationsEnabled,
      snoozeMinutes: entity.snoozeMinutes,
      quietStart: entity.quietStart,
      quietEnd: entity.quietEnd,
      soundEnabled: entity.soundEnabled,
      missedAlertStreak: entity.missedAlertStreak
    )
  }
}
