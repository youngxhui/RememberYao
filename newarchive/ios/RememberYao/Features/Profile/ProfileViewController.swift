import UIKit

enum ProfileSection: Int, CaseIterable {
  case overview
  case family
  case menu
}

enum ProfileRow: Hashable {
  case adherence(percent: Int)
  case onTime(count: Int)
  case missed(count: Int)
  case person(id: String, name: String, badge: String)
  case addPerson
  case settings
  case records
  case privacy
}

/// 我的：本周概览 + 家庭成员 + 设置入口。
///
/// 全部原生控件：`UITableView` inset grouped + `UIListContentConfiguration`。
/// 本周统计走 `Core/Domain` 的 `weekStats`，屏幕只负责摆。顶部通栏是
/// Mini Archive 收藏夹（`tableHeaderView`，水平滚动与表格垂直滚动方向正交）。
final class ProfileViewController: ListScreenViewController<ProfileRow> {
  private let store = AppEnvironment.shared.store

  /// Mini Archive 收藏夹：通栏横排（不跟着其它区块内缩），水平滚动与表格的
  /// 垂直滚动方向正交，可以直接走 `tableHeaderView`。
  private let miniArchive = MiniArchiveView()

  override func viewDidLoad() {
    super.viewDidLoad()
    title = L10n.shared.t("profile.title")
    let add = UIBarButtonItem(
      barButtonSystemItem: .add, target: self, action: #selector(addPersonTapped))
    add.accessibilityIdentifier = "profile-add-person-button"
    navigationItem.rightBarButtonItem = add
    configureArchiveHeader()
  }

  override func reload() {
    guard !store.loading else { return }
    applySnapshot()
    miniArchive.configure(
      entries: store.data.medications.map { ArchiveEntry.from($0) },
      onSelect: { [weak self] entry in
        let detail = MedicaDetailViewController(medicationId: entry.id)
        self?.navigationController?.pushViewController(detail, animated: true)
      })
  }

  /// tableHeaderView 只能按 frame 定高：外层套一个壳，宽度跟随表格，
  /// 高度用组件的固定外壳高（设计稿 section padding + 滚动区）。
  private func configureArchiveHeader() {
    let header = UIView()
    header.addSubview(miniArchive)
    miniArchive.pinEdges(to: header)
    layoutArchiveHeader(header)
    tableView.tableHeaderView = header
  }

  private func layoutArchiveHeader(_ header: UIView) {
    header.frame.size.width = tableView.bounds.width
    header.frame.size.height = MiniArchiveView.shellHeight
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    // 分屏 / 旋转会改表格宽度，header 要跟着重排（重新赋值才会生效）。
    // 宽度没变就跳过 —— 赋值 tableHeaderView 会触发表格重新布局，无条件下
    // 会和 viewDidLayoutSubviews 互相触发成环
    guard let header = tableView.tableHeaderView,
      header.frame.width != tableView.bounds.width
    else { return }
    layoutArchiveHeader(header)
    tableView.tableHeaderView = header
  }

  override func buildSnapshot() -> [SectionKey: [ProfileRow]] {
    let stats = weekStats(
      store.data.reminders,
      from: DateKey.weekStart(),
      to: DateKey.today()
    )
    let persons = store.data.persons.map { person in
      ProfileRow.person(id: person.id, name: person.name, badge: badge(for: person))
    }
    return [
      ProfileSection.overview.rawValue: [
        .adherence(percent: stats.adherence),
        .onTime(count: stats.taken),
        .missed(count: stats.missed),
      ],
      ProfileSection.family.rawValue: persons,
      ProfileSection.menu.rawValue: [.addPerson, .settings, .records, .privacy],
    ]
  }

  override func configure(_ cell: UITableViewCell, for row: ProfileRow, at indexPath: IndexPath) {
    var content = UIListContentConfiguration.valueCell()

    switch row {
    case .adherence(let percent):
      content.text = L10n.shared.t("profile.adherence")
      content.secondaryText = "\(percent)%"
      content.secondaryTextProperties.font = Theme.Font.title
      content.secondaryTextProperties.color = Theme.Color.primary

    case .onTime(let count):
      content.text = L10n.shared.t("profile.onTime")
      content.secondaryText = "\(count)"
      content.secondaryTextProperties.color = Theme.Color.success

    case .missed(let count):
      content.text = L10n.shared.t("profile.missed")
      content.secondaryText = "\(count)"
      content.secondaryTextProperties.color =
        count > 0 ? Theme.Color.danger : Theme.Color.labelSecondary

    case .person(let id, let name, let badge):
      content.text = name
      content.secondaryText = badge
      content.image = Self.avatar(for: name)
      content.imageProperties.cornerRadius = Theme.Size.avatar / 2
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "profile-person-\(id)"

    case .addPerson:
      content.text = L10n.shared.t("profile.addMember")
      content.textProperties.color = Theme.Color.primary
      cell.accessibilityIdentifier = "profile-add-member-row"

    case .settings:
      content.text = L10n.shared.t("settings.title")
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "profile-settings-row"

    case .records:
      content.text = L10n.shared.t("records.title")
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "profile-records-row"

    case .privacy:
      content.text = L10n.shared.t("settings.privacyTitle")
      content.secondaryText = L10n.shared.t("settings.privacySub")
      cell.accessoryType = .disclosureIndicator
    }

    cell.contentConfiguration = content
  }

  override func didSelect(_ row: ProfileRow) {
    switch row {
    case .person(let id, _, _):
      let detail = PersonDetailViewController(personId: id) { [weak self] in
        self?.reload()
      }
      navigationController?.pushViewController(detail, animated: true)

    case .addPerson:
      addPersonTapped()

    case .settings:
      navigationController?.pushViewController(SettingsViewController(), animated: true)

    case .records:
      navigationController?.pushViewController(RecordsViewController(), animated: true)

    default:
      break
    }
  }

  /// 成员徽章：正常 / 待关注（连续漏服）/ 未配置。
  private func badge(for person: Person) -> String {
    guard store.data.plans.contains(where: { $0.personId == person.id }) else {
      return L10n.shared.t("profile.badgeNoPlan")
    }
    let streaks = missedStreaks(
      store.data.reminders, threshold: store.data.settings.missedAlertStreak)
    return streaks.contains(person.id)
      ? L10n.shared.t("profile.badgeWatch") : L10n.shared.t("profile.badgeOk")
  }

  /// 姓名首字做头像。用 `UIImage` 渲染而不是自造 UIView：单元格的
  /// `UIListContentConfiguration` 原生支持 image 槽，系统会处理尺寸与圆角。
  private static func avatar(for name: String) -> UIImage? {
    let initial = String(name.prefix(1))
    let size = CGSize(width: Theme.Size.avatar, height: Theme.Size.avatar)
    let color = Theme.Color.hex(pickAvatarColor(name: name))
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { _ in
      color.setFill()
      UIBezierPath(ovalIn: CGRect(origin: .zero, size: size)).fill()
      let attributes: [NSAttributedString.Key: Any] = [
        .foregroundColor: UIColor.white,
        .font: UIFont.systemFont(ofSize: 18, weight: .semibold),
      ]
      let textSize = initial.size(withAttributes: attributes)
      initial.draw(
        in: CGRect(
          x: (size.width - textSize.width) / 2,
          y: (size.height - textSize.height) / 2,
          width: textSize.width,
          height: textSize.height
        ),
        withAttributes: attributes
      )
    }
  }

  @objc private func addPersonTapped() {
    let form = PersonsViewController { [weak self] in
      self?.reload()
    }
    navigationController?.pushViewController(form, animated: true)
  }
}
