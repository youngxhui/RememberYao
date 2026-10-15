import UIKit

enum MedicaFormSection: Int {
  case basic
  case stock
  case other
  case blister
}

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
    var rows: [SectionKey: [MedicaFormRow]] = [
      MedicaFormSection.basic.rawValue: [.name, .specification, .type, .category, .unit],
      MedicaFormSection.stock.rawValue: [.totalQuantity, .remainingQuantity, .expiryDate],
      MedicaFormSection.other.rawValue: [.prescription, .notes],
    ]
    // 板装药才显示孪生规格。编辑已建孪生的药时，规格只影响之后补充的新板
    if type == .blister {
      rows[MedicaFormSection.blister.rawValue] = [
        .blisterRows, .blisterCols, .blisterPackCount,
      ]
    }
    return rows
  }

  override func sectionTitle(for section: SectionKey) -> String? {
    switch section {
    case MedicaFormSection.basic.rawValue:
      return L10n.shared.t("medication.sectionBasic")
    case MedicaFormSection.stock.rawValue:
      return L10n.shared.t("medication.sectionStockManage")
    case MedicaFormSection.other.rawValue:
      return L10n.shared.t("medication.sectionOther")
    case MedicaFormSection.blister.rawValue:
      return L10n.shared.t("twin.title")
    default:
      return nil
    }
  }

  override func spec(for row: MedicaFormRow) -> FormRowSpec {
    switch row {
    case .name:
      return .input(
        FieldCell.Field(
          id: "name", labelKey: "medication.name", value: name,
          placeholderKey: "medication.namePlaceholder")
      ) { [weak self] in self?.name = $0 }

    case .specification:
      return .input(
        FieldCell.Field(
          id: "specification", labelKey: "medication.specification",
          value: specification, placeholderKey: "medication.specificationPlaceholder")
      ) { [weak self] in self?.specification = $0 }

    case .type:
      return .picker(
        FieldCell.Field(
          id: "type", labelKey: "medication.type", value: L10n.typeLabel(type),
          readOnly: true)
      ) { [weak self] indexPath in
        self?.chooseType(sourceCell: self?.tableView.cellForRow(at: indexPath))
      }

    case .category:
      return .picker(
        FieldCell.Field(
          id: "category", labelKey: "medication.categoryField",
          value: L10n.categoryLabel(category), readOnly: true)
      ) { [weak self] indexPath in
        self?.chooseCategory(sourceCell: self?.tableView.cellForRow(at: indexPath))
      }

    case .unit:
      return .picker(
        FieldCell.Field(
          id: "unit", labelKey: "medication.unit", value: L10n.unitLabel(unit),
          readOnly: true)
      ) { [weak self] indexPath in
        self?.chooseUnit(sourceCell: self?.tableView.cellForRow(at: indexPath))
      }

    case .totalQuantity:
      return .input(
        FieldCell.Field(
          id: "total", labelKey: "medication.totalStock", value: totalQuantity,
          placeholderKey: "medication.totalStockPlaceholder",
          keyboardType: .numberPad)
      ) { [weak self] in self?.totalQuantity = $0 }

    case .remainingQuantity:
      return .input(
        FieldCell.Field(
          id: "remaining", labelKey: "medication.currentStock",
          value: remainingQuantity,
          placeholderKey: "medication.currentStockPlaceholder",
          keyboardType: .numberPad)
      ) { [weak self] in self?.remainingQuantity = $0 }

    case .expiryDate:
      return .picker(
        FieldCell.Field(
          id: "expiry", labelKey: "medication.expiryDate",
          value: expiryDate ?? L10n.shared.t("medication.expiryUnset"),
          readOnly: true)
      ) { [weak self] _ in self?.chooseExpiryDate() }

    case .notes:
      return .input(
        FieldCell.Field(
          id: "notes", labelKey: "medication.notes", value: notes,
          placeholderKey: "medication.notesFieldPlaceholder")
      ) { [weak self] in self?.notes = $0 }

    case .blisterRows:
      return .input(
        FieldCell.Field(
          id: "blisterRows", labelKey: "medication.blisterRows", value: blisterRows,
          placeholderKey: "medication.blisterRowsPlaceholder",
          keyboardType: .numberPad)
      ) { [weak self] in self?.blisterRows = $0 }

    case .blisterCols:
      return .input(
        FieldCell.Field(
          id: "blisterCols", labelKey: "medication.blisterCols", value: blisterCols,
          placeholderKey: "medication.blisterColsPlaceholder",
          keyboardType: .numberPad)
      ) { [weak self] in self?.blisterCols = $0 }

    case .blisterPackCount:
      return .input(
        FieldCell.Field(
          id: "blisterPackCount", labelKey: "medication.blisterPackCount",
          value: blisterPackCount,
          placeholderKey: "medication.blisterPackCountPlaceholder",
          keyboardType: .numberPad)
      ) { [weak self] in self?.blisterPackCount = $0 }

    case .prescription:
      return .action { [weak self] cell in
        guard let self else { return }
        var content = UIListContentConfiguration.cell()
        content.text = L10n.shared.t("medication.prescription")
        content.secondaryText = L10n.shared.t(
          self.prescription ? "medication.prescriptionYes" : "medication.prescriptionNo")
        let toggle = ClosureSwitch(
          isOn: self.prescription, identifier: "medica-prescription-switch")
        toggle.onChange = { [weak self] isOn in
          self?.prescription = isOn
          self?.reloadRows()
        }
        cell.accessoryView = toggle
        cell.accessibilityIdentifier = "medica-prescription-row"
        cell.contentConfiguration = content
      }
    }
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
    presentDatePicker(
      titleKey: "medication.expiryDate",
      current: expiryDate,
      showsClear: true,
      onPicked: { [weak self] key in
        self?.expiryDate = key
        self?.reloadRows()
      },
      onClear: { [weak self] in
        self?.expiryDate = nil
        self?.reloadRows()
      }
    )
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
