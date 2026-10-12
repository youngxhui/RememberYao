import UIKit

enum MedicaDetailSection: Int, CaseIterable {
  case summary
  case basic
  case plans
  case restock
  case actions
}

enum MedicaDetailRow: Hashable {
  case stock(level: StockLevel, text: String)
  case daysLeft(text: String)
  case dailyDose(text: String)
  case info(id: String, labelKey: String, value: String)
  case twin(id: String, text: String)
  case plan(id: String, title: String, detail: String)
  case addPlan
  case restockAmount
  case restockPacks
  case edit
  case delete
}

/// 药品详情：库存概览 + 基础信息 + 数字孪生入口 + 用药配置 + 补货 + 编辑 / 删除。
///
/// 全部原生控件：`UITableView` inset grouped、侧滑删除、`UIAlertController`。
final class MedicaDetailViewController: ListScreenViewController<MedicaDetailRow>, ViewModelHolder {
  var viewModel: AppViewModel!
  private let medicationId: String
  private let onChanged: () -> Void

  private var medication: Medication? {
    viewModel.medications.first { $0.id == medicationId }
  }

  init(viewModel: AppViewModel, medicationId: String, onChanged: @escaping () -> Void = {}) {
    self.medicationId = medicationId
    self.onChanged = onChanged
    self.viewModel = viewModel

    super.init(nibName: nil, bundle: nil)
  }

  override func viewModelDataChanged() {
    reload()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = medication?.name ?? L10n.shared.t("medication.listTitle")
    reload()
    registerViewModelObservation()
  }

  override func reload() {
    guard !viewModel.loading else { return }
    guard let medication else {
      // 药品已被删（可能在别处删的）：展示 notFound 而不是空白
      title = L10n.shared.t("medication.notFound")
      return
    }
    title = medication.name
    applySnapshot()
  }

  override func buildSnapshot() -> [SectionKey: [MedicaDetailRow]] {
    guard let medication else { return [:] }
    let summary = stockSummary(medication, viewModel.plans)
    let twin = blisterSummary(medication, viewModel.packs, viewModel.blisterSlots)

    var summaryRows: [MedicaDetailRow] = [
      .stock(
        level: medication.stockLevel,
        text: "\(medication.remainingQuantity) / \(medication.totalQuantity) \(L10n.unitLabel(medication.unit))"
      )
    ]
    if let daysLeft = summary.daysLeft {
      summaryRows.append(
        .daysLeft(
          text: summary.low
            ? L10n.shared.t("medication.daysLeftHintLow", ["days": "\(daysLeft)"])
            : L10n.shared.t("medication.daysLeftHint", ["days": "\(daysLeft)"])))
    } else {
      summaryRows.append(.daysLeft(text: L10n.shared.t("medication.noEstimate")))
    }
    if summary.dailyDose > 0 {
      summaryRows.append(
        .dailyDose(text: "\(summary.dailyDose) \(L10n.unitLabel(medication.unit))"))
    }

    var basicRows: [MedicaDetailRow] = [
      .info(
        id: "type", labelKey: "medication.type", value: L10n.typeLabel(medication.type)),
      .info(
        id: "category", labelKey: "medication.categoryField",
        value: L10n.categoryLabel(medication.category)),
    ]
    if !medication.specification.isEmpty {
      basicRows.append(
        .info(
          id: "spec", labelKey: "medication.specification",
          value: medication.specification))
    }
    if let expiry = medication.expiryDate {
      basicRows.append(
        .info(id: "expiry", labelKey: "medication.expiryDate", value: expiry))
    }
    basicRows.append(
      .info(
        id: "prescription", labelKey: "medication.prescription",
        value: L10n.shared.t(
          medication.prescription
            ? "medication.prescriptionYes" : "medication.prescriptionNo")))
    if !medication.notes.isEmpty {
      basicRows.append(.info(id: "notes", labelKey: "medication.notes", value: medication.notes))
    }

    var planRows: [MedicaDetailRow] = viewModel.plans
      .filter { $0.medicationId == medication.id }
      .map { plan in
        let person = viewModel.persons.first { $0.id == plan.personId }
        return MedicaDetailRow.plan(
          id: plan.id,
          title: person?.name ?? Domain.deletedPersonName,
          detail: "\(L10n.shared.t("plan.perDay", ["count": "\(plan.times.count)"])) · \(plan.times.joined(separator: " "))"
        )
      }
    planRows.append(.addPlan)

    var restockRows: [MedicaDetailRow] = []
    if twin.enabled {
      restockRows.append(
        .restockPacks)
    } else {
      restockRows.append(.restockAmount)
    }

    if twin.enabled {
      let openSeq = twin.openPack?.seq ?? twin.packCount
      let text = twin.fullSlots > 0
        ? L10n.shared.t(
          "medication.twinProgressOpen",
          ["seq": "\(openSeq)", "full": "\(twin.fullSlots)", "total": "\(twin.totalSlots)"])
        : L10n.shared.t("medication.twinProgressDone")
      basicRows.append(.twin(id: "twin", text: text))
    } else if medication.type == .blister {
      basicRows.append(
        .twin(id: "twin-enable", text: L10n.shared.t("medication.twinEnable")))
    }

    return [
      MedicaDetailSection.summary.rawValue: summaryRows,
      MedicaDetailSection.basic.rawValue: basicRows,
      MedicaDetailSection.plans.rawValue: planRows,
      MedicaDetailSection.restock.rawValue: restockRows,
      MedicaDetailSection.actions.rawValue: [.edit, .delete],
    ]
  }

  override func configure(_ cell: UITableViewCell, for row: MedicaDetailRow, at indexPath: IndexPath) {
    var content = UIListContentConfiguration.valueCell()
    switch row {
    case .stock(let level, let text):
      content.text = L10n.shared.t("medication.remaining")
      content.secondaryText = text
      content.textProperties.color = Self.tint(for: level)
      content.image = UIImage(systemName: Self.symbol(for: level))
      content.imageProperties.tintColor = Self.tint(for: level)

    case .daysLeft(let text):
      // 剩余天数：文字已经由 buildRows 拼好（含「库存不足」前缀），这里只摆
      content.secondaryText = text
      content.secondaryTextProperties.numberOfLines = 0
      content.text = nil

    case .dailyDose(let text):
      content.text = L10n.shared.t("medication.dailyDose")
      content.secondaryText = text

    case .info(_, let labelKey, let value):
      content.text = L10n.shared.t(labelKey)
      content.secondaryText = value
      content.secondaryTextProperties.numberOfLines = 0

    case .twin(_, let text):
      content.text = L10n.shared.t("medication.twinSection")
      content.secondaryText = text
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "medica-twin-entry"

    case .plan(_, let title, let detail):
      content.text = title
      content.secondaryText = detail
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "medica-plan-row"

    case .addPlan:
      content.text = L10n.shared.t("plan.emptyAddHint")
      content.textProperties.color = Theme.Color.primary
      cell.accessibilityIdentifier = "medica-add-plan"

    case .restockAmount:
      content.text = L10n.shared.t("medication.restock")
      content.secondaryText = L10n.shared.t("medication.restockHint")
      content.secondaryTextProperties.numberOfLines = 0

    case .restockPacks:
      content.text = L10n.shared.t("medication.restock")
      content.secondaryText = L10n.shared.t("medication.restockPacksHint")
      content.secondaryTextProperties.numberOfLines = 0

    case .edit:
      content.text = L10n.shared.t("common.edit")
      content.textProperties.color = Theme.Color.primary
      cell.accessibilityIdentifier = "medica-edit-button"

    case .delete:
      content.text = L10n.shared.t("medication.deleteButton")
      content.textProperties.color = Theme.Color.danger
      cell.accessibilityIdentifier = "medica-delete-button"
    }
    cell.contentConfiguration = content
  }

  private static func tint(for level: StockLevel) -> UIColor {
    switch level {
    case .ok: return Theme.Color.success
    case .low: return Theme.Color.warning
    case .critical: return Theme.Color.danger
    }
  }

  private static func symbol(for level: StockLevel) -> String {
    switch level {
    case .ok: return "checkmark.circle.fill"
    case .low: return "exclamationmark.circle.fill"
    case .critical: return "xmark.octagon.fill"
    }
  }

  override func didSelect(_ row: MedicaDetailRow) {
    switch row {
    case .twin:
      guard let medication else { return }
      let twin = blisterSummary(medication, viewModel.packs, viewModel.blisterSlots)
      if twin.enabled {
        navigationController?.pushViewController(
          BlisterTwinViewController(viewModel: viewModel, medicationId: medication.id), animated: true)
      } else {
        // 未开启：用原生 alert 收集行列板数（三字段）
        presentTwinEnableSheet(for: medication)
      }

    case .addPlan:
      guard let medication else { return }
      navigationController?.pushViewController(
        PlanFormViewController(viewModel: viewModel, personId: nil, medicationId: medication.id),
        animated: true
      )

    case .restockAmount:
      presentRestockSheet()

    case .restockPacks:
      presentRestockPacksSheet()

    case .edit:
      guard let medication else { return }
      navigationController?.pushViewController(
        MedicaFormViewController(viewModel: viewModel, medication: medication) { [weak self] in
          self?.reload()
          self?.onChanged()
        },
        animated: true
      )

    case .delete:
      presentDeleteConfirmation(
        titleKey: "medication.deleteButton",
        confirmKey: "medication.deleteConfirmButton"
      ) { [weak self] in
        guard let self else { return }
        Task {
          await self.viewModel.deleteMedication(id: self.medicationId)
          self.onChanged()
          self.navigationController?.popViewController(animated: true)
        }
      }

    default:
      break
    }
  }

  // MARK: - 补货

  private func presentRestockSheet() {
    let alert = UIAlertController(
      title: L10n.shared.t("medication.restock"), message: nil, preferredStyle: .alert)
    alert.addTextField { field in
      field.placeholder = L10n.shared.t("medication.restockPlaceholder")
      field.keyboardType = .numberPad
      field.accessibilityIdentifier = "medica-restock-input"
    }
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("medication.restockSubmit"), style: .default) {
        [weak self] _ in
        guard let self,
          let amount = Int(alert.textFields?.first?.text ?? ""),
          amount > 0
        else { return }
        Task { await self.viewModel.restockMedication(id: self.medicationId, amount: amount) }
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    present(alert, animated: true)
  }

  private func presentRestockPacksSheet() {
    guard let medication else { return }
    let perPack = (medication.blisterRows ?? 1) * (medication.blisterCols ?? 1)
    let alert = UIAlertController(
      title: L10n.shared.t("medication.restock"),
      message: L10n.shared.t(
        "medication.restockPacksHint",
        ["perPack": "\(perPack)", "unit": L10n.unitLabel(medication.unit)]),
      preferredStyle: .alert
    )
    alert.addTextField { field in
      field.placeholder = L10n.shared.t("medication.restockPacksPlaceholder")
      field.keyboardType = .numberPad
      field.accessibilityIdentifier = "medica-restock-packs-input"
    }
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("medication.restockPacksSubmit"), style: .default) {
        [weak self] _ in
        guard let self,
          let count = Int(alert.textFields?.first?.text ?? ""),
          count > 0
        else { return }
        Task {
          await self.viewModel.appendBlisterPacks(self.medicationId, count: count)
        }
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    present(alert, animated: true)
  }

  /// 开启数字孪生的引导表单。原生 alert 三字段，不另起一页。
  private func presentTwinEnableSheet(for medication: Medication) {
    let alert = UIAlertController(
      title: L10n.shared.t("twin.enableTitle"),
      message: L10n.shared.t("twin.enableBody"),
      preferredStyle: .alert
    )
    let rowsKey = "twin.specRows", colsKey = "twin.specCols", packsKey = "twin.specPacks"
    alert.addTextField { field in
      field.placeholder = L10n.shared.t(rowsKey)
      field.text = medication.blisterRows.map(String.init) ?? ""
      field.keyboardType = .numberPad
      field.accessibilityIdentifier = "twin-rows-input"
    }
    alert.addTextField { field in
      field.placeholder = L10n.shared.t(colsKey)
      field.text = medication.blisterCols.map(String.init) ?? ""
      field.keyboardType = .numberPad
      field.accessibilityIdentifier = "twin-cols-input"
    }
    alert.addTextField { field in
      field.placeholder = L10n.shared.t(packsKey)
      field.text = "1"
      field.keyboardType = .numberPad
      field.accessibilityIdentifier = "twin-packs-input"
    }
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("twin.specSubmit"), style: .default) { [weak self] _ in
        guard let self,
          let rows = Int(alert.textFields?[0].text ?? ""),
          let cols = Int(alert.textFields?[1].text ?? ""),
          let packs = Int(alert.textFields?[2].text ?? ""),
          (1...Domain.maxPackSide).contains(rows),
          (1...Domain.maxPackSide).contains(cols),
          (1...Domain.maxPackCount).contains(packs)
        else { return }
        Task {
          await self.viewModel.openBlisterTwin(
            self.medicationId, spec: BlisterSpec(rows: rows, cols: cols, packCount: packs))
          self.reload()
        }
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    present(alert, animated: true)
  }
}
