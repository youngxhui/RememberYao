import Foundation
import Observation

/// 全应用共享的界面状态容器。
///
/// 数据库是唯一真相源（SwiftData），这里按集合持有拉取回来的数据。
/// 屏幕只读自己关心的集合属性 —— `@Observable` 的观察粒度是属性级，
/// 一处写入只让读了相关集合的屏幕刷新，不再是一整份快照变更、全app重算。
///
/// 数据流：`Repository` 按集合拉取 → ViewModel 属性（写操作后自动刷新）。
/// 屏幕通过 `registerViewModelObservation()` 观察属性变化。
@Observable
@MainActor
public final class AppViewModel {

  // MARK: - 状态（按集合）

  public private(set) var medications: [Medication] = []
  public private(set) var persons: [Person] = []
  public private(set) var plans: [MedicationPlan] = []
  public private(set) var reminders: [Reminder] = []
  public private(set) var usages: [MedicationUsage] = []
  /// 泡罩药板（板装药的数字孪生）。非板装药没有板。
  public private(set) var packs: [BlisterPack] = []
  /// 泡罩槽位，跟着板走。
  public private(set) var blisterSlots: [BlisterSlot] = []
  /// 全局设置偏好，恒为一条。
  public private(set) var settings: Settings = .defaultValue

  /// 首次加载是否结束。
  public private(set) var loading = true

  // MARK: - 依赖

  private let repository: Repository

  public init(repository: Repository) {
    self.repository = repository
  }

  // MARK: - 生命周期

  /// 从 Repository 拉取全部集合。
  ///
  /// 读是廉价的全表查询（写入才是贵的那一半，已增量），所以写操作后统一
  /// 全量拉一次，不为每个集合单独维护缓存失效逻辑。
  public func refresh() async {
    medications = await repository.fetchMedications()
    persons = await repository.fetchPersons()
    plans = await repository.fetchPlans()
    reminders = await repository.fetchReminders()
    usages = await repository.fetchUsages()
    packs = await repository.fetchPacks()
    blisterSlots = await repository.fetchBlisterSlots()
    settings = await repository.fetchSettings()
    loading = false
  }

  /// 同步 Repository 当前数据到 ViewModel（AppCoordinator 启动完成后调一次）。
  public func syncFromRepository() {
    Task { await refresh() }
  }

  /// 屏幕回到前台 / 进屏时：补生成提醒、重排通知，再拉一次数据。
  public func reload() {
    Task {
      await repository.reload()
      await refresh()
    }
  }

  // MARK: - 写操作转发
  // 每个方法：先调 Repository（增量落库 + 重排通知），完成后刷新集合。

  public func take(_ reminderId: String) async {
    await repository.take(reminderId)
    await refresh()
  }

  public func skip(_ reminderId: String) async {
    await repository.skip(reminderId)
    await refresh()
  }

  public func snooze(_ reminderId: String, minutes: Int? = nil) async {
    await repository.snooze(reminderId, minutes: minutes)
    await refresh()
  }

  @discardableResult
  public func addMedication(_ input: MedicationInput) async -> Medication {
    let result = await repository.addMedication(input)
    await refresh()
    return result
  }

  public func updateMedication(id: String, patch: @escaping (inout Medication) -> Void) async {
    await repository.updateMedication(id: id, patch: patch)
    await refresh()
  }

  public func deleteMedication(id: String) async {
    await repository.deleteMedication(id: id)
    await refresh()
  }

  public func restockMedication(id: String, amount: Int) async {
    await repository.restockMedication(id: id, amount: amount)
    await refresh()
  }

  @discardableResult
  public func addPerson(_ input: PersonInput) async -> Person {
    let result = await repository.addPerson(input)
    await refresh()
    return result
  }

  public func updatePerson(
    id: String, name: String? = nil, gender: Gender? = nil,
    age: Int? = nil, allergies: [String]? = nil, underlyingConditions: [String]? = nil
  ) async {
    await repository.updatePerson(
      id: id, name: name, gender: gender, age: age,
      allergies: allergies, underlyingConditions: underlyingConditions)
    await refresh()
  }

  public func deletePerson(id: String) async {
    await repository.deletePerson(id: id)
    await refresh()
  }

  public func addPlan(_ input: PlanInput) async {
    await repository.addPlan(input)
    await refresh()
  }

  public func updatePlan(id: String, patch: @escaping (inout MedicationPlan) -> Void) async {
    await repository.updatePlan(id: id, patch: patch)
    await refresh()
  }

  public func deletePlan(id: String) async {
    await repository.deletePlan(id: id)
    await refresh()
  }

  public func applyPlanChanges(_ changes: PlanChanges) async {
    await repository.applyPlanChanges(changes)
    await refresh()
  }

  public func openBlisterTwin(_ medicationId: String, spec: BlisterSpec) async {
    await repository.openBlisterTwin(medicationId, spec: spec)
    await refresh()
  }

  public func appendBlisterPacks(_ medicationId: String, count: Int) async {
    await repository.appendBlisterPacks(medicationId, count: count)
    await refresh()
  }

  public func consumeBlisterSlot(_ slotId: String, personId: String) async {
    await repository.consumeBlisterSlot(slotId, personId: personId)
    await refresh()
  }

  public func voidBlisterSlot(_ slotId: String) async {
    await repository.voidBlisterSlot(slotId)
    await refresh()
  }

  public func restoreBlisterSlot(_ slotId: String) async {
    await repository.restoreBlisterSlot(slotId)
    await refresh()
  }

  public func undoUsage(_ usageId: String) async {
    await repository.undoUsage(usageId)
    await refresh()
  }

  public func updateSettings(patch: @escaping (inout Settings) -> Void) async {
    await repository.updateSettings(patch: patch)
    await refresh()
  }
}
