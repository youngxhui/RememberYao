import Foundation

/// 通知重排所需的跨实体只读投影。
///
/// 通知调度天生要同时看「全部待处理提醒 + 设置 + 人名药名」，这是唯一还需要
/// 跨集合一致视图的地方；但它只读、不参与写路径，与旧的「全量快照即真相源」
/// 有本质区别。
public struct ScheduleInput: Sendable {
  public var reminders: [Reminder]
  public var settings: Settings
  public var medications: [Medication]
  public var persons: [Person]

  public init(
    reminders: [Reminder],
    settings: Settings,
    medications: [Medication],
    persons: [Person]
  ) {
    self.reminders = reminders
    self.settings = settings
    self.medications = medications
    self.persons = persons
  }
}

/// 数据操作的唯一入口协议。
///
/// 实现类持有底层持久化（SwiftData）和通知调度，对上游只暴露异步方法。
/// `Store` 是唯一实现，由 `AppEnvironment` 装配。
///
/// 读：按集合拉取（SwiftData 没有响应式查询原语，进屏 / 写后拉取）；
/// 屏幕只读自己关心的集合，一处写入只刷新相关数据。
/// 写：增量落库（只动涉及的实体）+ 通知重排，主 actor 上天然串行。
@MainActor
public protocol Repository: AnyObject {

  // MARK: - 状态读取（按集合拉取）

  func fetchMedications() async -> [Medication]
  func fetchPersons() async -> [Person]
  func fetchPlans() async -> [MedicationPlan]
  func fetchReminders() async -> [Reminder]
  func fetchUsages() async -> [MedicationUsage]
  func fetchPacks() async -> [BlisterPack]
  func fetchBlisterSlots() async -> [BlisterSlot]
  func fetchSettings() async -> Settings

  /// 首次加载是否结束。
  var loading: Bool { get }

  /// 通知重排的只读投影。
  func scheduleInput() async -> ScheduleInput

  // MARK: - 生命周期

  /// 首次载入：补生成提醒 + 重排通知。数据本身由各集合的拉取负责。
  func load() async

  /// 进屏 / 回前台时刷新：补生成提醒 + 重排通知（幂等，无变更则空转）。
  func reload() async

  // MARK: - 提醒

  func take(_ reminderId: String) async

  func skip(_ reminderId: String) async

  func snooze(_ reminderId: String, minutes: Int?) async

  // MARK: - 药品

  func addMedication(_ input: MedicationInput) async -> Medication

  func updateMedication(id: String, patch: @escaping (inout Medication) -> Void) async

  func deleteMedication(id: String) async

  func restockMedication(id: String, amount: Int) async

  // MARK: - 用药人

  func addPerson(_ input: PersonInput) async -> Person

  func updatePerson(
    id: String, name: String?, gender: Gender?,
    age: Int?, allergies: [String]?, underlyingConditions: [String]?
  ) async

  func deletePerson(id: String) async

  // MARK: - 默认用药人

  /// 首启创建 / 语言切换时刷新默认用药人（「自己」）：id 固定 `SELF_PERSON_ID`。
  func ensureDefaultPerson() async

  // MARK: - 用药配置

  func addPlan(_ input: PlanInput) async

  func updatePlan(id: String, patch: @escaping (inout MedicationPlan) -> Void) async

  func deletePlan(id: String) async

  /// 一次落多笔配置变更，只重排一次通知。
  func applyPlanChanges(_ changes: PlanChanges) async

  // MARK: - 板装孪生

  func openBlisterTwin(_ medicationId: String, spec: BlisterSpec) async

  func appendBlisterPacks(_ medicationId: String, count: Int) async

  func consumeBlisterSlot(_ slotId: String, personId: String) async

  func voidBlisterSlot(_ slotId: String) async

  func restoreBlisterSlot(_ slotId: String) async

  func undoUsage(_ usageId: String) async

  // MARK: - 设置

  func updateSettings(patch: @escaping (inout Settings) -> Void) async
}
