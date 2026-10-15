import UIKit

enum PersonDetailSection: Int, CaseIterable {
  case basic
  case plans
  case actions
}

enum PersonDetailRow: Hashable {
  case avatar(id: String, name: String)
  case info(id: String, labelKey: String, value: String)
  case plan(id: String, title: String, detail: String)
  case addPlan
  case delete
}

/// 用药人详情：基本信息 + 用药配置列表 + 添加配置 + 删除成员。
///
/// 从成员详情进配置表单时，用药人是**定死**的，不再给选择器
/// （`fa48631`：用药人由入口定死）。
final class PersonDetailViewController: ListScreenViewController<PersonDetailRow>, ViewModelHolder {
  let viewModel: AppViewModel
  private let personId: String
  private let onChanged: () -> Void

  private var person: Person? {
    viewModel.persons.first { $0.id == personId }
  }

  init(viewModel: AppViewModel, personId: String, onChanged: @escaping () -> Void) {
    self.personId = personId
    self.onChanged = onChanged
    self.viewModel = viewModel

    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    reload()
  }

  override func reload() {
    guard !viewModel.loading else { return }
    guard person != nil else {
      title = L10n.shared.t("person.notFound")
      return
    }
    title = person?.name
    applySnapshot()
  }

  override func buildSnapshot() -> [SectionKey: [PersonDetailRow]] {
    guard let person else { return [:] }

    var basic: [PersonDetailRow] = [.avatar(id: person.id, name: person.name)]
    basic.append(
      .info(
        id: "gender", labelKey: "person.gender",
        value: person.gender.map { L10n.genderLabel($0) } ?? L10n.shared.t("common.none")))
    if let age = person.age {
      basic.append(.info(id: "age", labelKey: "person.age", value: "\(age)"))
    }
    basic.append(
      .info(
        id: "allergies", labelKey: "person.allergies",
        value: person.allergies.isEmpty
          ? L10n.shared.t("common.none") : person.allergies.joined(separator: "、")))
    basic.append(
      .info(
        id: "conditions", labelKey: "person.underlyingConditions",
        value: person.underlyingConditions.isEmpty
          ? L10n.shared.t("common.none")
          : person.underlyingConditions.joined(separator: "、")))

    var plans: [PersonDetailRow] = viewModel.plans
      .filter { $0.personId == person.id }
      .map { plan in
        let medication = viewModel.medications.first { $0.id == plan.medicationId }
        let unit = medication.map { L10n.unitLabel($0.unit) } ?? ""
        return PersonDetailRow.plan(
          id: plan.id,
          title: medication?.name ?? Domain.deletedMedicationName,
          detail:
            "\(L10n.shared.t("person.summaryLine", ["name": person.name, "amount": "\(plan.doseAmount)", "unit": unit])) · \(L10n.shared.t("plan.perDay", ["count": "\(plan.times.count)"]))"
        )
      }
    plans.append(.addPlan)

    var result: [SectionKey: [PersonDetailRow]] = [
      PersonDetailSection.basic.rawValue: basic,
      PersonDetailSection.plans.rawValue: plans,
    ]
    if person.id != Domain.selfPersonId {
      result[PersonDetailSection.actions.rawValue] = [.delete]
    }
    return result
  }

  override func configure(_ cell: UITableViewCell, for row: PersonDetailRow, at indexPath: IndexPath) {
    var content = UIListContentConfiguration.valueCell()
    switch row {
    case .avatar(_, let name):
      content.text = name
      if let person {
        content.image = Avatars.image(for: person)
      }
      content.imageProperties.cornerRadius = Theme.Size.avatar / 2
      cell.selectionStyle = .none

    case .info(_, let labelKey, let value):
      content.text = L10n.shared.t(labelKey)
      content.secondaryText = value
      content.secondaryTextProperties.numberOfLines = 0

    case .plan(_, let title, let detail):
      content.text = title
      content.secondaryText = detail
      content.secondaryTextProperties.numberOfLines = 2
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "person-plan-row"

    case .addPlan:
      content.text = L10n.shared.t("plan.emptyAddHint")
      content.textProperties.color = Theme.Color.primary
      cell.accessibilityIdentifier = "person-add-plan"

    case .delete:
      content.text = L10n.shared.t("person.deleteButtonAlt")
      content.textProperties.color = Theme.Color.danger
      cell.accessibilityIdentifier = "person-delete-button"
    }
    cell.contentConfiguration = content
  }

  override func didSelect(_ row: PersonDetailRow) {
    switch row {
    case .addPlan:
      // 从成员详情进来：用药人定死，不给选择器
      navigationController?.pushViewController(
        PlanFormViewController(viewModel: viewModel, personId: personId, medicationId: nil), animated: true)

    case .plan(let id, _, _):
      navigationController?.pushViewController(
        PlanFormViewController(viewModel: viewModel, personId: personId, medicationId: nil, editingPlanId: id),
        animated: true
      )

    case .delete:
      presentDeleteConfirmation(
        titleKey: "person.deleteButtonAlt",
        confirmKey: "common.confirmDelete"
      ) { [weak self] in
        guard let self else { return }
        Task {
          await self.viewModel.deletePerson(id: self.personId)
          self.onChanged()
          self.navigationController?.popViewController(animated: true)
        }
      }

    default:
      break
    }
  }
}
