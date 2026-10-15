import UIKit

enum MedicaListSection: Int, CaseIterable {
  case medications
}

/// 药品行。声明在文件作用域：继承子句里的名字查不到类体内的成员。
struct MedicationRow: Hashable {
  let id: String
  let name: String
}

/// 药品库的筛选维度。与 Expo 版 `screens/medica/filter-row.tsx` 的 `MedicaFilter`
/// 逐项对齐：全部 → 三个用途分类 → 库存不足。
///
/// 顺序即 chip 行的视觉顺序，`rawValue` 同时是测试标识后缀
/// （`medica-filter-<rawValue>`）。
enum MedicaFilter: String, CaseIterable {
  case all
  case chronic
  case acute
  case supplement
  case low

  /// 分类类筛选对应的用途分类；「全部」与「库存不足」为 `nil`。
  var category: MedicationCategory? {
    switch self {
    case .all, .low: return nil
    case .chronic: return .chronic
    case .acute: return .acute
    case .supplement: return .supplement
    }
  }

  /// 本地化标题。分类三项复用 `L10n.categoryLabel`，键名不重复写一遍。
  ///
  /// 走 `L10n.translator` 而不是 `L10n.shared`：本属性是 nonisolated 的，
  /// 而 `shared` 是 `@MainActor` 单例（同 `L10n.categoryLabel` 的写法）。
  var title: String {
    switch self {
    case .all: return L10n.translator.t("medication.filterAll")
    case .low: return L10n.translator.t("medication.filterLow")
    case .chronic: return L10n.categoryLabel(.chronic)
    case .acute: return L10n.categoryLabel(.acute)
    case .supplement: return L10n.categoryLabel(.supplement)
    }
  }
}

/// 药品库主屏：搜索 + 分类筛选 + 药品列表 + 空态。
///
/// 控件全部用平台原生：`UISearchController`（搜索）、`FilterChipRow`
/// （横向滚动的胶囊筛选行）、`UITableView` inset grouped（列表）、侧滑删除。
/// 筛选行与 Expo 版同构 —— chip 顺序、互斥单选、命中规则逐条一致；行本身挂在
/// `tableHeaderView` 里随列表一起滚走（Expo 版同样在原生纵向滚动容器内）。
final class MedicaListViewController: ListScreenViewController<MedicationRow>, ViewModelHolder {
  let viewModel: AppViewModel
  private let searchController = UISearchController(searchResultsController: nil)
  private var filter: MedicaFilter = .all
  private var query = ""
  /// 上次装配 chip 行时的语言。标题现取现译，语言切换后回到本 tab 要重装一次。
  private var configuredLanguage: Language?

  /// 分类筛选行：横向滚动的胶囊组（design/medications.html 的 .chip-row）。
  private lazy var filterRow: FilterChipRow = FilterChipRow()

  init(viewModel: AppViewModel) {
    self.viewModel = viewModel
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    // 与首页同理：VC 的 title 会被 UIKit 同步进 tabBarItem.title，覆盖
    // AppCoordinator 显式设置的「药品」（大标题只认 navigationItem.title）
    navigationItem.title = L10n.shared.t("medication.listTitle")
    configureNavigation()
    configureSearch()
    installFilterHeader()
    configureFilterRow()
    reload()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    reload()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    refreshFilterHeader()
  }

  private func configureNavigation() {
    // 右上角加号 → 添加药品。系统 UIBarButtonItem 就是最稳的做法
    let add = UIBarButtonItem(
      barButtonSystemItem: .add, target: self, action: #selector(addTapped))
    add.accessibilityIdentifier = "medica-add-button"
    navigationItem.rightBarButtonItem = add
  }

  private func configureSearch() {
    searchController.searchResultsUpdater = self
    searchController.obscuresBackgroundDuringPresentation = false
    searchController.searchBar.placeholder = L10n.shared.t("medication.searchPlaceholder")
    searchController.searchBar.accessibilityIdentifier = "medica-search-bar"
    navigationItem.searchController = searchController
    // 大标题下 searchController 会自动折叠，与系统「药品库」这类列表一致
    navigationItem.hidesSearchBarWhenScrolling = false
  }

  // MARK: - 筛选行

  private func installFilterHeader() {
    let header = UIView()
    header.backgroundColor = Theme.Color.canvas
    header.addSubview(filterRow)
    filterRow.translatesAutoresizingMaskIntoConstraints = false
    // 只钉三边：行高由 chip 内容自撑（无固有高度时 header 还是 0 高，会把行
    // 压成 0）。底边留给 refreshFilterHeader 量到高度后回填
    NSLayoutConstraint.activate([
      filterRow.topAnchor.constraint(equalTo: header.topAnchor),
      // 水平页边距：FilterChipRow 只管 chip 本身，外边距由宿主控制
      filterRow.leadingAnchor.constraint(equalTo: header.leadingAnchor, constant: Theme.Space.page),
      filterRow.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -Theme.Space.page),
    ])
    tableView.tableHeaderView = header
    refreshFilterHeader()
  }

  /// 重算筛选行头部的帧并重新赋值。`tableHeaderView` 按 frame 缓存：宽度跟
  /// 表格（旋转 / 分屏），高度由 chip 内容撑（系统大字号下会长高）—— 两者变了
  /// 都要重算再赋值才会生效；没变就跳过（重新赋值会触发表格重新布局）。
  ///
  /// 量法同首页的牌堆头部（`HomeViewController.refreshStackHeader`）：先让行
  /// 自己布局一遍，再取它的实高。
  private func refreshFilterHeader() {
    guard let header = tableView.tableHeaderView else { return }
    filterRow.layoutIfNeeded()
    let height = filterRow.frame.height
    guard header.frame.width != tableView.bounds.width || header.frame.height != height
    else { return }
    header.frame.size.width = tableView.bounds.width
    header.frame.size.height = height
    tableView.tableHeaderView = header
  }

  private func configureFilterRow() {
    filterRow.configure(
      items: MedicaFilter.allCases.map {
        FilterChipItem(key: $0.rawValue, title: $0.title)
      },
      selectedKey: filter.rawValue,
      identifierPrefix: "medica-filter-"
    ) { [weak self] key in
      guard let self, let picked = MedicaFilter(rawValue: key) else { return }
      self.filter = picked
      self.applySnapshot()
    }
  }

  // MARK: - 快照

  override func reload() {
    guard !viewModel.loading else { return }
    // 语言切换后回到本 tab：chip 标题是现取现译的，重装一次才跟着变
    if configuredLanguage != L10n.shared.language {
      configuredLanguage = L10n.shared.language
      configureFilterRow()
    }
    applySnapshot()
  }

  override func buildSnapshot() -> [SectionKey: [MedicationRow]] {
    let rows = filteredMedications().map { medication in
      MedicationRow(id: medication.id, name: medication.name)
    }
    return [MedicaListSection.medications.rawValue: rows]
  }

  override func applySnapshot() {
    super.applySnapshot()
    refreshEmptyState()
  }

  override func configure(_ cell: UITableViewCell, for row: MedicationRow, at indexPath: IndexPath) {
    guard let medication = viewModel.medications.first(where: { $0.id == row.id }) else {
      return
    }
    var content = UIListContentConfiguration.subtitleCell()
    content.text = medication.name
    content.secondaryText = "\(L10n.typeLabel(medication.type)) · \(L10n.categoryLabel(medication.category)) · \(L10n.shared.t("medication.remaining")) \(medication.remainingQuantity)"
    content.textProperties.color = Self.tint(for: medication.stockLevel)
    content.secondaryTextProperties.numberOfLines = 1
    cell.contentConfiguration = content
    cell.accessoryType = .disclosureIndicator
    cell.accessibilityIdentifier = "medica-item-\(medication.id)"
  }

  /// 筛选：用途分类维度互斥，「库存不足」跨分类；搜索词与维度同时生效（AND）
  /// —— 先按维度收窄，再按药名收窄。与 Expo 版 `buildMedicationCards` 同规则。
  private func filteredMedications() -> [Medication] {
    viewModel.medications
      .filter { medication in
        if let category = filter.category, medication.category != category { return false }
        // 「库存不足」只收真的偏低 / 告急；没记库存（totalQuantity 为 0）不算
        // —— 快速添加的药还没记库存，不该被筛进「库存不足」
        if filter == .low,
          medication.stockLevel == .ok || medication.totalQuantity <= 0
        { return false }
        if !query.isEmpty,
          !medication.name.localizedCaseInsensitiveContains(query)
        { return false }
        return true
      }
      .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
  }

  private static func tint(for level: StockLevel) -> UIColor {
    switch level {
    case .ok: return Theme.Color.label
    case .low: return Theme.Color.warning
    case .critical: return Theme.Color.danger
    }
  }

  // MARK: - 空态

  /// 空态走 `tableView.backgroundView`：不随列表滚动 —— 「没有内容」的提示不是
  /// 一行内容。首屏还在读数据时不显示：空列表闪一下再刷出内容最像「没做完」
  /// （同 Expo 版）。
  private func refreshEmptyState() {
    guard filteredMedications().isEmpty, !viewModel.loading else {
      tableView.backgroundView = nil
      return
    }
    let host = UIView()
    host.backgroundColor = Theme.Color.canvas
    let stack = UIStackView(
      arrangedSubviews: [emptyIcon(), emptyTitleLabel(), emptyBodyLabel()])
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = Theme.Space.sm
    stack.translatesAutoresizingMaskIntoConstraints = false
    host.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.centerXAnchor.constraint(equalTo: host.centerXAnchor),
      stack.centerYAnchor.constraint(equalTo: host.centerYAnchor),
      // 正文最长的一句（「没有库存不足的药品」）在系统大字号下要能折行
      stack.widthAnchor.constraint(
        lessThanOrEqualTo: host.widthAnchor, constant: -Theme.Space.xl),
    ])
    tableView.backgroundView = host
  }

  /// 空态图标用「急救箱」：与 medica tab 的 `cross.case` 同一符号，整屏只此一处大图。
  private func emptyIcon() -> UIImageView {
    let image = UIImageView(image: UIImage(systemName: "cross.case"))
    image.preferredSymbolConfiguration = .init(pointSize: 44, weight: .regular)
    image.tintColor = Theme.Color.labelTertiary
    image.contentMode = .scaleAspectFit
    return image
  }

  private func emptyTitleLabel() -> UILabel {
    let label = UILabel()
    label.text = L10n.shared.t("medication.emptyTitle")
    label.font = Theme.Font.title
    label.textColor = Theme.Color.labelSecondary
    return label
  }

  /// 空态正文按「为什么空」给三句不同的：药箱本来就空 / 搜索没命中 /
  /// 该维度下没有。与 Expo 版 `medication.empty*` 三个键一致。
  private func emptyBodyLabel() -> UILabel {
    let label = UILabel()
    label.text = emptyBodyText()
    label.font = Theme.Font.caption
    label.textColor = Theme.Color.labelSecondary
    label.textAlignment = .center
    label.numberOfLines = 0
    return label
  }

  private func emptyBodyText() -> String {
    if viewModel.medications.isEmpty {
      return L10n.shared.t("medication.empty")
    }
    if !query.trimmingCharacters(in: .whitespaces).isEmpty {
      return L10n.shared.t("medication.emptySearch")
    }
    if filter == .low {
      return L10n.shared.t("medication.emptyLow")
    }
    return L10n.shared.t("medication.emptyCategory")
  }

  // MARK: - 交互

  override func didSelect(_ row: MedicationRow) {
    let detail = MedicaDetailViewController(viewModel: viewModel, medicationId: row.id) { [weak self] in
      self?.reload()
    }
    navigationController?.pushViewController(detail, animated: true)
  }

  override func swipeDeleteEnabled(for row: MedicationRow) -> Bool { true }

  override func confirmDelete(_ row: MedicationRow, completion: @escaping (Bool) -> Void) {
    // onCancel 在 onConfirm 之后声明，尾随闭包会绑到 onCancel 上，所以这里
    // 两个都得显式写标签
    presentDeleteConfirmation(
      titleKey: "medication.deleteButton",
      confirmKey: "medication.deleteConfirmButton",
      onConfirm: { [weak self] in
        guard let self else { return }
        Task {
          await self.viewModel.deleteMedication(id: row.id)
          self.reload()
        }
        completion(true)
      },
      onCancel: { completion(false) }
    )
  }

  @objc private func addTapped() {
    let form = MedicaFormViewController(viewModel: viewModel, medication: nil) { [weak self] in
      self?.reload()
    }
    navigationController?.pushViewController(form, animated: true)
  }
}

extension MedicaListViewController: UISearchResultsUpdating {
  func updateSearchResults(for searchController: UISearchController) {
    query = searchController.searchBar.text ?? ""
    reload()
  }

}
