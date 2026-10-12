import UIKit

enum MedicaFormRow: Hashable {
  case name
  case specification
  case type
  case category
  case unit
  case totalQuantity
  case remainingQuantity
  case expiryDate
  case prescription
  case notes
  case blisterRows
  case blisterCols
  case blisterPackCount
  case save
}

/// 添加 / 编辑药品。
///
/// 表单一律 `UITableView` inset grouped：系统自带分组圆角、发丝线、键盘避让。
/// 板装药可随药品一并建数字孪生（`docs/domain-spec.md` 4.5）。
final class MedicaFormViewController: FormScreenViewController<MedicaFormRow>, ViewModelHolder {
  let viewModel: AppViewModel
  private let medication: Medication?
  private let onSaved: () -> Void

  // 表单值
  private var name = ""
  private var specification = ""
  private var type: MedicationType = .blister
  private var category: MedicationCategory = .default
  private var unit: MedicationUnit = .tablet
  private var totalQuantity = ""
  private var remainingQuantity = ""
  private var expiryDate: String?
  private var prescription = false
  private var notes = ""
  private var blisterRows = ""
  private var blisterCols = ""
  private var blisterPackCount = ""

  init(viewModel: AppViewModel, medication: Medication?, onSaved: @escaping () -> Void) {
    self.medication = medication
    self.onSaved = onSaved
    self.viewModel = viewModel

    super.init(nibName: nil, bundle: nil)
  }

  override func viewModelDataChanged() {
    reloadRows()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = medication.map { _ in L10n.shared.t("medication.editTitle") }
      ?? L10n.shared.t("medication.formTitle")
    fillFromExisting()
    applyRows()
  }

  private func fillFromExisting() {
    guard let medication else { return }
    name = medication.name
    specification = medication.specification
    type = medication.type
    category = medication.category
    unit = medication.unit
    totalQuantity = String(medication.totalQuantity)
    remainingQuantity = String(medication.remainingQuantity)
    expiryDate = medication.expiryDate
    prescription = medication.prescription
    notes = medication.notes
    blisterRows = medication.blisterRows.map(String.init) ?? ""
    blisterCols = medication.blisterCols.map(String.init) ?? ""
  }

  // MARK: - 行定义

  override var primaryTitleKey: String { "medication.saveMedication" }

  override var isFormValid: Bool {
    !name.trimmingCharacters(in: .whitespaces).isEmpty
      && Int(totalQuantity) != nil
      && Int(remainingQuantity) != nil
  }

  override func buildRows() -> [SectionKey: [MedicaFormRow]] {
    var rows: [MedicaFormRow] = [
      .name, .specification, .type, .category, .unit,
      .totalQuantity, .remainingQuantity, .expiryDate, .prescription, .notes,
    ]
    // 板装药才显示孪生规格。编辑已建孪生的药时，规格只影响之后补充的新板
    if type == .blister {
      rows.append(contentsOf: [.blisterRows, .blisterCols, .blisterPackCount])
    }
    return [SectionKey.form: rows]
  }

  override func field(for row: MedicaFormRow) -> FieldCell.Field? {
    switch row {
    case .name:
      return FieldCell.Field(
        id: "name", labelKey: "medication.name", value: name,
        placeholderKey: "medication.namePlaceholder")
    case .specification:
      return FieldCell.Field(
        id: "specification", labelKey: "medication.specification",
        value: specification, placeholderKey: "medication.specificationPlaceholder")
    case .type:
      return FieldCell.Field(
        id: "type", labelKey: "medication.type", value: L10n.typeLabel(type),
        readOnly: true)
    case .category:
      return FieldCell.Field(
        id: "category", labelKey: "medication.categoryField",
        value: L10n.categoryLabel(category), readOnly: true)
    case .unit:
      return FieldCell.Field(
        id: "unit", labelKey: "medication.unit", value: L10n.unitLabel(unit),
        readOnly: true)
    case .totalQuantity:
      return FieldCell.Field(
        id: "total", labelKey: "medication.totalStock", value: totalQuantity,
        placeholderKey: "medication.totalStockPlaceholder",
        keyboardType: .numberPad)
    case .remainingQuantity:
      return FieldCell.Field(
        id: "remaining", labelKey: "medication.currentStock", value: remainingQuantity,
        placeholderKey: "medication.currentStockPlaceholder",
        keyboardType: .numberPad)
    case .expiryDate:
      return FieldCell.Field(
        id: "expiry", labelKey: "medication.expiryDate",
        value: expiryDate ?? L10n.shared.t("medication.expiryUnset"), readOnly: true)
    case .notes:
      return FieldCell.Field(
        id: "notes", labelKey: "medication.notes", value: notes,
        placeholderKey: "medication.notesFieldPlaceholder")
    case .blisterRows:
      return FieldCell.Field(
        id: "blisterRows", labelKey: "medication.blisterRows", value: blisterRows,
        placeholderKey: "medication.blisterRowsPlaceholder",
        keyboardType: .numberPad)
    case .blisterCols:
      return FieldCell.Field(
        id: "blisterCols", labelKey: "medication.blisterCols", value: blisterCols,
        placeholderKey: "medication.blisterColsPlaceholder",
        keyboardType: .numberPad)
    case .blisterPackCount:
      return FieldCell.Field(
        id: "blisterPackCount", labelKey: "medication.blisterPackCount",
        value: blisterPackCount,
        placeholderKey: "medication.blisterPackCountPlaceholder",
        keyboardType: .numberPad)
    case .prescription, .save:
      return nil
    }
  }

  override func configureAction(_ cell: UITableViewCell, for row: MedicaFormRow) {
    var content = UIListContentConfiguration.cell()
    switch row {
    case .prescription:
      content.text = L10n.shared.t("medication.prescription")
      content.secondaryText = L10n.shared.t(
        prescription ? "medication.prescriptionYes" : "medication.prescriptionNo")
      // 布尔开关用原生 UISwitch 嵌单元格右侧
      let toggle = UISwitch()
      toggle.isOn = prescription
      toggle.accessibilityIdentifier = "medica-prescription-switch"
      toggle.addTarget(self, action: #selector(prescriptionChanged), for: .valueChanged)
      cell.accessoryView = toggle
      cell.accessibilityIdentifier = "medica-prescription-row"

    default:
      content.text = L10n.shared.t("common.empty")
      cell.accessoryView = nil
    }
    cell.contentConfiguration = content
  }

  override func didSelect(_ row: MedicaFormRow, at indexPath: IndexPath) {
    switch row {
    case .type:
      chooseType(sourceCell: tableView.cellForRow(at: indexPath))
    case .category:
      chooseCategory(sourceCell: tableView.cellForRow(at: indexPath))
    case .unit:
      chooseUnit(sourceCell: tableView.cellForRow(at: indexPath))
    case .expiryDate:
      chooseExpiryDate()
    default:
      break
    }
  }

  // MARK: - 值收集
  // FieldCell 的闭包由基类在 cellProvider 里挂上，这里按行分发回表单字段

  override func setValue(_ value: String, for row: MedicaFormRow) {
    switch row {
    case .name: name = value
    case .specification: specification = value
    case .totalQuantity: totalQuantity = value
    case .remainingQuantity: remainingQuantity = value
    case .notes: notes = value
    case .blisterRows: blisterRows = value
    case .blisterCols: blisterCols = value
    case .blisterPackCount: blisterPackCount = value
    default: break
    }
    primaryButton.setNeedsUpdateConfiguration()
  }

  // MARK: - 选择器

  private func chooseType(sourceCell: UITableViewCell?) {
    presentSingleChoice(
      titleKey: "medication.type",
      options: MedicationType.allCases.map {
        (key: $0.rawValue, label: L10n.typeLabel($0))
      },
      selectedKey: type.rawValue,
      sourceView: sourceCell
    ) { [weak self] key in
      guard let self, let value = MedicationType(rawValue: key) else { return }
      self.type = value
      // 换包装形式会增减孪生规格行
      self.reloadRows()
    }
  }

  private func chooseCategory(sourceCell: UITableViewCell?) {
    presentSingleChoice(
      titleKey: "medication.categoryField",
      options: MedicationCategory.allCases.map {
        (key: $0.rawValue, label: L10n.categoryLabel($0))
      },
      selectedKey: category.rawValue,
      sourceView: sourceCell
    ) { [weak self] key in
      guard let self, let value = MedicationCategory(rawValue: key) else { return }
      self.category = value
      self.reloadRows()
    }
  }

  private func chooseUnit(sourceCell: UITableViewCell?) {
    presentSingleChoice(
      titleKey: "medication.unit",
      options: MedicationUnit.allCases.map {
        (key: $0.rawValue, label: L10n.unitLabel($0))
      },
      selectedKey: unit.rawValue,
      sourceView: sourceCell
    ) { [weak self] key in
      guard let self, let value = MedicationUnit(rawValue: key) else { return }
      self.unit = value
      self.reloadRows()
    }
  }

  private func chooseExpiryDate() {
    let picker = UIDatePicker()
    picker.datePickerMode = .date
    picker.preferredDatePickerStyle = .inline
    if let expiryDate, let date = DateKey.date(expiryDate) {
      picker.date = date
    }
    let alert = UIAlertController(
      title: L10n.shared.t("medication.expiryDate"), message: nil,
      preferredStyle: .actionSheet)
    // actionSheet 里嵌日期选择器是 iOS 原生做法，比推一个新页面轻
    let container = UIViewController()
    container.view = picker
    container.preferredContentSize = CGSize(
      width: view.bounds.width - Theme.Space.xl, height: 420)
    alert.setValue(container, forKey: "contentViewController")
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.done"), style: .default) { [weak self] _ in
        self?.expiryDate = DateKey.key(picker.date)
        self?.reloadRows()
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.clear"), style: .destructive) {
        [weak self] _ in
        self?.expiryDate = nil
        self?.reloadRows()
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    if let popover = alert.popoverPresentationController {
      popover.sourceView = view
      popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
    }
    present(alert, animated: true)
  }

  @objc private func prescriptionChanged(_ sender: UISwitch) {
    prescription = sender.isOn
    reloadRows()
  }

  // MARK: - 保存

  @objc override func primaryTapped() {
    guard let total = Int(totalQuantity), let remaining = Int(remainingQuantity) else {
      return
    }
    let rows = Int(blisterRows)
    let cols = Int(blisterCols)
    let packs = Int(blisterPackCount)
    // 板装且填了规格才建孪生；规格非法（行/列 1~12、板数 1~20）时按无效处理
    let blister: BlisterSpec?
    if type == .blister, let rows, let cols, let packs,
      (1...Domain.maxPackSide).contains(rows),
      (1...Domain.maxPackSide).contains(cols),
      (1...Domain.maxPackCount).contains(packs)
    {
      blister = BlisterSpec(rows: rows, cols: cols, packCount: packs)
    } else {
      blister = nil
    }

    let input = MedicationInput(
      name: name.trimmingCharacters(in: .whitespaces),
      type: type,
      category: category,
      specification: specification,
      unit: unit,
      totalQuantity: total,
      remainingQuantity: remaining,
      blisterRows: rows,
      blisterCols: cols,
      expiryDate: expiryDate,
      prescription: prescription,
      notes: notes,
      blister: medication == nil ? blister : nil
    )

    Task {
      if let medication {
        await viewModel.updateMedication(id: medication.id) { updated in
          updated.name = input.name
          updated.type = input.type
          updated.category = input.category
          updated.specification = input.specification
          updated.unit = input.unit
          updated.totalQuantity = total
          updated.remainingQuantity = remaining
          updated.blisterRows = rows
          updated.blisterCols = cols
          updated.expiryDate = self.expiryDate
          updated.prescription = self.prescription
          updated.notes = self.notes
        }
        // 编辑时补填了规格 → 开启孪生。要在 update 之后判断，此时
        // viewModel.medications 里的药品已是新值
        if let blister,
          let current = viewModel.medications.first(where: { $0.id == medication.id }),
          blisterSummary(current, viewModel.packs, viewModel.blisterSlots).enabled == false
        {
          await viewModel.openBlisterTwin(current.id, spec: blister)
        }
      } else {
        await viewModel.addMedication(input)
      }
      onSaved()
      navigationController?.popViewController(animated: true)
    }
  }
}
