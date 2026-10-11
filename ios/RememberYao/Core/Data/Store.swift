import Foundation
import Observation
import SwiftData

/// 全应用唯一的数据出入口。
///
/// 屏幕永远不直接碰 `ModelContext` 或 SwiftData 查询，只读 `Store.data` 并调
/// 这里的异步方法。写操作统一走「读 → 套纯函数 → 写回 → 重排通知」流水线，
/// 与 Expo 版 `src/lib/store.ts` 的 `updateData` 一致。
///
/// 并发模型：`Store` 是 `@Observable` 的 `@MainActor` 类（SwiftUI / UIKit 都只在
/// 主线程读它），内部用一个串行队列保证同一时刻只有一次落库，避免并发写把
/// SwiftData 上下文搞乱。
@Observable
@MainActor
public final class Store {
  /// 当前全量数据快照。
  public private(set) var data: AppData = AppData()
  /// 首次加载是否结束。没结束之前屏幕不能显示 empty 态。
  public private(set) var loading = true

  private let container: ModelContainer
  /// 串行化落库。连续变更会合并成几次写入，不会互相踩。
  private var writeChain: Task<Void, Never> = Task {}

  public nonisolated init(container: ModelContainer) {
    self.container = container
  }

  // MARK: - 读取

  /// 首次载入：读全表 → 同步提醒 → 落盘（若有变更）。
  public func load() async {
    let raw = fetchAll()
    let synced = syncRemindersIn(raw)
    if synced != raw {
      persist(synced)
      data = synced
    } else {
      data = raw
    }
    loading = false
    // 首屏同步完立刻重排一次通知：App 冷启动时距离上次调度可能已经过了好几天
    await NotificationScheduler.shared.resync()
  }

  /// 屏幕在 `viewWillAppear` 里调这个，把别处造成的变更拉回来。
  public func reload() {
    let raw = fetchAll()
    let synced = syncRemindersIn(raw)
    if synced != raw {
      persist(synced)
      data = synced
    } else {
      data = raw
    }
  }

  private func fetchAll() -> AppData {
    let context = ModelContext(container)
    let medications = (try? context.fetch(FetchDescriptor<MedicationEntity>())) ?? []
    let persons = (try? context.fetch(FetchDescriptor<PersonEntity>())) ?? []
    let plans = (try? context.fetch(FetchDescriptor<PlanEntity>())) ?? []
    let reminders = (try? context.fetch(FetchDescriptor<ReminderEntity>())) ?? []
    let usages = (try? context.fetch(FetchDescriptor<UsageEntity>())) ?? []
    let packs = (try? context.fetch(FetchDescriptor<PackEntity>())) ?? []
    let slots = (try? context.fetch(FetchDescriptor<BlisterSlotEntity>())) ?? []
    let settings = (try? context.fetch(FetchDescriptor<SettingsEntity>())) ?? []

    return AppData(
      medications: medications.map(Medication.init),
      persons: persons.map(Person.init),
      plans: plans.map(MedicationPlan.init),
      reminders: reminders.map(Reminder.init),
      usages: usages.map(MedicationUsage.init),
      packs: packs.map(BlisterPack.init),
      blisterSlots: slots.map(BlisterSlot.init),
      // 读不到行（新装 / 还没写过设置）就用默认值，不补一行空记录
      settings: settings.first.map(Settings.init) ?? .defaultValue
    )
  }

  // MARK: - 写入

  /// 串行落库。前一次没写完就排队，绝不并发写同一个容器。
  private func persist(_ next: AppData) {
    let previous = writeChain
    writeChain = Task {
      _ = await previous.value
      let context = ModelContext(container)
      replaceAll(in: context, with: next)
      try? context.save()
    }
  }

  /// 全量快照替换：按 id upsert 现有行、删掉不在快照里的行。
  ///
  /// 与 Expo 版 `src/db/repo.ts` 的 `replaceAll` 语义一致（先插后删）。数据量是
  /// 家庭级别（几十条药、几百条提醒），全量替换比算增量差异简单得多，也不会
  /// 出现「两边账算不平」。
  ///
  /// 每类实体写一段而不是抽一个泛型：字段拷贝各不相同，抽出来的泛型要么靠
  /// 反射（SwiftData 实体没有反射可用）要么把拷贝逻辑也参数化，反而更难读。
  private func replaceAll(in context: ModelContext, with next: AppData) {
    sync(
      MedicationEntity.self, context,
      rows: next.medications,
      rowID: \.id,
      entityID: \.id,
      update: { entity, m in
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
      },
      insert: { m in
        MedicationEntity(
          id: m.id, name: m.name, type: m.type.rawValue, category: m.category.rawValue,
          specification: m.specification, unit: m.unit.rawValue,
          totalQuantity: m.totalQuantity, remainingQuantity: m.remainingQuantity,
          blisterRows: m.blisterRows, blisterCols: m.blisterCols,
          expiryDate: m.expiryDate, prescription: m.prescription, notes: m.notes,
          createdAt: m.createdAt, updatedAt: m.updatedAt)
      })

    sync(
      PersonEntity.self, context,
      rows: next.persons,
      rowID: \.id,
      entityID: \.id,
      update: { entity, p in
        entity.name = p.name
        entity.avatarColor = p.avatarColor
        entity.gender = p.gender?.rawValue
        entity.age = p.age
        entity.allergies = p.encodeTags()
        entity.underlyingConditions = p.encodeConditions()
        entity.createdAt = p.createdAt
      },
      insert: { p in
        PersonEntity(
          id: p.id, name: p.name, avatarColor: p.avatarColor, gender: p.gender?.rawValue,
          age: p.age, allergies: p.encodeTags(),
          underlyingConditions: p.encodeConditions(), createdAt: p.createdAt)
      })

    sync(
      PlanEntity.self, context,
      rows: next.plans,
      rowID: \.id,
      entityID: \.id,
      update: { entity, plan in
        entity.medicationId = plan.medicationId
        entity.personId = plan.personId
        entity.doseAmount = plan.doseAmount
        entity.times = plan.encodeTimes()
        entity.startDate = plan.startDate
        entity.endDate = plan.endDate
        entity.enabled = plan.enabled
        entity.createdAt = plan.createdAt
        entity.updatedAt = plan.updatedAt
      },
      insert: { plan in
        PlanEntity(
          id: plan.id, medicationId: plan.medicationId, personId: plan.personId,
          doseAmount: plan.doseAmount, times: plan.encodeTimes(),
          startDate: plan.startDate, endDate: plan.endDate, enabled: plan.enabled,
          createdAt: plan.createdAt, updatedAt: plan.updatedAt)
      })

    sync(
      ReminderEntity.self, context,
      rows: next.reminders,
      rowID: \.id,
      entityID: \.id,
      update: { entity, r in
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
      },
      insert: { r in
        ReminderEntity(
          id: r.id, planId: r.planId, medicationId: r.medicationId, personId: r.personId,
          date: r.date, time: r.time, doseAmount: r.doseAmount, status: r.status.rawValue,
          snoozedUntil: r.snoozedUntil, resolvedAt: r.resolvedAt, createdAt: r.createdAt)
      })

    sync(
      UsageEntity.self, context,
      rows: next.usages,
      rowID: \.id,
      entityID: \.id,
      update: { entity, u in
        entity.reminderId = u.reminderId
        entity.planId = u.planId
        entity.medicationId = u.medicationId
        entity.personId = u.personId
        entity.personName = u.personName
        entity.medicationName = u.medicationName
        entity.time = u.time
        entity.amount = u.amount
        entity.late = u.late
        entity.takenAt = u.takenAt
        entity.createdAt = u.createdAt
      },
      insert: { u in
        UsageEntity(
          id: u.id, reminderId: u.reminderId, planId: u.planId,
          medicationId: u.medicationId, personId: u.personId, personName: u.personName,
          medicationName: u.medicationName, time: u.time, amount: u.amount, late: u.late,
          takenAt: u.takenAt, createdAt: u.createdAt)
      })

    sync(
      PackEntity.self, context,
      rows: next.packs,
      rowID: \.id,
      entityID: \.id,
      update: { entity, pack in
        entity.medicationId = pack.medicationId
        entity.seq = pack.seq
        entity.rows = pack.rows
        entity.cols = pack.cols
        entity.createdAt = pack.createdAt
      },
      insert: { pack in
        PackEntity(
          id: pack.id, medicationId: pack.medicationId, seq: pack.seq, rows: pack.rows,
          cols: pack.cols, createdAt: pack.createdAt)
      })

    sync(
      BlisterSlotEntity.self, context,
      rows: next.blisterSlots,
      rowID: \.id,
      entityID: \.id,
      update: { entity, s in
        entity.packId = s.packId
        entity.slotIndex = s.index
        entity.status = s.status.rawValue
        entity.usageId = s.usageId
        entity.consumedAt = s.consumedAt
        entity.consumedBy = s.consumedBy
      },
      insert: { s in
        BlisterSlotEntity(
          id: s.id, packId: s.packId, slotIndex: s.index, status: s.status.rawValue,
          usageId: s.usageId, consumedAt: s.consumedAt, consumedBy: s.consumedBy)
      })

    // 设置恒为一行：读不到行时 Store 会回落到默认值，所以这里总是 upsert，
    // 不需要像 Expo 版那样判断「等于默认值就不写」
    upsertSettings(next.settings, context: context)
  }

  /// 删掉不在 `rows` 里的行，并按 id upsert `rows`。
  private func sync<E: PersistentModel, R>(
    _ type: E.Type,
    _ context: ModelContext,
    rows: [R],
    rowID: KeyPath<R, String>,
    entityID: KeyPath<E, String>,
    update: (E, R) -> Void,
    insert: (R) -> E
  ) {
    let existing = (try? context.fetch(FetchDescriptor<E>())) ?? []
    let wanted = Set(rows.map { $0[keyPath: rowID] })
    for entity in existing where !wanted.contains(entity[keyPath: entityID]) {
      context.delete(entity)
    }
    let byID = Dictionary(
      existing.map { ($0[keyPath: entityID], $0) },
      uniquingKeysWith: { first, _ in first })
    for row in rows {
      if let found = byID[row[keyPath: rowID]] {
        update(found, row)
      } else {
        context.insert(insert(row))
      }
    }
  }

  private func upsertSettings(_ settings: Settings, context: ModelContext) {
    let existing = (try? context.fetch(FetchDescriptor<SettingsEntity>())) ?? []
    if let row = existing.first {
      row.notificationsEnabled = settings.notificationsEnabled
      row.snoozeMinutes = settings.snoozeMinutes
      row.quietStart = settings.quietStart
      row.quietEnd = settings.quietEnd
      row.soundEnabled = settings.soundEnabled
      row.missedAlertStreak = settings.missedAlertStreak
    } else {
      context.insert(
        SettingsEntity(
          notificationsEnabled: settings.notificationsEnabled,
          snoozeMinutes: settings.snoozeMinutes,
          quietStart: settings.quietStart,
          quietEnd: settings.quietEnd,
          soundEnabled: settings.soundEnabled,
          missedAlertStreak: settings.missedAlertStreak
        ))
    }
  }

  // MARK: - 业务写操作
  // 每个方法都是「套纯函数 → 更新 data → 落盘 → 重排通知」，一行不多。

  private func commit(_ next: AppData) async {
    data = next
    persist(next)
    await NotificationScheduler.shared.resync()
  }

  public func take(_ reminderId: String) async {
    await commit(takeReminderIn(data, id: reminderId))
  }

  public func skip(_ reminderId: String) async {
    await commit(skipReminderIn(data, id: reminderId))
  }

  public func snooze(_ reminderId: String, minutes: Int? = nil) async {
    await commit(snoozeReminderIn(data, id: reminderId, minutes: minutes))
  }

  public func addMedication(_ input: MedicationInput) async -> Medication {
    let (next, medication) = addMedicationIn(data, input: input)
    await commit(next)
    return medication
  }

  public func updateMedication(id: String, patch: @escaping (inout Medication) -> Void)
    async
  {
    await commit(updateMedicationIn(data, id: id, patch: patch))
  }

  public func deleteMedication(id: String) async {
    await commit(deleteMedicationIn(data, id: id))
  }

  public func restockMedication(id: String, amount: Int) async {
    await commit(restockMedicationIn(data, id: id, amount: amount))
  }

  public func addPerson(_ input: PersonInput) async -> Person {
    let (next, person) = addPersonIn(data, input: input)
    await commit(next)
    return person
  }

  public func updatePerson(
    id: String, name: String? = nil, gender: Gender? = nil, age: Int? = nil,
    allergies: [String]? = nil, underlyingConditions: [String]? = nil
  ) async {
    await commit(
      updatePersonIn(
        data, id: id, name: name, gender: gender, age: age, allergies: allergies,
        underlyingConditions: underlyingConditions))
  }

  public func deletePerson(id: String) async {
    await commit(deletePersonIn(data, id: id))
  }

  public func addPlan(_ input: PlanInput) async {
    await commit(addPlanIn(data, input: input))
  }

  public func updatePlan(id: String, patch: @escaping (inout MedicationPlan) -> Void)
    async
  {
    await commit(updatePlanIn(data, id: id, patch: patch))
  }

  public func deletePlan(id: String) async {
    await commit(deletePlanIn(data, id: id))
  }

  /// 一次落多笔用药配置变更，只重排一次通知。
  public func applyPlanChanges(_ changes: PlanChanges) async {
    await commit(applyPlanChangesIn(data, changes: changes))
  }

  public func openBlisterTwin(_ medicationId: String, spec: BlisterSpec) async {
    await commit(openBlisterTwinIn(data, medicationId, spec))
  }

  public func appendBlisterPacks(_ medicationId: String, count: Int) async {
    await commit(appendBlisterPacksIn(data, medicationId: medicationId, count: count))
  }

  public func consumeBlisterSlot(_ slotId: String, personId: String) async {
    await commit(consumeBlisterSlotIn(data, slotId: slotId, personId: personId))
  }

  public func voidBlisterSlot(_ slotId: String) async {
    await commit(voidBlisterSlotIn(data, slotId: slotId))
  }

  public func restoreBlisterSlot(_ slotId: String) async {
    await commit(restoreBlisterSlotIn(data, slotId: slotId))
  }

  public func undoUsage(_ usageId: String) async {
    await commit(undoUsageIn(data, usageId: usageId))
  }

  public func updateSettings(patch: @escaping (inout Settings) -> Void) async {
    await commit(updateSettingsIn(data, patch: patch))
  }
}
