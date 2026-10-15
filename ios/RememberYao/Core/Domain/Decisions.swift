import Foundation

/// 领域层的写操作：全部是「给定涉及的实体 → 算出变更」的纯函数（decision）。
///
/// 这里没有任何 IO：不碰数据库、不碰通知、不碰 UI。每个函数只接收它真正
/// 用到的实体，返回这些实体的新状态；`Store` 负责按增量写进 SwiftData 并
/// 重排通知。好处是每条业务规则都能用普通单元测试覆盖，且与 Android 端
/// 同构的 `Decisions.kt` 可以逐条对齐。
///
/// 与 `docs/domain-spec.md` 第 4 节逐条对应，改这里必须同步改文档。
///
/// 命名约定：`decideXxx` 返回 `nil` / 空 decision 表示「按规则不执行」，
/// 调用方原样放弃即可。

// MARK: - 输入

/// 新建药品的输入。板装药可随药品一并建板（数字孪生），
/// 此时 total / remaining 按板数重算，传入的库存值被忽略。
public struct MedicationInput: Sendable {
  public var name: String
  public var type: MedicationType
  public var category: MedicationCategory
  public var specification: String
  public var unit: MedicationUnit
  public var totalQuantity: Int
  public var remainingQuantity: Int
  public var blisterRows: Int?
  public var blisterCols: Int?
  public var expiryDate: String?
  public var prescription: Bool
  public var notes: String
  /// 板装规格；给了就同时建数字孪生。
  public var blister: BlisterSpec?

  public init(
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
    blister: BlisterSpec? = nil
  ) {
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
    self.blister = blister
  }
}

/// 板装规格。
public struct BlisterSpec: Sendable {
  public var rows: Int
  public var cols: Int
  public var packCount: Int

  public init(rows: Int, cols: Int, packCount: Int) {
    self.rows = rows
    self.cols = cols
    self.packCount = packCount
  }
}

/// 新建用药人的入参。
public struct PersonInput: Sendable {
  public var name: String
  public var gender: Gender?
  public var age: Int?
  public var allergies: [String]
  public var underlyingConditions: [String]
  /// 头像照片本地 URI；`nil` 表示没有照片。
  public var avatarUri: String? = nil

  public init(
    name: String,
    gender: Gender? = nil,
    age: Int? = nil,
    allergies: [String] = [],
    underlyingConditions: [String] = [],
    avatarUri: String? = nil
  ) {
    self.name = name
    self.gender = gender
    self.age = age
    self.allergies = allergies
    self.underlyingConditions = underlyingConditions
    self.avatarUri = avatarUri
  }
}

/// 新建用药配置的入参。
public struct PlanInput: Sendable {
  public var medicationId: String
  public var personId: String
  public var doseAmount: Int
  public var times: [String]
  public var startDate: String
  public var endDate: String?
  public var enabled: Bool

  public init(
    medicationId: String,
    personId: String,
    doseAmount: Int,
    times: [String],
    startDate: String,
    endDate: String? = nil,
    enabled: Bool = true
  ) {
    self.medicationId = medicationId
    self.personId = personId
    self.doseAmount = doseAmount
    self.times = times
    self.startDate = startDate
    self.endDate = endDate
    self.enabled = enabled
  }
}

/// 一条待应用的配置变更：改哪笔、怎么改。
public struct PlanUpdate {
  public var id: String
  public var patch: (inout MedicationPlan) -> Void

  public init(id: String, patch: @escaping (inout MedicationPlan) -> Void) {
    self.id = id
    self.patch = patch
  }
}

/// 一次落多笔用药配置变更（新增 / 更新 / 删除），只重排一次通知。
///
/// 「为一位家人一次配多种药」会同时写好几笔配置。逐笔落库的话，每笔都会触发
/// 一次通知重排（先全部取消再逐条重排），选四种药就闪四次；
/// 这里合成一次，语义与逐笔调用完全一致。
public struct PlanChanges {
  public var add: [PlanInput]
  public var update: [(id: String, patch: (inout MedicationPlan) -> Void)]
  public var remove: [String]

  public init(
    add: [PlanInput] = [],
    update: [(id: String, patch: (inout MedicationPlan) -> Void)] = [],
    remove: [String] = []
  ) {
    self.add = add
    self.update = update
    self.remove = remove
  }
}

// MARK: - 提醒处理

/// 「已服用」的变更集：一条新服用记录 + 提醒结清 + 库存扣减 + 按泡罩顺序
/// 消耗的槽位。
public struct TakeDecision: Sendable {
  public var reminder: Reminder
  public var usage: MedicationUsage
  /// 扣减后的药品；药品已被删除时为 nil（历史记录照记，库存无人可扣）。
  public var medication: Medication?
  /// 被消耗的槽位（已标记 empty 并挂上 usageId）。
  public var consumedSlots: [BlisterSlot]

  public init(
    reminder: Reminder,
    usage: MedicationUsage,
    medication: Medication?,
    consumedSlots: [BlisterSlot]
  ) {
    self.reminder = reminder
    self.usage = usage
    self.medication = medication
    self.consumedSlots = consumedSlots
  }
}

/// 已服用：生成服用记录并扣减库存。待服用和漏服状态都可以补记
/// （漏服补记会标记 late）。
///
/// - Parameters:
///   - ownPacks / ownSlots: 该药品自己的板与槽位（调用方按 medicationId 取）。
public func decideTake(
  _ reminder: Reminder,
  medication: Medication?,
  person: Person?,
  ownPacks: [BlisterPack],
  ownSlots: [BlisterSlot],
  now: String = ISO8601.now()
) -> TakeDecision? {
  guard reminder.status == .pending || reminder.status == .missed else { return nil }
  let usage = MedicationUsage(
    id: ID.generate(),
    reminderId: reminder.id,
    planId: reminder.planId,
    medicationId: reminder.medicationId,
    personId: reminder.personId,
    personName: person?.name ?? Domain.deletedPersonName,
    medicationName: medication?.name ?? Domain.deletedMedicationName,
    time: reminder.time,
    amount: reminder.doseAmount,
    late: reminder.status == .missed,
    takenAt: now,
    createdAt: now
  )
  var updatedReminder = reminder
  updatedReminder.status = .taken
  updatedReminder.resolvedAt = now
  let updatedMedication = medication.map {
    var m = $0
    m.remainingQuantity = max(0, m.remainingQuantity - reminder.doseAmount)
    m.updatedAt = now
    return m
  }
  // 板装孪生：按泡罩顺序消耗槽位。槽位不足时列表为空，库存照扣 ——
  // 提醒闭环永不因孪生数据不完整而阻断
  let targets = nextFullSlots(ownPacks, ownSlots, count: reminder.doseAmount)
  let consumedSlots = targets.map { slot -> BlisterSlot in
    var s = slot
    s.status = .empty
    s.usageId = usage.id
    s.consumedAt = now
    s.consumedBy = usage.personName
    return s
  }
  return TakeDecision(
    reminder: updatedReminder,
    usage: usage,
    medication: updatedMedication,
    consumedSlots: consumedSlots
  )
}

/// 跳过本次提醒（待服用和漏服都可以标记为跳过），不扣减库存。
public func decideSkip(_ reminder: Reminder, now: String = ISO8601.now()) -> Reminder? {
  guard reminder.status == .pending || reminder.status == .missed else { return nil }
  var updated = reminder
  updated.status = .skipped
  updated.resolvedAt = now
  return updated
}

/// 稍后提醒：把通知推迟 minutes 分钟后再次提醒，不改变提醒状态。
///
/// minutes 由调用方从设置里取（`settings.snoozeMinutes`）—— 间隔是全局偏好，
/// 不该在每个界面各写一个默认值。
public func decideSnooze(
  _ reminder: Reminder, minutes: Int, now: Date = Date()
) -> Reminder? {
  guard reminder.status == .pending || reminder.status == .missed else { return nil }
  var updated = reminder
  updated.snoozedUntil = ISO8601.string(now.addingTimeInterval(TimeInterval(minutes * 60)))
  return updated
}

// MARK: - 提醒同步

/// 提醒同步的变更集：补生成 / 标漏服 / 清理。
///
/// 与旧「整表重算」等价，但输出的是增量 —— Store 只动这些行。
public struct ReminderSync {
  public var toInsert: [Reminder]
  public var toUpdate: [Reminder]
  public var toDelete: [Reminder]

  public init(toInsert: [Reminder] = [], toUpdate: [Reminder] = [], toDelete: [Reminder] = []) {
    self.toInsert = toInsert
    self.toUpdate = toUpdate
    self.toDelete = toDelete
  }

  public var isEmpty: Bool {
    toInsert.isEmpty && toUpdate.isEmpty && toDelete.isEmpty
  }
}

/// 同步提醒（幂等）：
/// 1. 为每个生效中的配置生成 今天 ~ 今天+6天 的提醒（按 (planId,date,time) 去重）
/// 2. 超过宽限期仍未处理的 pending 标记为「漏服」
/// 3. 清理 90 天前的提醒（服用记录永久保留，不在这里动）
public func decideReminderSync(
  plans: [MedicationPlan],
  existing: [Reminder],
  today: String = DateKey.today(),
  now: Date = Date()
) -> ReminderSync {
  var seen = Set(existing.map { "\($0.planId)|\($0.date)|\($0.time)" })
  var toInsert: [Reminder] = []

  for plan in plans {
    for offset in 0..<Domain.generateAheadDays {
      let key = DateKey.addDays(today, offset)
      guard plan.isActive(on: key) else { continue }
      for time in plan.times {
        let idKey = "\(plan.id)|\(key)|\(time)"
        guard !seen.contains(idKey) else { continue }
        seen.insert(idKey)
        toInsert.append(
          Reminder(
            id: ID.generate(),
            planId: plan.id,
            medicationId: plan.medicationId,
            personId: plan.personId,
            date: key,
            time: time,
            doseAmount: plan.doseAmount,
            status: .pending,
            createdAt: ISO8601.now()
          ))
      }
    }
  }

  let cutoff = DateKey.addDays(today, -Domain.reminderKeepDays)
  var toUpdate: [Reminder] = []
  var toDelete: [Reminder] = []
  for reminder in existing {
    if reminder.date < cutoff {
      toDelete.append(reminder)
      continue
    }
    if reminder.status == .pending, let miss = reminder.missDate, miss < now {
      var updated = reminder
      updated.status = .missed
      updated.resolvedAt = ISO8601.now()
      toUpdate.append(updated)
    }
  }
  return ReminderSync(toInsert: toInsert, toUpdate: toUpdate, toDelete: toDelete)
}

// MARK: - 用药配置变更

/// 一次配置批量变更的完整变更集。
///
/// 被更新的配置：尚未处理的提醒作废后按新配置重生成（已服用 / 已跳过 /
/// 已漏服作为历史保留）；被删除的配置连提醒一起走。
public struct PlanApply {
  public var plansToUpsert: [MedicationPlan]
  public var planIdsToDelete: [String]
  /// 要删的提醒 id：被删配置的提醒 + 被改配置的 pending 提醒 + 过期清理。
  public var remindersToDelete: [String]
  public var remindersToInsert: [Reminder]
  public var remindersToUpdate: [Reminder]

  public init(
    plansToUpsert: [MedicationPlan] = [],
    planIdsToDelete: [String] = [],
    remindersToDelete: [String] = [],
    remindersToInsert: [Reminder] = [],
    remindersToUpdate: [Reminder] = []
  ) {
    self.plansToUpsert = plansToUpsert
    self.planIdsToDelete = planIdsToDelete
    self.remindersToDelete = remindersToDelete
    self.remindersToInsert = remindersToInsert
    self.remindersToUpdate = remindersToUpdate
  }

  public var isEmpty: Bool {
    plansToUpsert.isEmpty && planIdsToDelete.isEmpty && remindersToDelete.isEmpty
      && remindersToInsert.isEmpty && remindersToUpdate.isEmpty
  }
}

/// 批量应用配置变更：add / update / remove 之后跑一次提醒同步。
///
/// `addPlan` / `updatePlan` / `deletePlan` 都是它的特例（各只有一项）。
public func decideApplyPlanChanges(
  plans: [MedicationPlan],
  reminders: [Reminder],
  changes: PlanChanges,
  today: String = DateKey.today(),
  now: Date = Date()
) -> PlanApply {
  guard !changes.add.isEmpty || !changes.update.isEmpty || !changes.remove.isEmpty else {
    return PlanApply()
  }
  let nowIso = ISO8601.now()
  let updatedIds = Set(changes.update.map(\.id))
  let removedIds = Set(changes.remove)

  let created = changes.add.map { input -> MedicationPlan in
    MedicationPlan(
      id: ID.generate(),
      medicationId: input.medicationId,
      personId: input.personId,
      doseAmount: input.doseAmount,
      times: input.times,
      startDate: input.startDate,
      endDate: input.endDate,
      enabled: input.enabled,
      createdAt: nowIso,
      updatedAt: nowIso
    )
  }

  var plansToUpsert: [MedicationPlan] = created
  plansToUpsert += plans
    .filter { !removedIds.contains($0.id) }
    .map { plan -> MedicationPlan in
      guard let entry = changes.update.first(where: { $0.id == plan.id }) else { return plan }
      var updated = plan
      entry.patch(&updated)
      updated.updatedAt = nowIso
      return updated
    }
  let planIdsToDelete = plans.filter { removedIds.contains($0.id) }.map(\.id)

  // 被删配置的提醒整批走；被改配置只作废尚未处理的（历史保留）
  let invalidated = reminders.filter { reminder in
    removedIds.contains(reminder.planId)
      || (updatedIds.contains(reminder.planId) && reminder.status == .pending)
  }
  let invalidatedIds = Set(invalidated.map(\.id))
  let surviving = reminders.filter { !invalidatedIds.contains($0.id) }

  let sync = decideReminderSync(plans: plansToUpsert, existing: surviving, today: today, now: now)
  let toDelete = Array(invalidatedIds.union(sync.toDelete.map(\.id)))
  return PlanApply(
    plansToUpsert: plansToUpsert,
    planIdsToDelete: planIdsToDelete,
    remindersToDelete: toDelete,
    remindersToInsert: sync.toInsert,
    remindersToUpdate: sync.toUpdate
  )
}

// MARK: - 药品

/// 新建药品的变更集：药品本身 + 可选的数字孪生（板与槽位）。
public struct AddMedicationDecision: Sendable {
  public var medication: Medication
  public var twin: TwinPlan?

  public init(medication: Medication, twin: TwinPlan?) {
    self.medication = medication
    self.twin = twin
  }
}

/// 板装孪生的变更集：一批板 + 一批槽位 + 重写规格后的药品。
///
/// 开孪生（重建）时 Store 先删该药旧板旧格再插这批；补货（追加）时直接插。
public struct TwinPlan: Sendable {
  public var packs: [BlisterPack]
  public var slots: [BlisterSlot]
  public var medication: Medication

  public init(packs: [BlisterPack], slots: [BlisterSlot], medication: Medication) {
    self.packs = packs
    self.slots = slots
    self.medication = medication
  }
}

public func decideAddMedication(
  _ input: MedicationInput, now: String = ISO8601.now()
) -> AddMedicationDecision {
  // 新药没有历史消耗：板装时库存直接按「板数 × 每板粒数」给足，
  // 建板逻辑按 remaining 反推历史格数，此时为 0，所有格子都是满的
  let perPack = input.blister.map { clampSide($0.rows) * clampSide($0.cols) } ?? 0
  let packCount = input.blister.map { max(1, $0.packCount) } ?? 0
  let medication = Medication(
    id: ID.generate(),
    name: input.name,
    type: input.type,
    category: input.category,
    specification: input.specification,
    unit: input.unit,
    totalQuantity: input.blister != nil ? perPack * packCount : input.totalQuantity,
    remainingQuantity: input.blister != nil ? perPack * packCount : input.remainingQuantity,
    blisterRows: input.blisterRows,
    blisterCols: input.blisterCols,
    expiryDate: input.expiryDate,
    prescription: input.prescription,
    notes: input.notes,
    createdAt: now,
    updatedAt: now
  )
  let twin = input.blister.map {
    decideOpenTwin(
      medication, BlisterSpec(rows: $0.rows, cols: $0.cols, packCount: packCount), now: now)
  } ?? nil
  return AddMedicationDecision(medication: medication, twin: twin)
}

/// 更新药品：只覆盖 patch 里改动的字段，updatedAt 刷新为现在。
public func decideUpdateMedication(
  _ medication: Medication, patch: (inout Medication) -> Void, now: String = ISO8601.now()
) -> Medication {
  var updated = medication
  patch(&updated)
  updated.updatedAt = now
  return updated
}

/// 补货：增加总数量与剩余数量。
///
/// 板装药已建孪生时按粒数补货会破坏「Σfull === remainingQuantity」不变式
/// （补进来的药没有对应的槽位），这类药的补货必须走 [decideAppendPacks]
/// 按板补 —— 「有没有孪生」由调用方（Store）查库判断。
public func decideRestock(
  _ medication: Medication, amount: Int, now: String = ISO8601.now()
) -> Medication? {
  guard amount > 0 else { return nil }
  var updated = medication
  updated.totalQuantity += amount
  updated.remainingQuantity += amount
  updated.updatedAt = now
  return updated
}

// MARK: - 用药人

public func decideAddPerson(_ input: PersonInput, now: String = ISO8601.now()) -> Person {
  Person(
    id: ID.generate(),
    name: input.name.trimmingCharacters(in: .whitespacesAndNewlines),
    avatarColor: pickAvatarColor(name: input.name),
    gender: input.gender,
    age: input.age,
    allergies: input.allergies,
    underlyingConditions: input.underlyingConditions,
    createdAt: now,
    avatarUri: input.avatarUri
  )
}

/// 更新用药人基础信息（含改名）。只覆盖传入的字段，未传的保持原值 ——
/// 注意 `nil` 表示「不改」，与实体里「未填写也是 nil」是两回事。
public func decideUpdatePerson(
  _ person: Person,
  name: String? = nil,
  gender: Gender? = nil,
  age: Int? = nil,
  allergies: [String]? = nil,
  underlyingConditions: [String]? = nil
) -> Person {
  var updated = person
  if let name { updated.name = name.trimmingCharacters(in: .whitespacesAndNewlines) }
  if let gender { updated.gender = gender }
  if let age { updated.age = age }
  if let allergies { updated.allergies = allergies }
  if let underlyingConditions { updated.underlyingConditions = underlyingConditions }
  return updated
}

// MARK: - 板装孪生

/// 开启数字孪生：为存量板装药建板，按当前剩余量把历史消耗补成 empty 格。
///
/// 不变式：建板后 Σfull === remainingQuantity，Σ全部格 === 板数 × 每板粒数。
/// 板数至少要装得下当前剩余；`totalQuantity` 重写为真实槽位数 ——
/// 老数据「记了 25 但一板 30」这类账，以物理板为准修正。
public func decideOpenTwin(
  _ medication: Medication, _ input: BlisterSpec, now: String = ISO8601.now()
) -> TwinPlan? {
  guard medication.type == .blister else { return nil }
  let rows = clampSide(input.rows)
  let cols = clampSide(input.cols)
  let perPack = rows * cols
  let packCount = max(
    max(1, input.packCount),
    packsNeeded(medication.remainingQuantity, perPack: perPack))

  // 总格数减剩余 = 已经被吃掉的历史格数，按板序格序从第一格开始标 empty
  // （usageId 为 null，UI 显示「历史消耗 · 无服用记录」）
  var history = packCount * perPack - medication.remainingQuantity
  var packs: [BlisterPack] = []
  var slots: [BlisterSlot] = []
  for seq in 1...packCount {
    let pack = BlisterPack(
      id: ID.generate(), medicationId: medication.id, seq: seq, rows: rows, cols: cols,
      createdAt: now)
    packs.append(pack)
    for index in 0..<perPack {
      slots.append(
        BlisterSlot(
          id: ID.generate(),
          packId: pack.id,
          index: index,
          status: history > 0 ? .empty : .full,
          usageId: nil,
          consumedAt: nil,
          consumedBy: nil
        ))
      if history > 0 { history -= 1 }
    }
  }

  var updated = medication
  updated.blisterRows = rows
  updated.blisterCols = cols
  updated.totalQuantity = packCount * perPack
  updated.updatedAt = now
  return TwinPlan(packs: packs, slots: slots, medication: updated)
}

/// 补货（按板）：追加 count 块满板。板装孪生专用，散装/瓶装走 [decideRestock]。
public func decideAppendPacks(
  _ medication: Medication, existingPacks: [BlisterPack], count: Int, now: String = ISO8601.now()
) -> TwinPlan? {
  guard count > 0 else { return nil }
  let rows = clampSide(medication.blisterRows ?? 1)
  let cols = clampSide(medication.blisterCols ?? 1)
  let perPack = rows * cols
  var nextSeq = existingPacks.reduce(0) { max($0, $1.seq) } + 1
  var packs: [BlisterPack] = []
  var slots: [BlisterSlot] = []

  for _ in 0..<count {
    let pack = BlisterPack(
      id: ID.generate(), medicationId: medication.id, seq: nextSeq, rows: rows, cols: cols,
      createdAt: now)
    nextSeq += 1
    packs.append(pack)
    for index in 0..<perPack {
      slots.append(
        BlisterSlot(
          id: ID.generate(),
          packId: pack.id,
          index: index,
          status: .full,
          usageId: nil,
          consumedAt: nil,
          consumedBy: nil))
    }
  }

  var updated = medication
  updated.totalQuantity += count * perPack
  updated.remainingQuantity += count * perPack
  updated.updatedAt = now
  return TwinPlan(packs: packs, slots: slots, medication: updated)
}

/// 槽位操作的变更集：一条 usage + 槽位新状态 + 药品新库存。
public struct SlotUsageDecision: Sendable {
  public var usage: MedicationUsage
  public var slot: BlisterSlot
  public var medication: Medication

  public init(usage: MedicationUsage, slot: BlisterSlot, medication: Medication) {
    self.usage = usage
    self.slot = slot
    self.medication = medication
  }
}

/// 手动记一次服用（孪生页点格子）：产生一条无提醒来源的 usage 并消耗**这一格**。
///
/// 与 [decideTake] 的按序消耗不同 —— 用户点了哪一格就消耗哪一格：泡罩可以
/// 从任意位置抠开，孪生要镜像用户实际做的事，而不是替他决定。
public func decideConsumeSlot(
  _ slot: BlisterSlot,
  pack: BlisterPack,
  medication: Medication,
  person: Person,
  now: String = ISO8601.now()
) -> SlotUsageDecision? {
  guard slot.status == .full else { return nil }
  let usage = MedicationUsage(
    id: ID.generate(),
    reminderId: nil,
    planId: nil,
    medicationId: medication.id,
    personId: person.id,
    personName: person.name,
    medicationName: medication.name,
    // 手动记录没有计划时间，记操作时刻
    time: Clock.time(Date()),
    amount: 1,
    late: false,
    takenAt: now,
    createdAt: now
  )
  var updatedSlot = slot
  updatedSlot.status = .empty
  updatedSlot.usageId = usage.id
  updatedSlot.consumedAt = now
  updatedSlot.consumedBy = usage.personName
  var updatedMedication = medication
  updatedMedication.remainingQuantity = max(0, updatedMedication.remainingQuantity - 1)
  updatedMedication.updatedAt = now
  return SlotUsageDecision(usage: usage, slot: updatedSlot, medication: updatedMedication)
}

/// 标记槽位损坏 / 遗失：物理上没吃但格子里没药了。不产生服用记录，库存 −1。
public func decideVoidSlot(
  _ slot: BlisterSlot, medication: Medication, now: String = ISO8601.now()
) -> (slot: BlisterSlot, medication: Medication)? {
  guard slot.status == .full else { return nil }
  var updatedSlot = slot
  updatedSlot.status = .void
  updatedSlot.usageId = nil
  updatedSlot.consumedBy = nil
  var updatedMedication = medication
  updatedMedication.remainingQuantity = max(0, updatedMedication.remainingQuantity - 1)
  updatedMedication.updatedAt = now
  return (updatedSlot, updatedMedication)
}

/// 恢复槽位为未服用：void 或历史 empty（无 usage）→ full，库存 +1。
/// 有服用记录的格子必须走 [decideUndoUsage] —— 那条路还要删 usage、回退提醒。
public func decideRestoreSlot(
  _ slot: BlisterSlot, medication: Medication, now: String = ISO8601.now()
) -> (slot: BlisterSlot, medication: Medication)? {
  guard slot.status != .full, slot.usageId == nil else { return nil }
  var updatedSlot = slot
  updatedSlot.status = .full
  updatedSlot.usageId = nil
  updatedSlot.consumedAt = nil
  updatedSlot.consumedBy = nil
  var updatedMedication = medication
  updatedMedication.remainingQuantity = min(
    updatedMedication.totalQuantity, updatedMedication.remainingQuantity + 1)
  updatedMedication.updatedAt = now
  return (updatedSlot, updatedMedication)
}

/// 撤销一次服用的变更集：删 usage、回退提醒、恢复槽位、回补库存。
///
/// 提醒回退到 pending 而非 taken —— 撤销后这次剂量重新进入待处理，
/// 已过宽限期会被 [decideReminderSync] 再次判为漏服（撤销补记不等于没漏过）。
public struct UndoDecision: Sendable {
  /// 要回退的提醒；usage 没有来源提醒时为 nil。
  public var reminder: Reminder?
  /// 恢复成 full 的槽位。
  public var slots: [BlisterSlot]
  /// 回补库存后的药品；药品已删时为 nil。
  public var medication: Medication?

  public init(reminder: Reminder?, slots: [BlisterSlot], medication: Medication?) {
    self.reminder = reminder
    self.slots = slots
    self.medication = medication
  }
}

public func decideUndoUsage(
  _ usage: MedicationUsage,
  reminder: Reminder?,
  linkedSlots: [BlisterSlot],
  medication: Medication?,
  now: String = ISO8601.now()
) -> UndoDecision {
  let updatedReminder = reminder.flatMap { r -> Reminder? in
    guard usage.reminderId != nil, r.status != .pending else { return nil }
    var updated = r
    updated.status = .pending
    updated.resolvedAt = nil
    return updated
  }
  let updatedSlots = linkedSlots.map { slot -> BlisterSlot in
    var s = slot
    s.status = .full
    s.usageId = nil
    s.consumedAt = nil
    s.consumedBy = nil
    return s
  }
  let updatedMedication = medication.map {
    var m = $0
    m.remainingQuantity = min(m.totalQuantity, m.remainingQuantity + usage.amount)
    m.updatedAt = now
    return m
  }
  return UndoDecision(
    reminder: updatedReminder, slots: updatedSlots, medication: updatedMedication)
}

// MARK: - 设置偏好

/// 更新设置偏好。
///
/// 免打扰成对出现：只改一端等于禁用，统一补齐成 nil。
public func decideSettings(current: Settings, patch: (inout Settings) -> Void) -> Settings {
  var settings = current
  patch(&settings)
  if settings.quietStart == nil || settings.quietEnd == nil {
    settings.quietStart = nil
    settings.quietEnd = nil
  }
  return settings
}
