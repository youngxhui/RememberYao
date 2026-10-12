import UIKit

enum HomeSection: Int, CaseIterable {
  case reminders
  case stock
}

enum HomeRow: Hashable {
  case reminder(id: String, title: String, detail: String, statusKey: String)
  /// 库存行：`fraction` = 剩余 / 总量（进度条），`levelKey` 定充裕度配色
  case stock(
    id: String, title: String, detail: String, levelKey: String, fraction: Double)
}

/// 首页（今日）：日期 + 成员筛选 + 提醒卡堆叠 + 今日全部提醒 + 库存速览。
///
/// 视觉基准 `design/today.html`，但控件一律用平台原生：`UITableView`
/// （inset grouped）+ `UIListContentConfiguration` 单元格、`UIMenu` 筛选、
/// `UIAlertController` 操作面板、原生侧滑操作。屏幕只负责读 `Store` 与派发
/// 动作，所有业务判断（是否漏服、还能吃几天、低库存）都在 `Core/Domain` 里。
final class HomeViewController: ListScreenViewController<HomeRow>, ViewModelHolder {

  init(viewModel: AppViewModel) {
    self.viewModel = viewModel
    super.init(nibName: nil, bundle: nil)
  }


  var viewModel: AppViewModel!

  /// nil = 全部成员。
  private var memberFilter: String?

  /// 提醒卡堆叠：接下来的待处理提醒，纵向滑动换卡。
  ///
  /// 挂进 `tableHeaderView` 随页面一起滚走（Expo 版在原生 ScrollView 里，
  /// 同样是滚动内容的一部分）。纵向换卡手势与表格滚动手势同向，靠
  /// `require(toFail:)` 协调：超过死区的纵向拖动由牌堆接管换卡，其余拖动
  /// 照常滚页面。没有待处理提醒时组件自降为 0 高。
  private lazy var cardStack: ReminderCardStackView = {
    let stack = ReminderCardStackView()
    stack.onTake = { [weak self] _ in self?.reload() }
    return stack
  }()

  override func viewDidLoad() {
    super.viewDidLoad()
    // 用 navigationItem.title 而不是 title：VC 的 title 会被 UIKit 实时同步进
    // 所在 UINavigationController 的 tabBarItem.title（lldb 实测：一设就覆盖
    // AppCoordinator 里显式设置的「首页」），大标题只认 navigationItem.title
    navigationItem.title = L10n.formatDate(Date(), style: .full)
    navigationController?.navigationBar.prefersLargeTitles = true
    navigationItem.largeTitleDisplayMode = .always
    configureFilterMenu()
    installStackHeader()
    tableView.register(
      StockProgressCell.self, forCellReuseIdentifier: StockProgressCell.reuseID)
    reload()
    registerViewModelObservation()
  }

  /// 库存行走进度条 cell，提醒行走基类的普通单元格。
  override func cell(
    for row: HomeRow, in tableView: UITableView, at indexPath: IndexPath
  ) -> UITableViewCell {
    switch row {
    case .stock(let id, let title, let detail, let levelKey, let fraction):
      guard
        let cell = tableView.dequeueReusableCell(
          withIdentifier: StockProgressCell.reuseID, for: indexPath)
          as? StockProgressCell
      else { return super.cell(for: row, in: tableView, at: indexPath) }
      cell.configure(
        name: title,
        days: detail,
        fraction: fraction,
        level: StockLevel(rawValue: levelKey) ?? .ok
      )
      cell.accessibilityIdentifier = "home-stock-\(id)"
      return cell

    case .reminder:
      return super.cell(for: row, in: tableView, at: indexPath)
    }
  }

  override func reload() {
    guard !viewModel.loading else { return }
    // 用 navigationItem.title 而不是 title：VC 的 title 会被 UIKit 实时同步进
    // 所在 UINavigationController 的 tabBarItem.title（lldb 实测：一设就覆盖
    // AppCoordinator 里显式设置的「首页」），大标题只认 navigationItem.title
    navigationItem.title = L10n.formatDate(Date(), style: .full)
    applySnapshot()
  }

  override func applySnapshot() {
    super.applySnapshot()
    // 牌堆只认 pending/missed，按成员筛选后的全集交给它自己取前三张
    cardStack.configure(
      reminders: viewModel.reminders.filter { reminder in
        guard let memberFilter else { return true }
        return reminder.personId == memberFilter
      },
      medications: viewModel.medications,
      persons: viewModel.persons,
      plans: viewModel.plans
    )
    // 内容变了（标记服用后牌堆收缩、新提醒到达）牌堆高度跟着变
    refreshStackHeader()
  }

  // MARK: - 牌堆头部

  /// 牌堆挂进 `tableHeaderView`：随页面一起滚走（Expo 版在 ScrollView 里，
  /// 同样是滚动内容的一部分）。
  ///
  /// 纵向换卡手势与表格滚动手势同向，必须协调：让表格的 pan 等牌堆的 pan
  /// 失败后再开始 —— 超过死区的纵向拖动由牌堆接管换卡，其余拖动照常滚
  /// 页面（与 Expo 版 RNGH Pan 在 ScrollView 里的抢占行为一致）。
  private func installStackHeader() {
    let header = UIView()
    // 卡片投影溢出牌堆边界，壳不能裁剪
    header.clipsToBounds = false
    header.addSubview(cardStack)
    // 只钉三边：牌堆高度由内容自撑（无待办时 0 高），底边留给它自己的
    // 「卡片底 + 30pt 沉底补偿」约束 —— 四边全钉会变成两个 required
    // 高度互相打架
    cardStack.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      cardStack.topAnchor.constraint(equalTo: header.topAnchor),
      cardStack.leadingAnchor.constraint(equalTo: header.leadingAnchor),
      cardStack.trailingAnchor.constraint(equalTo: header.trailingAnchor),
    ])
    tableView.tableHeaderView = header
    refreshStackHeader()
    tableView.panGestureRecognizer.require(toFail: cardStack.panGesture)
  }

  /// 重算牌堆头部的帧并重新赋值。`tableHeaderView` 按 frame 缓存：宽度跟
  /// 表格（旋转 / 分屏），高度由牌堆内容撑（数据变化）—— 两者变了都要
  /// 重算再赋值才会生效；没变就跳过（重新赋值会触发表格重新布局，无条件
  /// 下会和 `viewDidLayoutSubviews` 互相触发成环）
  private func refreshStackHeader() {
    guard let header = tableView.tableHeaderView else { return }
    cardStack.layoutIfNeeded()
    guard header.frame.width != tableView.bounds.width
      || header.frame.height != cardStack.frame.height
    else { return }
    header.frame.size.width = tableView.bounds.width
    header.frame.size.height = cardStack.frame.height
    tableView.tableHeaderView = header
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    refreshStackHeader()
  }

  // MARK: - 成员筛选

  /// 筛选放导航栏右侧菜单：iOS 原生的「筛选项不多但每项有名字」的形态，
  /// 比塞一排 chip 更贴平台，也不会和 tab 栏抢空间。
  private func configureFilterMenu() {
    var actions: [UIMenuElement] = [
      UIAction(title: L10n.shared.t("medication.filterAll"), image: nil) { [weak self] _ in
        self?.memberFilter = nil
        self?.applySnapshot()
      }
    ]
    for person in viewModel.persons {
      let isSelected = person.id == memberFilter
      actions.append(
        UIAction(
          title: person.name,
          state: isSelected ? .on : .off
        ) { [weak self] _ in
          self?.memberFilter = person.id
          self?.applySnapshot()
        })
    }
    let menu = UIMenu(title: L10n.shared.t("home.member"), children: actions)
    navigationItem.rightBarButtonItem = UIBarButtonItem(
      image: UIImage(systemName: "line.3.horizontal.decrease.circle"),
      menu: menu
    )
    navigationItem.rightBarButtonItem?.accessibilityIdentifier = "home-filter-button"
  }

  // MARK: - 快照

  override func buildSnapshot() -> [SectionKey: [HomeRow]] {
    // 空分区不进快照：否则分区标题会孤零零挂一个空壳
    var snapshot: [SectionKey: [HomeRow]] = [:]
    let reminders = reminderRows()
    if !reminders.isEmpty {
      snapshot[HomeSection.reminders.rawValue] = reminders
    }
    let stock = stockRows()
    if !stock.isEmpty {
      snapshot[HomeSection.stock.rawValue] = stock
    }
    return snapshot
  }

  override func sectionTitle(for section: SectionKey) -> String? {
    switch section {
    case HomeSection.reminders.rawValue:
      return L10n.shared.t("home.todaySchedule")
    case HomeSection.stock.rawValue:
      return L10n.shared.t("home.stockListTitle")
    default:
      return nil
    }
  }

  private func reminderRows() -> [HomeRow] {
    let today = DateKey.today()
    return viewModel.reminders
      .filter { $0.date == today }
      .filter { reminder in
        guard let memberFilter else { return true }
        return reminder.personId == memberFilter
      }
      .sorted { DateKey.compareTime($0.time, $1.time) == .orderedAscending }
      .map { reminder in
        let medication = viewModel.medications.first { $0.id == reminder.medicationId }
        let person = viewModel.persons.first { $0.id == reminder.personId }
        return HomeRow.reminder(
          id: reminder.id,
          title: medication?.name ?? Domain.deletedMedicationName,
          detail:
            "\(reminder.time) · \(person?.name ?? Domain.deletedPersonName) · \(L10n.shared.t("medication.amountWithUnit", ["amount": "\(reminder.doseAmount)", "unit": medication.map { L10n.unitLabel($0.unit) } ?? ""]))",
          statusKey: reminder.status.rawValue
        )
      }
  }

  /// 库存速览：全部药品各一行（药名 + 库存进度条 + 剩余天数），与 Android 首页
  /// 的药品库存区同口径。之前只列低库存的药 —— 没有低库存药时整区消失，和另
  /// 一端对不上（用户看到的「iOS 牌堆下只有列表」就是这么来的）。
  private func stockRows() -> [HomeRow] {
    viewModel.medications
      .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
      .map { medication in
        let summary = stockSummary(medication, viewModel.plans)
        // 没有生效配置就不消耗，剩余天数无从谈起：与卡堆内的库存行同一套推导
        let detail: String
        if let daysLeft = summary.daysLeft {
          detail = L10n.shared.t("home.daysLeft", ["days": "\(daysLeft)"])
        } else {
          detail = L10n.shared.t("plan.endDateUnlimited")
        }
        let fraction = medication.totalQuantity > 0
          ? Double(medication.remainingQuantity) / Double(medication.totalQuantity)
          : 0
        return HomeRow.stock(
          id: medication.id,
          title: medication.name,
          detail: detail,
          levelKey: medication.stockLevel.rawValue,
          fraction: fraction
        )
      }
  }

  override func configure(_ cell: UITableViewCell, for row: HomeRow, at indexPath: IndexPath) {
    switch row {
    case .reminder(_, let title, let detail, let statusKey):
      var content = UIListContentConfiguration.subtitleCell()
      content.text = title
      content.secondaryText = detail
      content.secondaryTextProperties.numberOfLines = 2
      // 状态用文字标在右侧而不是靠颜色区分：色弱用户看不出红绿
      let status = ReminderStatus(rawValue: statusKey) ?? .pending
      content.textProperties.color = tint(for: status)
      cell.contentConfiguration = content
      cell.accessibilityIdentifier = "home-reminder-\(title)"
      cell.accessoryType = status == .pending ? .disclosureIndicator : .none

    case .stock:
      // 库存行统一走 StockProgressCell（见 cell(for:in:at:) 覆写）；这里只为
      // 让 switch 穷尽，最简配置防止子类漏覆写时出现复用残留
      cell.contentConfiguration = UIListContentConfiguration.valueCell()
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

  // MARK: - 操作

  override func didSelect(_ row: HomeRow) {
    switch row {
    case .reminder(let id, _, _, _):
      presentReminderActions(reminderId: id, sourceView: nil)

    case .stock(let id, _, _, _, _):
      let detail = MedicaDetailViewController(viewModel: viewModel, medicationId: id)
      navigationController?.pushViewController(detail, animated: true)
    }
  }

  /// 点一条待处理提醒：原生 actionSheet 给 已服用 / 稍后提醒 / 跳过。
  func presentReminderActions(reminderId: String, sourceView: UIView?) {
    let alert = UIAlertController(
      title: L10n.shared.t("home.reminderActions"), message: nil,
      preferredStyle: .actionSheet)
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("reminder.markTaken"), style: .default) {
        [weak self] _ in
        Task { await self?.viewModel.take(reminderId) }
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("reminder.snooze"), style: .default) {
        [weak self] _ in
        Task {
          await self?.viewModel.snooze(
            reminderId, minutes: self?.viewModel.settings.snoozeMinutes ?? 10)
        }
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("reminder.skip"), style: .destructive) {
        [weak self] _ in
        Task { await self?.viewModel.skip(reminderId) }
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    present(alert, anchoredTo: sourceView ?? view, animated: true)
  }

    required init?(coder: NSCoder) {
      fatalError("init(coder:) has not been implemented")
    }
}

// MARK: - 库存进度条行

/// 首页库存行：药名 + 库存进度条 + 剩余天数。
///
/// 与 Android 首页的 `StockProgressRow`（药名 + `LinearProgressIndicator`）同口径：
/// 进度 = 剩余 / 总量；充裕度三档（ok / low / critical）走项目语义色，进度条与
/// 天数同色 —— 告急档一眼可见。整行可点进药品详情。
final class StockProgressCell: UITableViewCell {
  static let reuseID = "StockProgressCell"

  private let nameLabel = UILabel()
  private let progressView = UIProgressView()
  private let daysLabel = UILabel()

  override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
    super.init(style: style, reuseIdentifier: reuseIdentifier)
    nameLabel.font = UIFont.systemFont(ofSize: 14, weight: .medium)
    nameLabel.numberOfLines = 1
    nameLabel.lineBreakMode = .byTruncatingTail
    // 等宽数字 + 右对齐：多行的天数成列，不随数值跳动
    daysLabel.font = UIFont.monospacedDigitSystemFont(ofSize: 12, weight: .regular)
    daysLabel.textAlignment = .right
    for view in [nameLabel, progressView, daysLabel] {
      view.translatesAutoresizingMaskIntoConstraints = false
      contentView.addSubview(view)
    }
    NSLayoutConstraint.activate([
      nameLabel.leadingAnchor.constraint(
        equalTo: contentView.layoutMarginsGuide.leadingAnchor),
      nameLabel.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
      nameLabel.trailingAnchor.constraint(
        lessThanOrEqualTo: progressView.leadingAnchor, constant: -12),
      progressView.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
      progressView.widthAnchor.constraint(equalToConstant: 72),
      daysLabel.leadingAnchor.constraint(
        equalTo: progressView.trailingAnchor, constant: 12),
      daysLabel.trailingAnchor.constraint(
        equalTo: contentView.layoutMarginsGuide.trailingAnchor),
      daysLabel.widthAnchor.constraint(equalToConstant: 72),
      daysLabel.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
      contentView.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
    ])
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  func configure(name: String, days: String, fraction: Double, level: StockLevel) {
    nameLabel.text = name
    daysLabel.text = days
    progressView.progress = Float(min(max(fraction, 0), 1))
    let color: UIColor
    switch level {
    case .ok: color = Theme.Color.success
    case .low: color = Theme.Color.warning
    case .critical: color = Theme.Color.danger
    }
    progressView.tintColor = color
    daysLabel.textColor = level == .ok ? Theme.Color.labelSecondary : color
    daysLabel.font =
      level == .ok
      ? UIFont.monospacedDigitSystemFont(ofSize: 12, weight: .regular)
      : UIFont.monospacedDigitSystemFont(ofSize: 12, weight: .semibold)
  }
}
