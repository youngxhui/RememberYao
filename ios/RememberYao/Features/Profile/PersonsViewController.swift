import UIKit

enum PersonsRow: Hashable {
  case name
  case gender
  case age
  case allergies
  case conditions
}

/// 添加家庭成员。
///
/// 原生表单：`UITableView` inset grouped + `UITextField` + `UISwitch` /
/// `UISegmentedControl`。多项用逗号分隔的字段（过敏史、基础病）仍是单行输入，
/// 与 Android 端一致 —— 做成标签输入器会显著增加复杂度，收益不大。
final class PersonsViewController: FormScreenViewController<PersonsRow>, ViewModelHolder {
  let viewModel: AppViewModel
  private let onSaved: () -> Void

  private var name = ""
  private var gender: Gender?
  private var age = ""
  private var allergies = ""
  private var conditions = ""

  init(viewModel: AppViewModel, onSaved: @escaping () -> Void) {
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
    title = L10n.shared.t("person.addMember")
    applyRows()
    registerViewModelObservation()
  }

  override var primaryTitleKey: String { "person.addMemberButton" }

  override var isFormValid: Bool {
    !name.trimmingCharacters(in: .whitespaces).isEmpty
  }

  override func buildRows() -> [SectionKey: [PersonsRow]] {
    [SectionKey.form: [.name, .gender, .age, .allergies, .conditions]]
  }

  override func field(for row: PersonsRow) -> FieldCell.Field? {
    switch row {
    case .name:
      return FieldCell.Field(
        id: "name", labelKey: "person.name", value: name,
        placeholderKey: "person.nameInputPlaceholder")
    case .gender:
      return FieldCell.Field(
        id: "gender", labelKey: "person.gender",
        value: gender.map { L10n.shared.t(Self.genderKey($0)) }
          ?? L10n.shared.t("common.none"),
        readOnly: true)
    case .age:
      return FieldCell.Field(
        id: "age", labelKey: "person.age", value: age,
        placeholderKey: "person.agePlaceholder", keyboardType: .numberPad)
    case .allergies:
      return FieldCell.Field(
        id: "allergies", labelKey: "person.allergies", value: allergies,
        placeholderKey: "person.allergiesPlaceholder")
    case .conditions:
      return FieldCell.Field(
        id: "conditions", labelKey: "person.underlyingConditions", value: conditions,
        placeholderKey: "person.conditionsPlaceholder")
    }
  }

  override func setValue(_ value: String, for row: PersonsRow) {
    switch row {
    case .name: name = value
    case .age: age = value
    case .allergies: allergies = value
    case .conditions: conditions = value
    case .gender: break
    }
    primaryButton.setNeedsUpdateConfiguration()
  }

  override func didSelect(_ row: PersonsRow, at indexPath: IndexPath) {
    if row == .gender {
      presentSingleChoice(
        titleKey: "person.gender",
        options: Gender.allCases.map { (key: $0.rawValue, label: L10n.genderLabel($0)) },
        selectedKey: gender?.rawValue,
        sourceView: tableView.cellForRow(at: indexPath)
      ) { [weak self] key in
        self?.gender = Gender(rawValue: key)
        self?.reloadRows()
      }
    }
  }

  @objc override func primaryTapped() {
    let trimmedAge = age.trimmingCharacters(in: .whitespaces)
    let input = PersonInput(
      name: name,
      gender: gender,
      // 年龄需为 1~150 的整数；非法当未填写，不让保存失败
      age: trimmedAge.isEmpty ? nil : Int(trimmedAge).flatMap { (1...150).contains($0) ? $0 : nil },
      allergies: Self.splitTags(allergies),
      underlyingConditions: Self.splitTags(conditions)
    )
    Task {
      await viewModel.addPerson(input)
      onSaved()
      navigationController?.popViewController(animated: true)
    }
  }

  /// 多项用逗号分隔（中英文逗号都认）。
  private static func splitTags(_ raw: String) -> [String] {
    raw.split(whereSeparator: { $0 == "," || $0 == "，" || $0 == "、" })
      .map { $0.trimmingCharacters(in: .whitespaces) }
      .filter { !$0.isEmpty }
  }

  private static func genderKey(_ gender: Gender) -> String {
    switch gender {
    case .male: return "person.genderMale"
    case .female: return "person.genderFemale"
    case .other: return "person.genderOther"
    }
  }
}
