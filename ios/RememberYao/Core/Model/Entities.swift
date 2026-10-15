import Foundation

/// 药品包装形式。
///
/// 与 `MedicationCategory`（用途分类）是两个正交维度，不要混用。
public enum MedicationType: String, Codable, Sendable, CaseIterable {
  case blister
  case bottle
  case loose
}

/// 药品用途分类。药品库列表按它筛选。
public enum MedicationCategory: String, Codable, Sendable, CaseIterable {
  case chronic
  case acute
  case supplement

  /// 分类缺省值：与「添加药品」表单首项、数据库列默认值一致。
  public static let `default`: MedicationCategory = .chronic
}

/// 药品单位。
public enum MedicationUnit: String, Codable, Sendable, CaseIterable {
  case tablet
  case pill
}

/// 性别；未填写为 `nil`。
public enum Gender: String, Codable, Sendable, CaseIterable {
  case male
  case female
  case other
}

/// 提醒状态机：`pending → taken / skipped / missed`。
public enum ReminderStatus: String, Codable, Sendable {
  case pending
  case taken
  case skipped
  case missed
}

/// 槽位状态：有药 / 已服（含历史消耗）/ 损坏遗失。
public enum BlisterSlotStatus: String, Codable, Sendable {
  case full
  case empty
  case void
}

/// 库存充裕度。只看「还剩多少」，不看还能吃几天。
public enum StockLevel: String, Codable, Sendable {
  case ok
  case low
  case critical
}

/// 板的展示状态。由槽位推导，不落库 —— 存了就要跟着每次消耗回写，必然漂移。
public enum PackStatus: String, Codable, Sendable {
  case sealed
  case open
  case consumed
}

// MARK: - 实体

/// 药品：家里的实际药品和库存。
public struct Medication: Identifiable, Codable, Sendable, Equatable {
  public var id: String
  public var name: String
  public var type: MedicationType
  /// 用途分类。与 `type`（包装形式）是两个维度。
  public var category: MedicationCategory
  /// 规格，如 "10mg/片"。自由文本，没有统一取值表。
  public var specification: String
  public var unit: MedicationUnit
  /// 总数量（入库时的数量）。
  public var totalQuantity: Int
  /// 当前剩余数量。
  public var remainingQuantity: Int
  /// 板装规格：每板行数。非板装药或未记录为 `nil`。
  /// 只影响补货新建的板；老板各自存自己的 rows/cols。
  public var blisterRows: Int?
  /// 板装规格：每板列数（与 `blisterRows` 配对出现）。
  public var blisterCols: Int?
  /// 有效期 "YYYY-MM-DD"，`nil` 表示未记录（不参与到期提醒）。
  public var expiryDate: String?
  /// 是否处方药，只影响展示与将来可能的用药建议。
  public var prescription: Bool
  public var notes: String
  public var createdAt: String
  public var updatedAt: String

  public init(
    id: String,
    name: String,
    type: MedicationType,
    category: MedicationCategory,
    specification: String,
    unit: MedicationUnit,
    totalQuantity: Int,
    remainingQuantity: Int,
    blisterRows: Int? = nil,
    blisterCols: Int? = nil,
    expiryDate: String? = nil,
    prescription: Bool,
    notes: String,
    createdAt: String,
    updatedAt: String
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

/// 用药人：家庭中的具体用药人。
public struct Person: Identifiable, Codable, Sendable, Equatable {
  public var id: String
  public var name: String
  /// 头像底色（取姓名首字展示）。
  public var avatarColor: String
  /// 性别；未填写为 `nil`。
  public var gender: Gender?
  /// 年龄（周岁）；未填写为 `nil`。
  public var age: Int?
  /// 过敏原列表；空数组表示未填写。
  public var allergies: [String]
  /// 基础病 / 慢性病史列表；空数组表示未填写。
  public var underlyingConditions: [String]
  public var createdAt: String
  /// 头像照片的本地文件 URI；`nil` 表示没有照片，界面退回底色 + 姓名首字。
  public var avatarUri: String?

  public init(
    id: String,
    name: String,
    avatarColor: String,
    gender: Gender? = nil,
    age: Int? = nil,
    allergies: [String] = [],
    underlyingConditions: [String] = [],
    createdAt: String,
    avatarUri: String? = nil
  ) {
    self.id = id
    self.name = name
    self.avatarColor = avatarColor
    self.gender = gender
    self.age = age
    self.allergies = allergies
    self.underlyingConditions = underlyingConditions
    self.createdAt = createdAt
    self.avatarUri = avatarUri
  }
}

/// 用药配置：谁吃什么药、怎么吃。
public struct MedicationPlan: Identifiable, Codable, Sendable, Equatable {
  public var id: String
  public var medicationId: String
  public var personId: String
  /// 每次剂量（单位：药品单位，片/粒）。
  public var doseAmount: Int
  /// 每日具体服用时间 "HH:MM"，数组长度即每日次数。
  public var times: [String]
  /// 开始日期 YYYY-MM-DD。
  public var startDate: String
  /// 结束日期 YYYY-MM-DD，`nil` 表示长期。
  public var endDate: String?
  public var enabled: Bool
  public var createdAt: String
  public var updatedAt: String

  public init(
    id: String,
    medicationId: String,
    personId: String,
    doseAmount: Int,
    times: [String],
    startDate: String,
    endDate: String?,
    enabled: Bool,
    createdAt: String,
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

/// 提醒：根据用药配置生成的某一次具体提醒。
public struct Reminder: Identifiable, Codable, Sendable, Equatable {
  public var id: String
  public var planId: String
  public var medicationId: String
  public var personId: String
  /// 提醒日期 YYYY-MM-DD。
  public var date: String
  /// 提醒时间 HH:MM。
  public var time: String
  public var doseAmount: Int
  public var status: ReminderStatus
  /// 「稍后提醒」：把本次通知推迟到该时刻再响 ISO。未设置时按计划时间提醒。
  public var snoozedUntil: String?
  /// 已服用/跳过的处理时间 ISO。
  public var resolvedAt: String?
  public var createdAt: String

  public init(
    id: String,
    planId: String,
    medicationId: String,
    personId: String,
    date: String,
    time: String,
    doseAmount: Int,
    status: ReminderStatus,
    snoozedUntil: String? = nil,
    resolvedAt: String? = nil,
    createdAt: String
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

/// 服用记录：点击「已服用」后产生。
///
/// `personName` / `medicationName` / `time` 是创建时的**快照**，药品或用药人
/// 被删除后历史记录仍可读。`reminderId` / `planId` 可空：孪生页手动点格子记的
/// 服用没有提醒来源。
public struct MedicationUsage: Identifiable, Codable, Sendable, Equatable {
  public var id: String
  /// 来源提醒；手动记录为 `nil`。
  public var reminderId: String?
  /// 来源用药配置；手动记录为 `nil`。
  public var planId: String?
  public var medicationId: String
  public var personId: String
  /// 快照：用药人姓名。
  public var personName: String
  /// 快照：药品名称。
  public var medicationName: String
  /// 快照：计划中的服用时间 "HH:MM"；手动记录为操作时刻。
  public var time: String
  /// 实际服用的数量。
  public var amount: Int
  /// 是否漏服后补记。
  public var late: Bool
  /// 实际服用时间 ISO。
  public var takenAt: String
  public var createdAt: String

  public init(
    id: String,
    reminderId: String?,
    planId: String?,
    medicationId: String,
    personId: String,
    personName: String,
    medicationName: String,
    time: String,
    amount: Int,
    late: Bool,
    takenAt: String,
    createdAt: String
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

/// 药板：一块实体泡罩，板装药数字孪生的单位。
///
/// `rows × cols` 存在板自己身上：补货新建板时按药品规格来，而老板的规格可能
/// 已被用户改过，历史板必须保持自己的几何，否则格子对不上物理药板。
public struct BlisterPack: Identifiable, Codable, Sendable, Equatable {
  public var id: String
  public var medicationId: String
  /// 盒内第几板，从 1 开始。
  public var seq: Int
  public var rows: Int
  public var cols: Int
  public var createdAt: String

  public init(
    id: String,
    medicationId: String,
    seq: Int,
    rows: Int,
    cols: Int,
    createdAt: String
  ) {
    self.id = id
    self.medicationId = medicationId
    self.seq = seq
    self.rows = rows
    self.cols = cols
    self.createdAt = createdAt
  }
}

/// 槽位：泡罩里的一格。`index` 从 0 开始，从左到右、从上到下 —— 消耗顺序与真人
/// 嗑药片的顺序一致（`nextFullSlots` 依赖这个排序）。
public struct BlisterSlot: Identifiable, Codable, Sendable, Equatable, Hashable {
  public var id: String
  public var packId: String
  public var index: Int
  public var status: BlisterSlotStatus
  /// 消耗它的服用记录 id；手动记录 / 历史消耗为 `nil`。
  public var usageId: String?
  /// 消耗时刻 ISO。
  public var consumedAt: String?
  /// 快照：消耗者姓名（与 `MedicationUsage` 的快照策略一致，删用药人不清历史）。
  public var consumedBy: String?

  public init(
    id: String,
    packId: String,
    index: Int,
    status: BlisterSlotStatus,
    usageId: String? = nil,
    consumedAt: String? = nil,
    consumedBy: String? = nil
  ) {
    self.id = id
    self.packId = packId
    self.index = index
    self.status = status
    self.usageId = usageId
    self.consumedAt = consumedAt
    self.consumedBy = consumedBy
  }
}

/// 全局设置偏好。
///
/// 独立于业务实体存在：这些开关影响通知调度，但不属于任何药品或用药人。
/// 默认值必须与数据库 schema 里 settings 各列的默认值保持一致 ——
/// 两边不同就会出现「重启前是 true、重启后变 false」这类只在开发期冒出来的怪问题。
public struct Settings: Codable, Sendable, Equatable {
  /// 总开关：关闭后不再调度任何提醒通知。
  public var notificationsEnabled: Bool
  /// 稍后提醒间隔（分钟）。
  public var snoozeMinutes: Int
  /// 免打扰开始 "HH:MM"，`nil` 表示不启用。
  public var quietStart: String?
  /// 免打扰结束 "HH:MM"，`nil` 表示不启用。
  public var quietEnd: String?
  /// 提醒到达时是否发声 / 震动。
  public var soundEnabled: Bool
  /// 同一成员连续漏服达到该次数时额外提醒；0 表示不提醒。
  public var missedAlertStreak: Int

  public static let defaultValue = Settings(
    notificationsEnabled: true,
    snoozeMinutes: 10,
    quietStart: nil,
    quietEnd: nil,
    soundEnabled: true,
    missedAlertStreak: 2
  )

  public init(
    notificationsEnabled: Bool,
    snoozeMinutes: Int,
    quietStart: String?,
    quietEnd: String?,
    soundEnabled: Bool,
    missedAlertStreak: Int
  ) {
    self.notificationsEnabled = notificationsEnabled
    self.snoozeMinutes = snoozeMinutes
    self.quietStart = quietStart
    self.quietEnd = quietEnd
    self.soundEnabled = soundEnabled
    self.missedAlertStreak = missedAlertStreak
  }
}
