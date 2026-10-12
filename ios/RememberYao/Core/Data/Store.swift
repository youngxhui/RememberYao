import Foundation
import Observation
import SwiftData

/// [Repository] 的唯一实现。
///
/// 数据库是唯一真相源：读按集合拉取，写只动涉及的实体（增量落库），
/// 写完重排通知。全部操作在主 actor 上同步执行，天然串行 —— 不需要
/// 旧的「快照投影 + Task 链」那套并发机制。
///
/// 每个写操作的流程一致：开一个 [ModelContext] → 只取这次用到的实体 →
/// 套领域层 decision → 改 / 插 / 删这些实体 → save → 重排通知。
public final class Store: Repository {

  /// 当前全量数据是否已载入过。
  public private(set) var loading = true

  private let container: ModelContainer

  public init(container: ModelContainer) {
    self.container = container
  }

  /// 每次写操作开一个新 context：SwiftData 的 context 不是线程/ actor 安全的，
  /// 短生命周期的 context 只装这次涉及的实体，改哪些存哪些。
  private func makeContext() -> ModelContext {
    ModelContext(container)
  }

  // MARK: - 读取（按集合拉取）

  public func fetchMedications() async -> [Medication] {
    let context = makeContext()
    let rows = (try? context.fetch(FetchDescriptor<MedicationEntity>())) ?? []
    return rows.map(Medication.init)
  }

  public func fetchPersons() async -> [Person] {
    let context = makeContext()
    let rows = (try? context.fetch(FetchDescriptor<PersonEntity>())) ?? []
    return rows.map(Person.init)
  }

  public func fetchPlans() async -> [MedicationPlan] {
    let context = makeContext()
    let rows = (try? context.fetch(FetchDescriptor<PlanEntity>())) ?? []
    return rows.map(MedicationPlan.init)
  }

  public func fetchReminders() async -> [Reminder] {
    let context = makeContext()
    let rows = (try? context.fetch(FetchDescriptor<ReminderEntity>())) ?? []
    return rows.map(Reminder.init)
  }

  public func fetchUsages() async -> [MedicationUsage] {
    let context = makeContext()
    let rows = (try? context.fetch(FetchDescriptor<UsageEntity>())) ?? []
    return rows.map(MedicationUsage.init)
  }

  public func fetchPacks() async -> [BlisterPack] {
    let context = makeContext()
    let rows = (try? context.fetch(FetchDescriptor<PackEntity>())) ?? []
    return rows.map(BlisterPack.init)
  }

  public func fetchBlisterSlots() async -> [BlisterSlot] {
    let context = makeContext()
    let rows = (try? context.fetch(FetchDescriptor<BlisterSlotEntity>())) ?? []
    return rows.map(BlisterSlot.init)
  }

  public func fetchSettings() async -> Settings {
    let context = makeContext()
    let rows = (try? context.fetch(FetchDescriptor<SettingsEntity>())) ?? []
    return rows.first.map(Settings.init) ?? .defaultValue
  }

  public func scheduleInput() async -> ScheduleInput {
    let context = makeContext()
    let reminders = (try? context.fetch(FetchDescriptor<ReminderEntity>())) ?? []
    let settings = (try? context.fetch(FetchDescriptor<SettingsEntity>())) ?? []
    let medications = (try? context.fetch(FetchDescriptor<MedicationEntity>())) ?? []
    let persons = (try? context.fetch(FetchDescriptor<PersonEntity>())) ?? []
    return ScheduleInput(
      reminders: reminders.map(Reminder.init),
      settings: settings.first.map(Settings.init) ?? .defaultValue,
      medications: medications.map(Medication.init),
      persons: persons.map(Person.init)
    )
  }

  // MARK: - 生命周期

  public func load() async {
    syncRemindersIncremental()
    await NotificationScheduler.shared.resync()
    loading = false
  }

  public func reload() async {
    syncRemindersIncremental()
    await NotificationScheduler.shared.resync()
  }

  /// 幂等补齐 / 标记 / 清理提醒，只动变化的行。
  private func syncRemindersIncremental() {
    let context = makeContext()
    let planRows = (try? context.fetch(FetchDescriptor<PlanEntity>())) ?? []
    let reminderRows = (try? context.fetch(FetchDescriptor<ReminderEntity>())) ?? []
    let decision = decideReminderSync(
      plans: planRows.map(MedicationPlan.init),
      existing: reminderRows.map(Reminder.init)
    )
    guard !decision.isEmpty else { return }
    for reminder in decision.toDelete {
      if let entity = reminderRows.first(where: { $0.id == reminder.id }) {
        context.delete(entity)
      }
    }
    for reminder in decision.toUpdate {
      if let entity = reminderRows.first(where: { $0.id == reminder.id }) {
        apply(reminder, to: entity)
      }
    }
    for reminder in decision.toInsert {
      context.insert(makeReminderEntity(reminder))
    }
    try? context.save()
  }

  // MARK: - 写入总口

  /// 落库 + 重排通知。全部写操作在主 actor 上同步执行，天然串行。
  private func commit(_ context: ModelContext) async {
    try? context.save()
    await NotificationScheduler.shared.resync()
  }

  // MARK: - 提醒处理

  public func take(_ reminderId: String) async {
    let context = makeContext()
    guard let entity = reminderEntity(reminderId, in: context) else { return }
    let reminder = Reminder(entity)
    let medicationEntity = medicationEntity(reminder.medicationId, in: context)
    let personEntity = personEntity(reminder.personId, in: context)
    let packRows = packEntities(medicationId: reminder.medicationId, in: context)
    let slotRows = slotEntities(packIds: packRows.map(\.id), in: context)
    guard
      let decision = decideTake(
        reminder,
        medication: medicationEntity.map(Medication.init),
        person: personEntity.map(Person.init),
        ownPacks: packRows.map(BlisterPack.init),
        ownSlots: slotRows.map(BlisterSlot.init)
      )
    else { return }
    entity.status = decision.reminder.status.rawValue
    entity.resolvedAt = decision.reminder.resolvedAt
    context.insert(makeUsageEntity(decision.usage))
    if let medication = decision.medication, let medicationEntity {
      apply(medication, to: medicationEntity)
    }
    for slot in decision.consumedSlots {
      if let slotEntity = slotRows.first(where: { $0.id == slot.id }) {
        apply(slot, to: slotEntity)
      }
    }
    await commit(context)
  }

  public func skip(_ reminderId: String) async {
    let context = makeContext()
    guard let entity = reminderEntity(reminderId, in: context) else { return }
    guard let decision = decideSkip(Reminder(entity)) else { return }
    entity.status = decision.status.rawValue
    entity.resolvedAt = decision.resolvedAt
    await commit(context)
  }

  public func snooze(_ reminderId: String, minutes: Int?) async {
    let context = makeContext()
    guard let entity = reminderEntity(reminderId, in: context) else { return }
    let settingsRow = (try? context.fetch(FetchDescriptor<SettingsEntity>()))?.first
    // 间隔是全局偏好：调用方不传时取设置里的值
    let delay = minutes ?? settingsRow.map(Settings.init)?.snoozeMinutes ?? Settings.defaultValue.snoozeMinutes
    guard let decision = decideSnooze(Reminder(entity), minutes: delay) else { return }
    entity.snoozedUntil = decision.snoozedUntil
    await commit(context)
  }

  // MARK: - 药品

  public func addMedication(_ input: MedicationInput) async -> Medication {
    let context = makeContext()
    let decision = decideAddMedication(input)
    context.insert(makeMedicationEntity(decision.medication))
    if let twin = decision.twin {
      for pack in twin.packs { context.insert(makePackEntity(pack)) }
      for slot in twin.slots { context.insert(makeSlotEntity(slot)) }
    }
    await commit(context)
    return decision.medication
  }

  public func updateMedication(id: String, patch: @escaping (inout Medication) -> Void) async {
    let context = makeContext()
    guard let entity = medicationEntity(id, in: context) else { return }
    let decision = decideUpdateMedication(Medication(entity), patch: patch)
    apply(decision, to: entity)
    await commit(context)
  }

  /// 删除药品：级联删除配置、提醒与泡罩孪生；服用记录作为历史永久保留。
  public func deleteMedication(id: String) async {
    let context = makeContext()
    let planRows = planEntities(medicationId: id, in: context)
    let packRows = packEntities(medicationId: id, in: context)
    for reminder in reminderEntities(planIds: planRows.map(\.id), in: context) {
      context.delete(reminder)
    }
    for slot in slotEntities(packIds: packRows.map(\.id), in: context) {
      context.delete(slot)
    }
    for pack in packRows { context.delete(pack) }
    for plan in planRows { context.delete(plan) }
    if let entity = medicationEntity(id, in: context) { context.delete(entity) }
    await commit(context)
  }

  public func restockMedication(id: String, amount: Int) async {
    let context = makeContext()
    guard let entity = medicationEntity(id, in: context) else { return }
    // 板装药已建孪生时按粒数补货会破坏「Σfull === remainingQuantity」不变式
    // （补进来的药没有对应的槽位），这类药的补货必须走 appendBlisterPacks 按板补
    guard packEntities(medicationId: id, in: context).isEmpty else { return }
    guard let decision = decideRestock(Medication(entity), amount: amount) else { return }
    apply(decision, to: entity)
    await commit(context)
  }

  // MARK: - 用药人

  public func addPerson(_ input: PersonInput) async -> Person {
    let context = makeContext()
    let person = decideAddPerson(input)
    context.insert(makePersonEntity(person))
    await commit(context)
    return person
  }

  public func updatePerson(
    id: String, name: String?, gender: Gender?,
    age: Int?, allergies: [String]?, underlyingConditions: [String]?
  ) async {
    let context = makeContext()
    guard let entity = personEntity(id, in: context) else { return }
    let decision = decideUpdatePerson(
      Person(entity),
      name: name, gender: gender, age: age,
      allergies: allergies, underlyingConditions: underlyingConditions
    )
    apply(decision, to: entity)
    await commit(context)
  }

  /// 删除用药人：级联删除配置和提醒；服用记录作为历史永久保留。
  public func deletePerson(id: String) async {
    let context = makeContext()
    let planRows = planEntities(personId: id, in: context)
    for reminder in reminderEntities(planIds: planRows.map(\.id), in: context) {
      context.delete(reminder)
    }
    for plan in planRows { context.delete(plan) }
    if let entity = personEntity(id, in: context) { context.delete(entity) }
    await commit(context)
  }

  // MARK: - 用药配置

  public func addPlan(_ input: PlanInput) async {
    await applyPlanChanges(PlanChanges(add: [input]))
  }

  public func updatePlan(id: String, patch: @escaping (inout MedicationPlan) -> Void) async {
    await applyPlanChanges(PlanChanges(update: [(id, patch)]))
  }

  public func deletePlan(id: String) async {
    await applyPlanChanges(PlanChanges(remove: [id]))
  }

  public func applyPlanChanges(_ changes: PlanChanges) async {
    let context = makeContext()
    let planRows = (try? context.fetch(FetchDescriptor<PlanEntity>())) ?? []
    let reminderRows = (try? context.fetch(FetchDescriptor<ReminderEntity>())) ?? []
    let decision = decideApplyPlanChanges(
      plans: planRows.map(MedicationPlan.init),
      reminders: reminderRows.map(Reminder.init),
      changes: changes
    )
    guard !decision.isEmpty else { return }
    for plan in planRows where decision.planIdsToDelete.contains(plan.id) {
      context.delete(plan)
    }
    for plan in decision.plansToUpsert {
      if let entity = planRows.first(where: { $0.id == plan.id }) {
        apply(plan, to: entity)
      } else {
        context.insert(makePlanEntity(plan))
      }
    }
    let deleteIds = Set(decision.remindersToDelete)
    for reminder in reminderRows where deleteIds.contains(reminder.id) {
      context.delete(reminder)
    }
    for reminder in decision.remindersToUpdate {
      if let entity = reminderRows.first(where: { $0.id == reminder.id }) {
        apply(reminder, to: entity)
      }
    }
    for reminder in decision.remindersToInsert {
      context.insert(makeReminderEntity(reminder))
    }
    await commit(context)
  }

  // MARK: - 板装孪生

  public func openBlisterTwin(_ medicationId: String, spec: BlisterSpec) async {
    let context = makeContext()
    guard let entity = medicationEntity(medicationId, in: context) else { return }
    guard let twin = decideOpenTwin(Medication(entity), spec) else { return }
    // 重复开启 = 重建：先清掉该药旧的板与格
    let stalePackRows = packEntities(medicationId: medicationId, in: context)
    for slot in slotEntities(packIds: stalePackRows.map(\.id), in: context) {
      context.delete(slot)
    }
    for pack in stalePackRows { context.delete(pack) }
    for pack in twin.packs { context.insert(makePackEntity(pack)) }
    for slot in twin.slots { context.insert(makeSlotEntity(slot)) }
    apply(twin.medication, to: entity)
    await commit(context)
  }

  public func appendBlisterPacks(_ medicationId: String, count: Int) async {
    let context = makeContext()
    guard let entity = medicationEntity(medicationId, in: context) else { return }
    let packRows = packEntities(medicationId: medicationId, in: context)
    guard
      let twin = decideAppendPacks(
        Medication(entity),
        existingPacks: packRows.map(BlisterPack.init),
        count: count
      )
    else { return }
    for pack in twin.packs { context.insert(makePackEntity(pack)) }
    for slot in twin.slots { context.insert(makeSlotEntity(slot)) }
    apply(twin.medication, to: entity)
    await commit(context)
  }

  public func consumeBlisterSlot(_ slotId: String, personId: String) async {
    let context = makeContext()
    guard let slotEntity = slotEntity(slotId, in: context) else { return }
    guard let packEntity = packEntity(slotEntity.packId, in: context) else { return }
    guard let medicationRow = medicationEntity(packEntity.medicationId, in: context) else { return }
    guard let personRow = personEntity(personId, in: context) else { return }
    guard
      let decision = decideConsumeSlot(
        BlisterSlot(slotEntity),
        pack: BlisterPack(packEntity),
        medication: Medication(medicationRow),
        person: Person(personRow)
      )
    else { return }
    apply(decision.slot, to: slotEntity)
    context.insert(makeUsageEntity(decision.usage))
    apply(decision.medication, to: medicationRow)
    await commit(context)
  }

  public func voidBlisterSlot(_ slotId: String) async {
    let context = makeContext()
    guard let slotEntity = slotEntity(slotId, in: context) else { return }
    guard let packEntity = packEntity(slotEntity.packId, in: context) else { return }
    guard let medicationRow = medicationEntity(packEntity.medicationId, in: context) else { return }
    guard
      let decision = decideVoidSlot(BlisterSlot(slotEntity), medication: Medication(medicationRow))
    else { return }
    apply(decision.slot, to: slotEntity)
    apply(decision.medication, to: medicationRow)
    await commit(context)
  }

  public func restoreBlisterSlot(_ slotId: String) async {
    let context = makeContext()
    guard let slotEntity = slotEntity(slotId, in: context) else { return }
    guard let packEntity = packEntity(slotEntity.packId, in: context) else { return }
    guard let medicationRow = medicationEntity(packEntity.medicationId, in: context) else { return }
    guard
      let decision = decideRestoreSlot(BlisterSlot(slotEntity), medication: Medication(medicationRow))
    else { return }
    apply(decision.slot, to: slotEntity)
    apply(decision.medication, to: medicationRow)
    await commit(context)
  }

  public func undoUsage(_ usageId: String) async {
    let context = makeContext()
    guard let usageEntity = usageEntity(usageId, in: context) else { return }
    let usage = MedicationUsage(usageEntity)
    let medicationRow = medicationEntity(usage.medicationId, in: context)
    let reminderRow = usage.reminderId.flatMap { reminderEntity($0, in: context) }
    let slotRows = slotEntities(usageId: usageId, in: context)
    let decision = decideUndoUsage(
      usage,
      reminder: reminderRow.map(Reminder.init),
      linkedSlots: slotRows.map(BlisterSlot.init),
      medication: medicationRow.map(Medication.init)
    )
    context.delete(usageEntity)
    if let reminder = decision.reminder, let reminderRow {
      apply(reminder, to: reminderRow)
    }
    for slot in decision.slots {
      if let slotEntity = slotRows.first(where: { $0.id == slot.id }) {
        apply(slot, to: slotEntity)
      }
    }
    if let medication = decision.medication, let medicationRow {
      apply(medication, to: medicationRow)
    }
    await commit(context)
  }

  // MARK: - 设置

  public func updateSettings(patch: @escaping (inout Settings) -> Void) async {
    let context = makeContext()
    let rows = (try? context.fetch(FetchDescriptor<SettingsEntity>())) ?? []
    let current = rows.first.map(Settings.init) ?? .defaultValue
    let decision = decideSettings(current: current, patch: patch)
    if let row = rows.first {
      row.notificationsEnabled = decision.notificationsEnabled
      row.snoozeMinutes = decision.snoozeMinutes
      row.quietStart = decision.quietStart
      row.quietEnd = decision.quietEnd
      row.soundEnabled = decision.soundEnabled
      row.missedAlertStreak = decision.missedAlertStreak
    } else {
      context.insert(
        SettingsEntity(
          notificationsEnabled: decision.notificationsEnabled,
          snoozeMinutes: decision.snoozeMinutes,
          quietStart: decision.quietStart,
          quietEnd: decision.quietEnd,
          soundEnabled: decision.soundEnabled,
          missedAlertStreak: decision.missedAlertStreak
        ))
    }
    await commit(context)
  }

  // MARK: - 实体查询（只取这次用到的行）

  private func reminderEntity(_ id: String, in context: ModelContext) -> ReminderEntity? {
    let descriptor = FetchDescriptor<ReminderEntity>(predicate: #Predicate { $0.id == id })
    return try? context.fetch(descriptor).first
  }

  private func medicationEntity(_ id: String, in context: ModelContext) -> MedicationEntity? {
    let descriptor = FetchDescriptor<MedicationEntity>(predicate: #Predicate { $0.id == id })
    return try? context.fetch(descriptor).first
  }

  private func personEntity(_ id: String, in context: ModelContext) -> PersonEntity? {
    let descriptor = FetchDescriptor<PersonEntity>(predicate: #Predicate { $0.id == id })
    return try? context.fetch(descriptor).first
  }

  private func packEntity(_ id: String, in context: ModelContext) -> PackEntity? {
    let descriptor = FetchDescriptor<PackEntity>(predicate: #Predicate { $0.id == id })
    return try? context.fetch(descriptor).first
  }

  private func slotEntity(_ id: String, in context: ModelContext) -> BlisterSlotEntity? {
    let descriptor = FetchDescriptor<BlisterSlotEntity>(predicate: #Predicate { $0.id == id })
    return try? context.fetch(descriptor).first
  }

  private func usageEntity(_ id: String, in context: ModelContext) -> UsageEntity? {
    let descriptor = FetchDescriptor<UsageEntity>(predicate: #Predicate { $0.id == id })
    return try? context.fetch(descriptor).first
  }

  private func planEntities(medicationId: String, in context: ModelContext) -> [PlanEntity] {
    let descriptor = FetchDescriptor<PlanEntity>(
      predicate: #Predicate { $0.medicationId == medicationId })
    return (try? context.fetch(descriptor)) ?? []
  }

  private func planEntities(personId: String, in context: ModelContext) -> [PlanEntity] {
    let descriptor = FetchDescriptor<PlanEntity>(
      predicate: #Predicate { $0.personId == personId })
    return (try? context.fetch(descriptor)) ?? []
  }

  private func packEntities(medicationId: String, in context: ModelContext) -> [PackEntity] {
    let descriptor = FetchDescriptor<PackEntity>(
      predicate: #Predicate { $0.medicationId == medicationId })
    return (try? context.fetch(descriptor)) ?? []
  }

  /// 按板取槽位。板数有上限（补货 ≤ 20 板），逐板查比全表扫省。
  private func slotEntities(packIds: [String], in context: ModelContext) -> [BlisterSlotEntity] {
    var result: [BlisterSlotEntity] = []
    for packId in packIds {
      let descriptor = FetchDescriptor<BlisterSlotEntity>(
        predicate: #Predicate { $0.packId == packId })
      result += (try? context.fetch(descriptor)) ?? []
    }
    return result
  }

  private func reminderEntities(planIds: [String], in context: ModelContext) -> [ReminderEntity] {
    var result: [ReminderEntity] = []
    for planId in planIds {
      let descriptor = FetchDescriptor<ReminderEntity>(
        predicate: #Predicate { $0.planId == planId })
      result += (try? context.fetch(descriptor)) ?? []
    }
    return result
  }

  private func slotEntities(usageId: String, in context: ModelContext) -> [BlisterSlotEntity] {
    let rows = (try? context.fetch(FetchDescriptor<BlisterSlotEntity>())) ?? []
    return rows.filter { $0.usageId == usageId }
  }

  // MARK: - 实体写入（领域值 → 实体，只碰这些字段）

  private func makeMedicationEntity(_ m: Medication) -> MedicationEntity {
    MedicationEntity(
      id: m.id, name: m.name, type: m.type.rawValue, category: m.category.rawValue,
      specification: m.specification, unit: m.unit.rawValue,
      totalQuantity: m.totalQuantity, remainingQuantity: m.remainingQuantity,
      blisterRows: m.blisterRows, blisterCols: m.blisterCols,
      expiryDate: m.expiryDate, prescription: m.prescription, notes: m.notes,
      createdAt: m.createdAt, updatedAt: m.updatedAt)
  }

  private func apply(_ m: Medication, to entity: MedicationEntity) {
    entity.name = m.name
    entity.type = m.type.rawValue
    entity.category = m.category.rawValue
    entity.specification = m.specification
    entity.unit = m.unit.rawValue
    entity.totalQuantity = m.totalQuantity
    entity.remainingQuantity = m.remainingQuantity
    entity.blisterRows = m.blisterRows
    entity.blisterCols = m.blisterCols
    entity.expiryDate = m.expiryDate
    entity.prescription = m.prescription
    entity.notes = m.notes
    entity.createdAt = m.createdAt
    entity.updatedAt = m.updatedAt
  }

  private func makePersonEntity(_ p: Person) -> PersonEntity {
    PersonEntity(
      id: p.id, name: p.name, avatarColor: p.avatarColor, gender: p.gender?.rawValue,
      age: p.age, allergies: p.encodeTags(),
      underlyingConditions: p.encodeConditions(), createdAt: p.createdAt)
  }

  private func apply(_ p: Person, to entity: PersonEntity) {
    entity.name = p.name
    entity.avatarColor = p.avatarColor
    entity.gender = p.gender?.rawValue
    entity.age = p.age
    entity.allergies = p.encodeTags()
    entity.underlyingConditions = p.encodeConditions()
    entity.createdAt = p.createdAt
  }

  private func makePlanEntity(_ plan: MedicationPlan) -> PlanEntity {
    PlanEntity(
      id: plan.id, medicationId: plan.medicationId, personId: plan.personId,
      doseAmount: plan.doseAmount, times: plan.encodeTimes(),
      startDate: plan.startDate, endDate: plan.endDate, enabled: plan.enabled,
      createdAt: plan.createdAt, updatedAt: plan.updatedAt)
  }

  private func apply(_ plan: MedicationPlan, to entity: PlanEntity) {
    entity.medicationId = plan.medicationId
    entity.personId = plan.personId
    entity.doseAmount = plan.doseAmount
    entity.times = plan.encodeTimes()
    entity.startDate = plan.startDate
    entity.endDate = plan.endDate
    entity.enabled = plan.enabled
    entity.createdAt = plan.createdAt
    entity.updatedAt = plan.updatedAt
  }

  private func makeReminderEntity(_ r: Reminder) -> ReminderEntity {
    ReminderEntity(
      id: r.id, planId: r.planId, medicationId: r.medicationId, personId: r.personId,
      date: r.date, time: r.time, doseAmount: r.doseAmount, status: r.status.rawValue,
      snoozedUntil: r.snoozedUntil, resolvedAt: r.resolvedAt, createdAt: r.createdAt)
  }

  private func apply(_ r: Reminder, to entity: ReminderEntity) {
    entity.planId = r.planId
    entity.medicationId = r.medicationId
    entity.personId = r.personId
    entity.date = r.date
    entity.time = r.time
    entity.doseAmount = r.doseAmount
    entity.status = r.status.rawValue
    entity.snoozedUntil = r.snoozedUntil
    entity.resolvedAt = r.resolvedAt
    entity.createdAt = r.createdAt
  }

  private func makeUsageEntity(_ u: MedicationUsage) -> UsageEntity {
    UsageEntity(
      id: u.id, reminderId: u.reminderId, planId: u.planId,
      medicationId: u.medicationId, personId: u.personId, personName: u.personName,
      medicationName: u.medicationName, time: u.time, amount: u.amount, late: u.late,
      takenAt: u.takenAt, createdAt: u.createdAt)
  }

  private func makePackEntity(_ pack: BlisterPack) -> PackEntity {
    PackEntity(
      id: pack.id, medicationId: pack.medicationId, seq: pack.seq, rows: pack.rows,
      cols: pack.cols, createdAt: pack.createdAt)
  }

  private func makeSlotEntity(_ s: BlisterSlot) -> BlisterSlotEntity {
    BlisterSlotEntity(
      id: s.id, packId: s.packId, slotIndex: s.index, status: s.status.rawValue,
      usageId: s.usageId, consumedAt: s.consumedAt, consumedBy: s.consumedBy)
  }

  private func apply(_ s: BlisterSlot, to entity: BlisterSlotEntity) {
    entity.packId = s.packId
    entity.slotIndex = s.index
    entity.status = s.status.rawValue
    entity.usageId = s.usageId
    entity.consumedAt = s.consumedAt
    entity.consumedBy = s.consumedBy
  }
}
