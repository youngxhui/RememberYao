import UIKit

enum PlanFormSection: Int {
  case person
  case medications
  case times
  case dates
  case status
}

enum PlanFormRow: Hashable {
  case person
  case medications
  case dose(medicationId: String)
  case times
  case startDate
  case endDate
  case enabled
}

/// 用药配置表单：用药人 + 药品多选（逐味剂量）+ 服用时间 + 起止日期 + 启用开关。
///
/// 保存走 `applyPlanChanges` 一次落多笔，只重排一次通知（`docs/domain-spec.md` 4.7）。
/// 逐笔调 addPlan / updatePlan 的话，每笔都会触发一次全量通知重排，选四种药就闪四次。
final class PlanFormViewController: FormScreenViewController<PlanFormRow>, ViewModelHolder {
  let viewModel: AppViewModel

  /// 入口定死的用药人。从药品详情进来时为 nil，需要选。
  private let fixedPersonId: String?
  /// 入口定死的药品。从成员详情进来时为 nil，需要多选。
  private let fixedMedicationId: String?
  /// 编辑态：原配置 id。
  private let editingPlanId: String?

  private var personId: String?
  /// 勾中的药品 id → 每次剂量。
  private var doses: [String: String] = [:]
  private var times: [String] = Clock.defaultTimes(1)
  private var startDate = DateKey.today()
  private var endDate: String?
  private var enabled = true

  /// 编辑态原有的勾选集合：保存时对比它决定 remove 哪些。
  private var originallySelected: Set<String> = []

  init(viewModel: AppViewModel, personId: String?, medicationId: String?, editingPlanId: String? = nil) {
    self.fixedPersonId = personId
    self.fixedMedicationId = medicationId
    self.editingPlanId = editingPlanId
    self.viewModel = viewModel

    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = editingPlanId.map { _ in L10n.shared.t("plan.editTitle") }
      ?? L10n.shared.t("plan.formTitle")
    fillFromExisting()
    applyRows()
  }

  private func fillFromExisting() {
    guard let editingPlanId,
      let plan = viewModel.plans.first(where: { $0.id == editingPlanId })
    else {
      // 新建：入口可能已经定死了用药人 / 药品
      personId = fixedPersonId
      if let fixedMedicationId {
        doses[fixedMedicationId] = "1"
      }
      return
    }
    personId = plan.personId
    doses[plan.medicationId] = String(plan.doseAmount)
    originallySelected = [plan.medicationId]
    times = plan.times
    startDate = plan.startDate
    endDate = plan.endDate
    enabled = plan.enabled
  }

  // MARK: - 行定义

  override var primaryTitleKey: String { "plan.savePlan" }

  override var isFormValid: Bool {
    personId != nil
      && !doses.isEmpty
      && doses.values.allSatisfy { Int($0).map { $0 >= 1 } ?? false }
      && !times.isEmpty
      && Set(times).count == times.count
      && (endDate.map { $0 >= startDate } ?? true)
  }

  override func buildRows() -> [SectionKey: [PlanFormRow]] {
    var rows: [SectionKey: [PlanFormRow]] = [:]
    // 从成员详情进来时用药人定死，不再给选择器
    if fixedPersonId == nil {
      rows[PlanFormSection.person.rawValue] = [.person]
    }
    var medications: [PlanFormRow] = []
    // 从药品详情进来时药品定死，不再给多选
    if fixedMedicationId == nil {
      medications.append(.medications)
    }
    for medicationId in orderedSelectedMedicationIds() {
      medications.append(.dose(medicationId: medicationId))
    }
    if !medications.isEmpty {
      rows[PlanFormSection.medications.rawValue] = medications
    }
    rows[PlanFormSection.times.rawValue] = [.times]
    rows[PlanFormSection.dates.rawValue] = [.startDate, .endDate]
    rows[PlanFormSection.status.rawValue] = [.enabled]
    return rows
  }

  override func sectionTitle(for section: SectionKey) -> String? {
    switch section {
    case PlanFormSection.person.rawValue:
      return L10n.shared.t("plan.sectionPerson")
    case PlanFormSection.medications.rawValue:
      return L10n.shared.t("plan.sectionMedications")
    case PlanFormSection.times.rawValue:
      return L10n.shared.t("plan.sectionTimes")
    case PlanFormSection.dates.rawValue:
      return L10n.shared.t("plan.sectionDateRange")
    case PlanFormSection.status.rawValue:
      return L10n.shared.t("plan.sectionStatus")
    default:
      return nil
    }
  }

  private func orderedSelectedMedicationIds() -> [String] {
    viewModel.medications
      .filter { doses.keys.contains($0.id) }
      .map(\.id)
  }

  override func spec(for row: PlanFormRow) -> FormRowSpec {
    switch row {
    case .person:
      let name = personId.flatMap { id in
        viewModel.persons.first { $0.id == id }?.name
      }
      return .picker(
        FieldCell.Field(
          id: "person", labelKey: "plan.person",
          value: name ?? L10n.shared.t("plan.personPlaceholder"),
          readOnly: true, showsCheckmark: personId != nil)
      ) { [weak self] indexPath in
        self?.choosePerson(sourceCell: self?.tableView.cellForRow(at: indexPath))
      }

    case .dose(let medicationId):
      let medication = viewModel.medications.first { $0.id == medicationId }
      return .input(
        FieldCell.Field(
          id: "dose-\(medicationId)",
          labelKey: "plan.doseForMedication",
          value: doses[medicationId] ?? "",
          placeholderKey: "plan.dosePlaceholder",
          keyboardType: .numberPad,
          labelArgs: [
            "name": medication?.name ?? Domain.deletedMedicationName,
            "unit": medication.map { L10n.unitLabel($0.unit) } ?? "",
          ])
      ) { [weak self] in self?.doses[medicationId] = $0 }

    case .times:
      return .picker(
        FieldCell.Field(
          id: "times", labelKey: "plan.timesPerDay",
          value: times.joined(separator: " "), readOnly: true)
      ) { [weak self] _ in self?.chooseTimes() }

    case .startDate:
      return .picker(
        FieldCell.Field(
          id: "startDate", labelKey: "plan.startDate", value: startDate, readOnly: true)
      ) { [weak self] _ in
        guard let self else { return }
        self.chooseDate(titleKey: "plan.startDate", current: self.startDate) { [weak self] key in
          self?.startDate = key
          self?.reloadRows()
        }
      }

    case .endDate:
      return .picker(
        FieldCell.Field(
          id: "endDate", labelKey: "plan.endDate",
          value: endDate ?? L10n.shared.t("plan.endDateUnlimited"), readOnly: true)
      ) { [weak self] _ in self?.chooseEndDate() }

    case .medications:
      return .action(
        configure: { [weak self] cell in
          guard let self else { return }
          var content = UIListContentConfiguration.valueCell()
          content.text = L10n.shared.t("plan.medicationsLabel")
          content.secondaryText = self.doses.isEmpty
            ? nil
            : L10n.shared.t("plan.selectedCount", ["count": "\(self.doses.count)"])
          cell.accessoryType = .disclosureIndicator
          cell.accessibilityIdentifier = "plan-medication-picker"
          cell.contentConfiguration = content
        },
        onSelect: { [weak self] _ in self?.presentMedicationPicker() }
      )

    case .enabled:
      return .action { [weak self] cell in
        guard let self else { return }
        var content = UIListContentConfiguration.valueCell()
        content.text = L10n.shared.t("plan.enableLabel")
        content.secondaryText = L10n.shared.t(
          self.enabled ? "plan.enabledChip" : "plan.disabledChip")
        let toggle = ClosureSwitch(isOn: self.enabled, identifier: "plan-enabled-switch")
        toggle.onChange = { [weak self] isOn in
          self?.enabled = isOn
          self?.reloadRows()
        }
        cell.accessoryView = toggle
        cell.accessibilityIdentifier = "plan-enabled-row"
        cell.contentConfiguration = content
      }
    }
  }

  // MARK: - 选择器

  private func choosePerson(sourceCell: UITableViewCell?) {
    presentSingleChoice(
      titleKey: "plan.person",
      options: viewModel.persons.map {
        (key: $0.id, label: $0.name)
      },
      selectedKey: personId,
      sourceView: sourceCell
    ) { [weak self] key in
      self?.personId = key
      self?.reloadRows()
    }
  }

  /// 药品多选。原生 alert 逐行勾选：`UIAlertAction` 支持 checkmark 样式，
  /// 不必自造 checkbox 列表。
  private func presentMedicationPicker() {
    let alert = UIAlertController(
      title: L10n.shared.t("plan.medicationsLabel"), message: nil,
      preferredStyle: .actionSheet)
    for medication in viewModel.medications {
      let isSelected = doses[medication.id] != nil
      alert.addAction(
        UIAlertAction(
          title: medication.name + (isSelected ? "  ✓" : ""),
          style: isSelected ? .destructive : .default
        ) { [weak self] _ in
          guard let self else { return }
          if isSelected {
            // 取消勾选：编辑态下保存时会移除这味药的配置
            self.doses[medication.id] = nil
          } else {
            self.doses[medication.id] = "1"
          }
          self.reloadRows()
        })
    }
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.done"), style: .cancel))
    if let popover = alert.popoverPresentationController {
      popover.sourceView = view
      popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
    }
    present(alert, animated: true)
  }

  private func chooseTimes() {
    let alert = UIAlertController(
      title: L10n.shared.t("plan.sectionTimes"), message: nil,
      preferredStyle: .alert)
    alert.addTextField { field in
      field.placeholder = "HH:MM, HH:MM"
      field.text = self.times.joined(separator: ", ")
      field.keyboardType = .numbersAndPunctuation
      field.accessibilityIdentifier = "plan-times-input"
    }
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.done"), style: .default) { [weak self] _ in
        guard let self else { return }
        let parsed = (alert.textFields?.first?.text ?? "")
          .split(whereSeparator: { $0 == "," || $0 == "，" || $0 == " " })
          .map { $0.trimmingCharacters(in: .whitespaces) }
          .filter { Clock.isValidTime($0) }
        if !parsed.isEmpty {
          self.times = parsed.sorted { DateKey.compareTime($0, $1) == .orderedAscending }
        }
        self.reloadRows()
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    present(alert, animated: true)
  }

  private func chooseDate(
    titleKey: String, current: String, onPicked: @escaping (String) -> Void
  ) {
    presentDatePicker(titleKey: titleKey, current: current, onPicked: onPicked)
  }

  private func chooseEndDate() {
    chooseDate(titleKey: "plan.endDate", current: endDate ?? startDate) { [weak self] key in
      self?.endDate = key
      self?.reloadRows()
    }
  }

  // MARK: - 保存

  @objc override func primaryTapped() {
    guard let personId else { return }
    let changes = makePlanChanges(personId: personId)
    Task {
      await viewModel.applyPlanChanges(changes)
      navigationController?.popViewController(animated: true)
    }
  }

  /// 根据当前勾选与编辑前快照算出 add / update / remove。
  ///
  /// patch 是 `@Sendable` 闭包，不能捕获 self：剂量 / 时间等先拷到本地。
  private func makePlanChanges(personId: String) -> PlanChanges {
    let selected = Set(doses.keys)
    let times = self.times
    let startDate = self.startDate
    let endDate = self.endDate
    let enabled = self.enabled
    let originallySelected = self.originallySelected
    let editingPlanId = self.editingPlanId
    let existingPlans = viewModel.plans

    func input(for medicationId: String) -> PlanInput {
      PlanInput(
        medicationId: medicationId, personId: personId,
        doseAmount: Int(doses[medicationId] ?? "") ?? 1,
        times: times, startDate: startDate, endDate: endDate, enabled: enabled)
    }

    func patch(for medicationId: String) -> (inout MedicationPlan) -> Void {
      let dose = Int(doses[medicationId] ?? "") ?? 1
      return { plan in
        plan.doseAmount = dose
        plan.times = times
        plan.startDate = startDate
        plan.endDate = endDate
        plan.enabled = enabled
      }
    }

    let addIds: Set<String>
    let updateIds: Set<String>
    let removeMedicationIds: Set<String>
    if editingPlanId != nil {
      addIds = selected.subtracting(originallySelected)
      updateIds = selected.intersection(originallySelected)
      removeMedicationIds = originallySelected.subtracting(selected)
    } else {
      addIds = selected
      updateIds = []
      removeMedicationIds = []
    }

    let update = updateIds.map { medicationId -> (id: String, patch: (inout MedicationPlan) -> Void) in
      let existing = existingPlans.first {
        $0.personId == personId && $0.medicationId == medicationId
      }
      return (existing?.id ?? editingPlanId ?? medicationId, patch(for: medicationId))
    }
    let remove = removeMedicationIds.compactMap { medicationId in
      existingPlans.first {
        $0.personId == personId && $0.medicationId == medicationId
      }?.id
    }
    return PlanChanges(add: addIds.map(input), update: update, remove: remove)
  }
}
