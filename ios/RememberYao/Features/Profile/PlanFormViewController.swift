import UIKit

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
  var viewModel: AppViewModel!

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

  func viewModelDataChanged() {
    reloadRows()
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
    var rows: [PlanFormRow] = []
    // 从成员详情进来时用药人定死，不再给选择器
    if fixedPersonId == nil {
      rows.append(.person)
    }
    // 从药品详情进来时药品定死，不再给多选
    if fixedMedicationId == nil {
      rows.append(.medications)
    }
    for medicationId in orderedSelectedMedicationIds() {
      rows.append(.dose(medicationId: medicationId))
    }
    rows.append(contentsOf: [.times, .startDate, .endDate, .enabled])
    return [SectionKey.form: rows]
  }

  private func orderedSelectedMedicationIds() -> [String] {
    viewModel.medications
      .filter { doses.keys.contains($0.id) }
      .map(\.id)
  }

  override func field(for row: PlanFormRow) -> FieldCell.Field? {
    switch row {
    case .person:
      let name = personId.flatMap { id in
        viewModel.persons.first { $0.id == id }?.name
      }
      return FieldCell.Field(
        id: "person", labelKey: "plan.person",
        value: name ?? L10n.shared.t("plan.personPlaceholder"),
        readOnly: true, showsCheckmark: personId != nil)

    case .dose(let medicationId):
      let medication = viewModel.medications.first { $0.id == medicationId }
      return FieldCell.Field(
        id: "dose-\(medicationId)",
        labelKey: "plan.doseForMedication",
        value: doses[medicationId] ?? "",
        placeholderKey: "plan.dosePlaceholder",
        keyboardType: .numberPad,
        labelArgs: [
          "name": medication?.name ?? Domain.deletedMedicationName,
          "unit": medication.map { L10n.unitLabel($0.unit) } ?? "",
        ]
      )

    case .times:
      return FieldCell.Field(
        id: "times", labelKey: "plan.timesPerDay",
        value: times.joined(separator: " "), readOnly: true)

    case .startDate:
      return FieldCell.Field(
        id: "startDate", labelKey: "plan.startDate", value: startDate, readOnly: true)

    case .endDate:
      return FieldCell.Field(
        id: "endDate", labelKey: "plan.endDate",
        value: endDate ?? L10n.shared.t("plan.endDateUnlimited"), readOnly: true)

    case .medications, .enabled:
      return nil
    }
  }

  override func configureAction(_ cell: UITableViewCell, for row: PlanFormRow) {
    var content = UIListContentConfiguration.valueCell()
    switch row {
    case .medications:
      let count = doses.count
      content.text = L10n.shared.t("plan.medicationsLabel")
      content.secondaryText = count == 0
        ? nil
        : L10n.shared.t("plan.selectedCount", ["count": "\(count)"])
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "plan-medication-picker"

    case .enabled:
      content.text = L10n.shared.t("plan.enableLabel")
      content.secondaryText = L10n.shared.t(
        enabled ? "plan.enabledChip" : "plan.disabledChip")
      let toggle = ClosureSwitch(isOn: enabled, identifier: "plan-enabled-switch")
      toggle.onChange = { [weak self] isOn in
        self?.enabled = isOn
        self?.reloadRows()
      }
      cell.accessoryView = toggle
      cell.accessibilityIdentifier = "plan-enabled-row"

    default:
      cell.accessoryView = nil
    }
    cell.contentConfiguration = content
  }

  override func setValue(_ value: String, for row: PlanFormRow) {
    switch row {
    case .dose(let medicationId):
      doses[medicationId] = value
    default:
      break
    }
    primaryButton.setNeedsUpdateConfiguration()
  }

  override func didSelect(_ row: PlanFormRow, at indexPath: IndexPath) {
    switch row {
    case .person:
      choosePerson(sourceCell: tableView.cellForRow(at: indexPath))
    case .medications:
      presentMedicationPicker()
    case .times:
      chooseTimes()
    case .startDate:
      chooseDate(titleKey: "plan.startDate", current: startDate) { [weak self] key in
        self?.startDate = key
        self?.reloadRows()
      }
    case .endDate:
      chooseEndDate()
    default:
      break
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
          .filter { Self.isValidTime($0) }
        if !parsed.isEmpty {
          self.times = parsed.sorted { DateKey.compareTime($0, $1) == .orderedAscending }
        }
        self.reloadRows()
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    present(alert, animated: true)
  }

  private static func isValidTime(_ value: String) -> Bool {
    let parts = value.split(separator: ":")
    guard parts.count == 2,
      let hour = Int(parts[0]), let minute = Int(parts[1])
    else { return false }
    return (0...23).contains(hour) && (0...59).contains(minute)
  }

  private func chooseDate(
    titleKey: String, current: String, onPicked: @escaping (String) -> Void
  ) {
    let picker = UIDatePicker()
    picker.datePickerMode = .date
    picker.preferredDatePickerStyle = .inline
    if let date = DateKey.date(current) {
      picker.date = date
    }
    let alert = UIAlertController(
      title: L10n.shared.t(titleKey), message: nil, preferredStyle: .actionSheet)
    let container = UIViewController()
    container.view = picker
    container.preferredContentSize = CGSize(
      width: view.bounds.width - Theme.Space.xl, height: 420)
    alert.setValue(container, forKey: "contentViewController")
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.done"), style: .default) { _ in
        onPicked(DateKey.key(picker.date))
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    if let popover = alert.popoverPresentationController {
      popover.sourceView = view
      popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
    }
    present(alert, animated: true)
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
    let selected = Set(doses.keys)

    // patch 是 @Sendable 闭包，不能捕获 self：先把要写的值全部取到本地
    let times = self.times
    let startDate = self.startDate
    let endDate = self.endDate
    let enabled = self.enabled

    // 入口定死了单味药时，只写那一笔；多选时每味药一笔
    let addInputs: [PlanInput]
    let updatePatches: [(id: String, patch: (inout MedicationPlan) -> Void)]
    let removeIds: [String]

    if let fixedMedicationId {
      // 从药品详情进来：只有一味药
      let dose = Int(doses[fixedMedicationId] ?? "") ?? 1
      let input = PlanInput(
        medicationId: fixedMedicationId, personId: personId, doseAmount: dose,
        times: times, startDate: startDate, endDate: endDate, enabled: enabled)
      if let editingPlanId {
        addInputs = []
        updatePatches = [(editingPlanId, { plan in
          plan.doseAmount = dose
          plan.times = times
          plan.startDate = startDate
          plan.endDate = endDate
          plan.enabled = enabled
        })]
        removeIds = []
      } else {
        addInputs = [input]
        updatePatches = []
        removeIds = []
      }
    } else {
      if let editingPlanId {
        // 编辑态：新勾的走 add，原来有的走 update，取消勾选的走 remove
        let fresh = selected.subtracting(originallySelected)
        addInputs = fresh.map { medicationId in
          PlanInput(
            medicationId: medicationId, personId: personId,
            doseAmount: Int(doses[medicationId] ?? "") ?? 1,
            times: times, startDate: startDate, endDate: endDate, enabled: enabled)
        }
        updatePatches = selected.intersection(originallySelected).map { medicationId in
          // 编辑态一次只改一笔：取该用药人 + 该药的原配置
          let existing = viewModel.plans.first {
            $0.personId == personId && $0.medicationId == medicationId
          }
          let dose = Int(doses[medicationId] ?? "") ?? 1
          return (existing?.id ?? editingPlanId, { plan in
            plan.doseAmount = dose
            plan.times = times
            plan.startDate = startDate
            plan.endDate = endDate
            plan.enabled = enabled
          })
        }
        removeIds = originallySelected.subtracting(selected).compactMap { medicationId in
          viewModel.plans.first {
            $0.personId == personId && $0.medicationId == medicationId
          }?.id
        }
      } else {
        addInputs = selected.map { medicationId in
          PlanInput(
            medicationId: medicationId, personId: personId,
            doseAmount: Int(doses[medicationId] ?? "") ?? 1,
            times: times, startDate: startDate, endDate: endDate, enabled: enabled)
        }
        updatePatches = []
        removeIds = []
      }
    }

    Task {
      await viewModel.applyPlanChanges(
        PlanChanges(add: addInputs, update: updatePatches, remove: removeIds))
      navigationController?.popViewController(animated: true)
    }
  }
}
