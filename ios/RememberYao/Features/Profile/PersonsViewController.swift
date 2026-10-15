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
/// 原生表单：`UITableView` inset grouped + `UITextField`。多项用逗号分隔的
/// 字段（过敏史、基础病）仍是单行输入，与 Expo 版一致。
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

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = L10n.shared.t("person.addMember")
    applyRows()
  }

  override var primaryTitleKey: String { "person.addMemberButton" }

  override var isFormValid: Bool {
    !name.trimmingCharacters(in: .whitespaces).isEmpty
  }

  override func buildRows() -> [SectionKey: [PersonsRow]] {
    [0: [.name, .gender, .age, .allergies, .conditions]]
  }

  override func spec(for row: PersonsRow) -> FormRowSpec {
    switch row {
    case .name:
      return .input(
        FieldCell.Field(
          id: "name", labelKey: "person.name", value: name,
          placeholderKey: "person.nameInputPlaceholder")
      ) { [weak self] in self?.name = $0 }

    case .gender:
      return .picker(
        FieldCell.Field(
          id: "gender", labelKey: "person.gender",
          value: gender.map(L10n.genderLabel) ?? L10n.shared.t("common.none"),
          readOnly: true)
      ) { [weak self] indexPath in
        guard let self else { return }
        self.presentSingleChoice(
          titleKey: "person.gender",
          options: Gender.allCases.map { (key: $0.rawValue, label: L10n.genderLabel($0)) },
          selectedKey: self.gender?.rawValue,
          sourceView: self.tableView.cellForRow(at: indexPath)
        ) { [weak self] key in
          self?.gender = Gender(rawValue: key)
          self?.reloadRows()
        }
      }

    case .age:
      return .input(
        FieldCell.Field(
          id: "age", labelKey: "person.age", value: age,
          placeholderKey: "person.agePlaceholder", keyboardType: .numberPad)
      ) { [weak self] in self?.age = $0 }

    case .allergies:
      return .input(
        FieldCell.Field(
          id: "allergies", labelKey: "person.allergies", value: allergies,
          placeholderKey: "person.allergiesPlaceholder")
      ) { [weak self] in self?.allergies = $0 }

    case .conditions:
      return .input(
        FieldCell.Field(
          id: "conditions", labelKey: "person.underlyingConditions",
          value: conditions, placeholderKey: "person.conditionsPlaceholder")
      ) { [weak self] in self?.conditions = $0 }
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
}
