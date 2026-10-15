import UIKit

/// 服药记录：按日期查历史与当日服药率。
///
/// 不占 tab 位，从「我的」进来。日期切换用导航栏的上一日 / 下一日 + 日期选择器
/// —— iOS 原生日历浏览就是这个交互，不另造日历组件。
enum RecordSection: Int, CaseIterable {
  case summary
  case detail
}

enum RecordRow: Hashable {
  case adherence(percent: Int)
  case summary(text: String)
  case usage(id: String, title: String, detail: String, statusKey: String)
  case empty
}

final class RecordsViewController: ListScreenViewController<RecordRow>, ViewModelHolder {
  let viewModel: AppViewModel

  init(viewModel: AppViewModel) {
    self.viewModel = viewModel
    super.init(nibName: nil, bundle: nil)
  }

  /// 当前查看的日期（`YYYY-MM-DD`）。
  private var day = DateKey.today()

  override func viewDidLoad() {
    super.viewDidLoad()
    title = L10n.shared.t("records.title")
    navigationController?.navigationBar.prefersLargeTitles = false
    configureDateNavigation()
    reload()
  }

  override func reload() {
    guard !viewModel.loading else { return }
    title = Self.displayDate(day)
    applySnapshot()
  }

  /// 日期显示跟随 App 语言，不硬编码语序（中文「9月5日」vs 英文「Sep 5」）。
  private static func displayDate(_ key: String) -> String {
    guard let date = DateKey.date(key) else { return key }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: L10n.current.localeIdentifier)
    formatter.setLocalizedDateFormatFromTemplate("yyyyMMMMdEEE")
    return formatter.string(from: date)
  }

  // MARK: - 日期切换

  private func configureDateNavigation() {
    let previous = UIBarButtonItem(
      image: UIImage(systemName: "chevron.left"),
      style: .plain,
      target: self,
      action: #selector(previousDayTapped)
    )
    previous.accessibilityIdentifier = "records-previous-day"

    let next = UIBarButtonItem(
      image: UIImage(systemName: "chevron.right"),
      style: .plain,
      target: self,
      action: #selector(nextDayTapped)
    )
    next.accessibilityIdentifier = "records-next-day"

    let pick = UIBarButtonItem(
      image: UIImage(systemName: "calendar"),
      style: .plain,
      target: self,
      action: #selector(pickDateTapped)
    )
    pick.accessibilityIdentifier = "records-pick-date"

    navigationItem.leftBarButtonItems = [previous, next]
    navigationItem.rightBarButtonItem = pick
  }

  @objc private func previousDayTapped() {
    day = DateKey.addDays(day, -1)
    reload()
  }

  @objc private func nextDayTapped() {
    // 不越过今天：未来的日期还没有记录
    guard day < DateKey.today() else { return }
    day = DateKey.addDays(day, 1)
    reload()
  }

  @objc private func pickDateTapped() {
    presentDatePicker(
      titleKey: "records.pickDate",
      current: day,
      maximumDate: Date()
    ) { [weak self] key in
      self?.day = key
      self?.reload()
    }
  }

  // MARK: - 快照

  override func buildSnapshot() -> [SectionKey: [RecordRow]] {
    let reminders = viewModel.reminders.filter { $0.date == day }
    let stats = weekStats(viewModel.reminders, from: day, to: day)

    var summary: [RecordRow] = [.adherence(percent: stats.adherence)]
    // 摘要文案与 Expo 版 / Android 版同一条词条：计划 / 已服 / 漏服 / 跳过
    let counts = L10n.shared.t(
      "records.summary",
      [
        "total": "\(stats.planned)",
        "taken": "\(reminders.count { $0.status == .taken })",
        "missed": "\(reminders.count { $0.status == .missed })",
        "skipped": "\(reminders.count { $0.status == .skipped })",
      ])
    summary.append(.summary(text: counts))

    var detail: [RecordRow] = reminders
      .sorted { DateKey.compareTime($0.time, $1.time) == .orderedAscending }
      .map { reminder in
        let medication = viewModel.medications.first { $0.id == reminder.medicationId }
        let person = viewModel.persons.first { $0.id == reminder.personId }
        return RecordRow.usage(
          id: reminder.id,
          title: medication?.name ?? Domain.deletedMedicationName,
          detail:
            "\(reminder.time) · \(person?.name ?? Domain.deletedPersonName) · \(L10n.shared.t("medication.amountWithUnit", ["amount": "\(reminder.doseAmount)", "unit": medication.map { L10n.unitLabel($0.unit) } ?? ""]))",
          statusKey: reminder.status.rawValue
        )
      }
    if detail.isEmpty {
      detail.append(.empty)
    }

    return [
      RecordSection.summary.rawValue: summary,
      RecordSection.detail.rawValue: detail,
    ]
  }

  override func configure(
    _ cell: UITableViewCell, for row: RecordRow, at indexPath: IndexPath
  ) {
    switch row {
    case .adherence(let percent):
      var content = UIListContentConfiguration.valueCell()
      content.text = "\(percent)%"
      content.textProperties.font = Theme.Font.heroMonth
      content.textProperties.color = Theme.Color.primary
      content.secondaryText = L10n.shared.t("records.adherence")
      content.secondaryTextProperties.font = Theme.Font.body
      content.secondaryTextProperties.color = Theme.Color.labelSecondary
      cell.selectionStyle = .none
      cell.contentConfiguration = content
      cell.accessibilityIdentifier = "records-adherence"

    case .summary(let text):
      var content = UIListContentConfiguration.valueCell()
      content.text = text
      content.textProperties.font = Theme.Font.caption
      content.textProperties.color = Theme.Color.labelSecondary
      cell.selectionStyle = .none
      cell.contentConfiguration = content
      cell.accessibilityIdentifier = "records-summary"

    case .usage(_, let title, let detail, let statusKey):
      var content = UIListContentConfiguration.subtitleCell()
      content.text = title
      content.secondaryText = detail
      content.secondaryTextProperties.numberOfLines = 2
      content.textProperties.color = tint(
        for: ReminderStatus(rawValue: statusKey) ?? .pending)
      cell.contentConfiguration = content
      cell.accessibilityIdentifier = "records-usage-\(title)"

    case .empty:
      var content = UIListContentConfiguration.cell()
      content.text = L10n.shared.t("records.empty")
      content.textProperties.color = Theme.Color.labelSecondary
      content.textProperties.alignment = .center
      cell.selectionStyle = .none
      cell.contentConfiguration = content
      cell.accessibilityIdentifier = "records-empty"
    }
  }

  private func tint(for status: ReminderStatus) -> UIColor {
    switch status {
    case .pending: return Theme.Color.label
    case .taken: return Theme.Color.success
    case .skipped: return Theme.Color.labelSecondary
    case .missed: return Theme.Color.danger
    }
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
}
