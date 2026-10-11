import Foundation

/// 领域层的全部写操作，都是 `AppData -> AppData` 的纯函数。
///
/// 这里刻意不做任何 IO：不碰数据库、不碰通知、不碰 UI。好处是整套业务规则
/// 可以用普通单元测试覆盖，而 `Store` 只负责「读 → 套用 → 写 → 重排通知」
/// 这一条流水线。新增业务逻辑一律先在这里落成纯函数。
///
/// 与 Expo 版 `src/lib/store.ts` 的 `*In` 函数一一对应，规则不差分毫。

// MARK: - 提醒同步

/// 提前生成的天数（含今天）。
private let generateAheadDays = Domain.generateAheadDays

/// 配置在指定日期是否生效。
private func isActive(_ plan: MedicationPlan, on key: String) -> Bool {
  plan.isActive(on: key)
}

/// 同步提醒（幂等，无变更时返回原引用）：
/// 1. 为每个生效中的配置生成 今天 ~ 今天+6天 的提醒（不重复生成）
/// 2. 超过宽限期仍未处理的提醒标记为「漏服」
/// 3. 清理过早的已处理提醒（服用记录永久保留）
func syncRemindersIn(_ data: AppData) -> AppData {
  let today = DateKey.today()
  var existing = Set(data.reminders.map { "\($0.planId)|\($0.date)|\($0.time)" })
  var newReminders: [Reminder] = []

  for plan in data.plans {
    for offset in 0..<generateAheadDays {
      let key = DateKey.addDays(today, offset)
      guard isActive(plan, on: key) else { continue }
      for time in plan.times {
        let idKey = "\(plan.id)|\(key)|\(time)"
        guard !existing.contains(idKey) else { continue }
        existing.insert(idKey)
        newReminders.append(
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

  let now = Date()
  var missedChanged = false
  let marked = data.reminders.map { reminder -> Reminder in
    guard reminder.status == .pending,
      let miss = reminder.missDate,
      miss < now
    else { return reminder }
    missedChanged = true
    var updated = reminder
    updated.status = .missed
    updated.resolvedAt = ISO8601.now()
    return updated
  }

  let cutoff = DateKey.addDays(today, -Domain.reminderKeepDays)
  let pruned = marked.filter { $0.date >= cutoff }
  let prunedChanged = pruned.count != marked.count

  guard !newReminders.isEmpty || missedChanged || prunedChanged else { return data }
  var result = data
  result.reminders = pruned + newReminders
  return result
}

/// 用给定的 plans / reminders 跑一次提醒同步。`addPlanIn` / `updatePlanIn` /
/// `applyPlanChangesIn` 都走这里，避免「改配置」与「重新生成提醒」两步之间
/// 被别人插入。其余集合（药品 / 用药人 / 槽位…）原样保留。
private func resyncWith(
  plans: [MedicationPlan], reminders: [Reminder], keeping data: AppData
) -> AppData {
  var draft = data
  draft.plans = plans
  draft.reminders = reminders
  return syncRemindersIn(draft)
}

// MARK: - 槽位消耗

/// 消耗指定药品的前 count 个 full 槽位。
///
/// 槽位不足（没建孪生 / 数据对不上）时原样返回 —— 提醒闭环永不因孪生数据
/// 不完整而阻断，库存照扣。
private func consumeSlots(
  _ data: AppData,
  medicationId: String,
  count: Int,
  usageId: String,
  consumedAt: String,
  consumedBy: String
) -> AppData {
  let ownPacks = data.packs.filter { $0.medicationId == medicationId }
  guard !ownPacks.isEmpty else { return data }
  let packIds = Set(ownPacks.map(\.id))
  let targets = nextFullSlots(
    ownPacks, data.blisterSlots.filter { packIds.contains($0.packId) }, count: count)
  guard !targets.isEmpty else { return data }
  let hit = Set(targets.map(\.id))
  var result = data
  result.blisterSlots = data.blisterSlots.map { slot in
    guard hit.contains(slot.id) else { return slot }
    var updated = slot
    updated.status = .empty
    updated.usageId = usageId
    updated.consumedAt = consumedAt
    updated.consumedBy = consumedBy
    return updated
  }
  return result
}

// MARK: - 提醒处理

/// 已服用：生成服用记录并扣减库存。
/// 待服用和漏服状态都可以补记（漏服补记会标记 late）。
func takeReminderIn(_ data: AppData, id: String) -> AppData {
  let takenAt = ISO8601.now()
  guard let reminder = data.reminders.first(where: { $0.id == id }),
    reminder.status == .pending || reminder.status == .missed
  else { return data }

  let medication = data.medications.first { $0.id == reminder.medicationId }
  let person = data.persons.first { $0.id == reminder.personId }
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
    takenAt: takenAt,
    createdAt: takenAt
  )

  var result = data
  result.reminders = data.reminders.map { r in
    guard r.id == id else { return r }
    var updated = r
    updated.status = .taken
    updated.resolvedAt = takenAt
    return updated
  }
  result.usages = [usage] + data.usages
  result.medications = data.medications.map { m in
    guard m.id == reminder.medicationId else { return m }
    var updated = m
    updated.remainingQuantity = max(0, m.remainingQuantity - reminder.doseAmount)
    updated.updatedAt = takenAt
    return updated
  }
  // 板装孪生：按泡罩顺序消耗槽位。槽位不足时 consumeSlots 原样返回，库存照扣
  return consumeSlots(
    result,
    medicationId: reminder.medicationId,
    count: reminder.doseAmount,
    usageId: usage.id,
    consumedAt: takenAt,
    consumedBy: usage.personName
  )
}

/// 稍后提醒：把通知推迟 minutes 分钟后再次提醒，不改变提醒状态。
///
/// minutes 省略时取设置里的 `snoozeMinutes`（设置页可改），所以调用方只需要传 id
/// —— 间隔是全局偏好，不该在每个界面各写一个默认值。
func snoozeReminderIn(_ data: AppData, id: String, minutes: Int? = nil) -> AppData {
  let delay = minutes ?? data.settings.snoozeMinutes
  let until = ISO8601.string(Date().addingTimeInterval(TimeInterval(delay * 60)))
  var result = data
  result.reminders = data.reminders.map { r in
    guard r.id == id, r.status == .pending || r.status == .missed else { return r }
    var updated = r
    updated.snoozedUntil = until
    return updated
  }
  return result
}

/// 跳过本次提醒（待服用和漏服都可以标记为跳过），不扣减库存。
func skipReminderIn(_ data: AppData, id: String) -> AppData {
  let resolvedAt = ISO8601.now()
  var result = data
  result.reminders = data.reminders.map { r in
    guard r.id == id, r.status == .pending || r.status == .missed else { return r }
    var updated = r
    updated.status = .skipped
    updated.resolvedAt = resolvedAt
    return updated
  }
  return result
}

// MARK: - 药品 CRUD

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

func addMedicationIn(_ data: AppData, input: MedicationInput) -> (AppData, Medication) {
  let now = ISO8601.now()
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
  var result = AppData(
    medications: [medication] + data.medications,
    persons: data.persons,
    plans: data.plans,
    reminders: data.reminders,
    usages: data.usages,
    packs: data.packs,
    blisterSlots: data.blisterSlots,
    settings: data.settings
  )
  if let blister = input.blister {
    result = openBlisterTwinIn(
      result, medication.id,
      BlisterSpec(rows: blister.rows, cols: blister.cols, packCount: packCount))
  }
  return (result, medication)
}

func updateMedicationIn(
  _ data: AppData, id: String, patch: (inout Medication) -> Void
) -> AppData {
  let now = ISO8601.now()
  var result = data
  result.medications = data.medications.map { medication in
    guard medication.id == id else { return medication }
    var updated = medication
    patch(&updated)
    updated.updatedAt = now
    return updated
  }
  return result
}

/// 删除药品：级联删除配置、提醒与泡罩孪生；服用记录作为历史永久保留。
func deleteMedicationIn(_ data: AppData, id: String) -> AppData {
  let planIds = Set(data.plans.filter { $0.medicationId == id }.map(\.id))
  let packIds = Set(data.packs.filter { $0.medicationId == id }.map(\.id))
  var result = data
  result.medications = data.medications.filter { $0.id != id }
  result.plans = data.plans.filter { $0.medicationId != id }
  result.reminders = data.reminders.filter { !planIds.contains($0.planId) }
  result.packs = data.packs.filter { $0.medicationId != id }
  result.blisterSlots = data.blisterSlots.filter { !packIds.contains($0.packId) }
  return result
}

/// 补货：增加总数量与剩余数量。
func restockMedicationIn(_ data: AppData, id: String, amount: Int) -> AppData {
  guard amount > 0 else { return data }
  // 板装药已建孪生时按粒数补货会破坏「Σfull === remainingQuantity」不变式
  // （补进来的药没有对应的槽位），这类药的补货必须走 appendBlisterPacks 按板补
  guard !data.packs.contains(where: { $0.medicationId == id }) else { return data }
  return updateMedicationIn(data, id: id) { medication in
    medication.totalQuantity += amount
    medication.remainingQuantity += amount
  }
}

// MARK: - 用药人 CRUD

public struct PersonInput: Sendable {
  public var name: String
  public var gender: Gender?
  public var age: Int?
  public var allergies: [String]
  public var underlyingConditions: [String]

  public init(
    name: String,
    gender: Gender? = nil,
    age: Int? = nil,
    allergies: [String] = [],
    underlyingConditions: [String] = []
  ) {
    self.name = name
    self.gender = gender
    self.age = age
    self.allergies = allergies
    self.underlyingConditions = underlyingConditions
  }
}

func addPersonIn(_ data: AppData, input: PersonInput) -> (AppData, Person) {
  let now = ISO8601.now()
  let person = Person(
    id: ID.generate(),
    name: input.name.trimmingCharacters(in: .whitespacesAndNewlines),
    // 头像底色按姓名 hash 取色：同名同色，稳定，且不受他人增删影响
    avatarColor: pickAvatarColor(name: input.name),
    gender: input.gender,
    age: input.age,
    allergies: input.allergies,
    underlyingConditions: input.underlyingConditions,
    createdAt: now
  )
  var result = data
  result.persons = data.persons + [person]
  return (result, person)
}

/// 更新用药人基础信息（含改名）。只覆盖传入的字段，未传的保持原值 ——
/// 注意 `nil` 表示「不改」，与实体里「未填写也是 nil」是两回事。
func updatePersonIn(
  _ data: AppData, id: String,
  name: String? = nil,
  gender: Gender? = nil,
  age: Int? = nil,
  allergies: [String]? = nil,
  underlyingConditions: [String]? = nil
) -> AppData {
  var result = data
  result.persons = data.persons.map { person in
    guard person.id == id else { return person }
    var updated = person
    if let name { updated.name = name.trimmingCharacters(in: .whitespacesAndNewlines) }
    if let gender { updated.gender = gender }
    if let age { updated.age = age }
    if let allergies { updated.allergies = allergies }
    if let underlyingConditions { updated.underlyingConditions = underlyingConditions }
    return updated
  }
  return result
}

/// 删除用药人：级联删除配置和提醒；服用记录作为历史永久保留。
func deletePersonIn(_ data: AppData, id: String) -> AppData {
  let planIds = Set(data.plans.filter { $0.personId == id }.map(\.id))
  var result = data
  result.persons = data.persons.filter { $0.id != id }
  result.plans = data.plans.filter { $0.personId != id }
  result.reminders = data.reminders.filter { !planIds.contains($0.planId) }
  return result
}

// MARK: - 用药配置 CRUD

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

func addPlanIn(_ data: AppData, input: PlanInput) -> AppData {
  let now = ISO8601.now()
  let plan = MedicationPlan(
    id: ID.generate(),
    medicationId: input.medicationId,
    personId: input.personId,
    doseAmount: input.doseAmount,
    times: input.times,
    startDate: input.startDate,
    endDate: input.endDate,
    enabled: input.enabled,
    createdAt: now,
    updatedAt: now
  )
  return resyncWith(plans: data.plans + [plan], reminders: data.reminders, keeping: data)
}

/// 更新配置：废弃该配置尚未处理的提醒，再按新配置重新生成。
/// 这样修改时间/剂量/停用都会立即反映到未来的提醒上；
/// 已服用/已跳过/已漏服的记录作为历史保留。
func updatePlanIn(_ data: AppData, id: String, patch: (inout MedicationPlan) -> Void) -> AppData {
  let now = ISO8601.now()
  var plans = data.plans
  var found = false
  plans = data.plans.map { plan in
    guard plan.id == id else { return plan }
    found = true
    var updated = plan
    patch(&updated)
    updated.updatedAt = now
    return updated
  }
  guard found else { return data }
  let reminders = data.reminders.filter { !($0.planId == id && $0.status == .pending) }
  return resyncWith(plans: plans, reminders: reminders, keeping: data)
}

/// 删除配置：删除其提醒；服用记录作为历史永久保留。
func deletePlanIn(_ data: AppData, id: String) -> AppData {
  var result = data
  result.plans = data.plans.filter { $0.id != id }
  result.reminders = data.reminders.filter { $0.planId != id }
  return result
}

/// 一次落多笔用药配置变更（新增 / 更新 / 删除），只重排一次通知。
///
/// 「为一位家人一次配多种药」会同时写好几笔配置。逐笔落库的话，每笔都会触发
/// 一次全量通知重排（先 cancelAll 再逐条重排），选四种药就闪四次；
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

func applyPlanChangesIn(_ data: AppData, changes: PlanChanges) -> AppData {
  guard !changes.add.isEmpty || !changes.update.isEmpty || !changes.remove.isEmpty
  else { return data }
  let now = ISO8601.now()
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
      createdAt: now,
      updatedAt: now
    )
  }

  var plans = data.plans
    .filter { !removedIds.contains($0.id) }
    .map { plan -> MedicationPlan in
      guard let entry = changes.update.first(where: { $0.id == plan.id }) else { return plan }
      var updated = plan
      entry.patch(&updated)
      updated.updatedAt = now
      return updated
    }
  plans.append(contentsOf: created)

  // 被改的配置：尚未处理的提醒作废，交给 syncReminders 按新配置重生成
  // （已服用 / 已跳过 / 已漏服作为历史保留，同 updatePlan）；
  // 被删的配置连提醒一起走（同 deletePlan）
  let reminders = data.reminders.filter { reminder in
    !removedIds.contains(reminder.planId)
      && !(updatedIds.contains(reminder.planId) && reminder.status == .pending)
  }
  return resyncWith(plans: plans, reminders: reminders, keeping: data)
}

// MARK: - 泡罩孪生

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

/// 开启数字孪生：为存量板装药建板，按当前剩余量把历史消耗补成 empty 格。
///
/// 不变式：建板后 Σfull === remainingQuantity，Σ全部格 === 板数 × 每板粒数。
/// 板数至少要装得下当前剩余；`totalQuantity` 重写为真实槽位数 ——
/// 老数据「记了 25 但一板 30」这类账，以物理板为准修正。
func openBlisterTwinIn(_ data: AppData, _ medicationId: String, _ input: BlisterSpec) -> AppData
{
  guard let medication = data.medications.first(where: { $0.id == medicationId }),
    medication.type == .blister
  else { return data }
  let rows = clampSide(input.rows)
  let cols = clampSide(input.cols)
  let perPack = rows * cols
  let packCount = max(
    max(1, input.packCount),
    Int((Double(medication.remainingQuantity) / Double(perPack)).rounded(.up)))

  // 重复开启 = 重建：先清掉该药旧的板与格
  let stalePackIds = Set(data.packs.filter { $0.medicationId == medicationId }.map(\.id))
  var packs = data.packs.filter { !stalePackIds.contains($0.id) }
  var blisterSlots = data.blisterSlots.filter { !stalePackIds.contains($0.packId) }
  let now = ISO8601.now()

  // 总格数减剩余 = 已经被吃掉的历史格数，按板序格序从第一格开始标 empty
  // （usageId 为 null，UI 显示「历史消耗 · 无服用记录」）
  var history = packCount * perPack - medication.remainingQuantity
  for seq in 1...packCount {
    let pack = BlisterPack(
      id: ID.generate(), medicationId: medicationId, seq: seq, rows: rows, cols: cols,
      createdAt: now)
    packs.append(pack)
    for index in 0..<perPack {
      blisterSlots.append(
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

  var result = data
  result.packs = packs
  result.blisterSlots = blisterSlots
  result.medications = data.medications.map { m in
    guard m.id == medicationId else { return m }
    var updated = m
    updated.blisterRows = rows
    updated.blisterCols = cols
    updated.totalQuantity = packCount * perPack
    updated.updatedAt = now
    return updated
  }
  return result
}

/// 补货（按板）：追加 count 块满板。板装孪生专用，散装/瓶装走 restockMedication。
func appendBlisterPacksIn(_ data: AppData, medicationId: String, count: Int) -> AppData {
  guard count > 0, let medication = data.medications.first(where: { $0.id == medicationId })
  else { return data }
  let rows = clampSide(medication.blisterRows ?? 1)
  let cols = clampSide(medication.blisterCols ?? 1)
  let perPack = rows * cols
  let own = data.packs.filter { $0.medicationId == medicationId }
  var nextSeq = own.reduce(0) { max($0, $1.seq) } + 1
  let now = ISO8601.now()
  var packs = data.packs
  var blisterSlots = data.blisterSlots

  for _ in 0..<count {
    let pack = BlisterPack(
      id: ID.generate(), medicationId: medicationId, seq: nextSeq, rows: rows, cols: cols,
      createdAt: now)
    nextSeq += 1
    packs.append(pack)
    for index in 0..<perPack {
      blisterSlots.append(
        BlisterSlot(
          id: ID.generate(), packId: pack.id, index: index, status: .full,
          usageId: nil, consumedAt: nil, consumedBy: nil))
    }
  }

  var result = data
  result.packs = packs
  result.blisterSlots = blisterSlots
  result.medications = data.medications.map { m in
    guard m.id == medicationId else { return m }
    var updated = m
    updated.totalQuantity += count * perPack
    updated.remainingQuantity += count * perPack
    updated.updatedAt = now
    return updated
  }
  return result
}

/// 手动记一次服用（孪生页点格子）：产生一条无提醒来源的 usage 并消耗**这一格**。
///
/// 与 `takeReminder` 的按序消耗不同 —— 用户点了哪一格就消耗哪一格：泡罩可以
/// 从任意位置抠开，孪生要镜像用户实际做的事，而不是替他决定。
func consumeBlisterSlotIn(_ data: AppData, slotId: String, personId: String) -> AppData {
  guard let slot = data.blisterSlots.first(where: { $0.id == slotId }),
    slot.status == .full,
    let pack = data.packs.first(where: { $0.id == slot.packId }),
    let medication = data.medications.first(where: { $0.id == pack.medicationId }),
    let person = data.persons.first(where: { $0.id == personId })
  else { return data }
  let now = ISO8601.now()
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
  var result = data
  result.usages = [usage] + data.usages
  result.blisterSlots = data.blisterSlots.map { s in
    guard s.id == slotId else { return s }
    var updated = s
    updated.status = .empty
    updated.usageId = usage.id
    updated.consumedAt = now
    updated.consumedBy = usage.personName
    return updated
  }
  result.medications = data.medications.map { m in
    guard m.id == medication.id else { return m }
    var updated = m
    updated.remainingQuantity = max(0, m.remainingQuantity - 1)
    updated.updatedAt = now
    return updated
  }
  return result
}

/// 标记槽位损坏 / 遗失：物理上没吃但格子里没药了。不产生服用记录，库存 −1。
func voidBlisterSlotIn(_ data: AppData, slotId: String) -> AppData {
  guard let slot = data.blisterSlots.first(where: { $0.id == slotId }),
    slot.status == .full,
    let pack = data.packs.first(where: { $0.id == slot.packId })
  else { return data }
  let now = ISO8601.now()
  var result = data
  result.blisterSlots = data.blisterSlots.map { s in
    guard s.id == slotId else { return s }
    var updated = s
    updated.status = .void
    updated.usageId = nil
    updated.consumedBy = nil
    return updated
  }
  result.medications = data.medications.map { m in
    guard m.id == pack.medicationId else { return m }
    var updated = m
    updated.remainingQuantity = max(0, m.remainingQuantity - 1)
    updated.updatedAt = now
    return updated
  }
  return result
}

/// 恢复槽位为未服用：void 或历史 empty（无 usage）→ full，库存 +1。
/// 有服用记录的格子必须走 `undoUsage` —— 那条路还要删 usage、回退提醒。
func restoreBlisterSlotIn(_ data: AppData, slotId: String) -> AppData {
  guard let slot = data.blisterSlots.first(where: { $0.id == slotId }),
    slot.status != .full,
    slot.usageId == nil,
    let pack = data.packs.first(where: { $0.id == slot.packId })
  else { return data }
  let now = ISO8601.now()
  var result = data
  result.blisterSlots = data.blisterSlots.map { s in
    guard s.id == slotId else { return s }
    var updated = s
    updated.status = .full
    updated.usageId = nil
    updated.consumedAt = nil
    updated.consumedBy = nil
    return updated
  }
  result.medications = data.medications.map { m in
    guard m.id == pack.medicationId else { return m }
    var updated = m
    updated.remainingQuantity = min(m.totalQuantity, m.remainingQuantity + 1)
    updated.updatedAt = now
    return updated
  }
  return result
}

/// 撤销一次服用：删 usage、回退提醒状态、恢复槽位、回补库存。
///
/// 提醒回退到 pending 而非 taken —— 撤销后这次剂量重新进入待处理，
/// 已过宽限期会被 `syncReminders` 再次判为漏服（撤销补记不等于没漏过）。
func undoUsageIn(_ data: AppData, usageId: String) -> AppData {
  guard let usage = data.usages.first(where: { $0.id == usageId }) else { return data }
  let now = ISO8601.now()
  let hit = Set(data.blisterSlots.filter { $0.usageId == usageId }.map(\.id))

  var result = data
  result.reminders = data.reminders.map { r in
    guard let reminderId = usage.reminderId, r.id == reminderId, r.status != .pending
    else { return r }
    var updated = r
    updated.status = .pending
    updated.resolvedAt = nil
    return updated
  }
  result.blisterSlots = data.blisterSlots.map { s in
    guard hit.contains(s.id) else { return s }
    var updated = s
    updated.status = .full
    updated.usageId = nil
    updated.consumedAt = nil
    updated.consumedBy = nil
    return updated
  }
  result.medications = data.medications.map { m in
    guard m.id == usage.medicationId else { return m }
    var updated = m
    updated.remainingQuantity = min(m.totalQuantity, m.remainingQuantity + usage.amount)
    updated.updatedAt = now
    return updated
  }
  result.usages = data.usages.filter { $0.id != usageId }
  return result
}

// MARK: - 设置偏好

/// 更新设置偏好。
func updateSettingsIn(_ data: AppData, patch: (inout Settings) -> Void) -> AppData {
  var result = data
  var settings = data.settings
  patch(&settings)
  // 免打扰成对出现：只改一端等于禁用，统一补齐成 nil
  if settings.quietStart == nil || settings.quietEnd == nil {
    settings.quietStart = nil
    settings.quietEnd = nil
  }
  result.settings = settings
  return result
}
