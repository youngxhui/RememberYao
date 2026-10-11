import UIKit

enum MedicaListSection: Int, CaseIterable {
  case medications
}

/// 药品行。声明在文件作用域：继承子句里的名字查不到类体内的成员。
struct MedicationRow: Hashable {
  let id: String
  let name: String
}

/// 药品库主屏：搜索 + 分类筛选 + 药品列表 + 空态。
///
/// 控件全部用平台原生：`UISearchController`（搜索）、`UIAlertController`
/// actionSheet（分类筛选）、`UITableView` inset grouped（列表）、侧滑删除。
/// 不用自造 chip 横滑 —— iOS 平台习惯是漏斗按钮 + 菜单，且分类超过 4 项时
/// segmented control 也放不下。
final class MedicaListViewController: ListScreenViewController<MedicationRow> {
  private let store = AppEnvironment.shared.store
  private let searchController = UISearchController(searchResultsController: nil)

  /// 筛选：nil = 全部。
  private var categoryFilter: MedicationCategory?
  private var lowStockOnly = false
  private var query = ""

  override func viewDidLoad() {
    super.viewDidLoad()
    // 与首页同理：VC 的 title 会被 UIKit 同步进 tabBarItem.title，覆盖
    // AppCoordinator 显式设置的「药品」（大标题只认 navigationItem.title）
    navigationItem.title = L10n.shared.t("medication.listTitle")
    configureNavigation()
    configureSearch()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    reload()
  }

  override func reload() {
    guard !store.loading else { return }
    applySnapshot()
  }

  private func configureNavigation() {
    // 右上角加号 → 添加药品。系统 UIBarButtonItem 就是最稳的做法
    let add = UIBarButtonItem(
      barButtonSystemItem: .add, target: self, action: #selector(addTapped))
    add.accessibilityIdentifier = "medica-add-button"
    navigationItem.rightBarButtonItem = add

    let filter = UIBarButtonItem(
      image: UIImage(systemName: "line.3.horizontal.decrease"),
      style: .plain,
      target: self,
      action: #selector(filterTapped)
    )
    filter.accessibilityIdentifier = "medica-filter-button"
    navigationItem.leftBarButtonItem = filter
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

  // MARK: - 快照

  override func buildSnapshot() -> [SectionKey: [MedicationRow]] {
    let rows = filteredMedications().map { medication in
      MedicationRow(id: medication.id, name: medication.name)
    }
    return [MedicaListSection.medications.rawValue: rows]
  }

  override func configure(_ cell: UITableViewCell, for row: MedicationRow, at indexPath: IndexPath) {
    guard let medication = store.data.medications.first(where: { $0.id == row.id }) else {
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

  private func filteredMedications() -> [Medication] {
    store.data.medications
      .filter { medication in
        if let categoryFilter, medication.category != categoryFilter { return false }
        if lowStockOnly, medication.stockLevel == .ok { return false }
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

  // MARK: - 交互

  override func didSelect(_ row: MedicationRow) {
    let detail = MedicaDetailViewController(medicationId: row.id) { [weak self] in
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
          await self.store.deleteMedication(id: row.id)
          self.reload()
        }
        completion(true)
      },
      onCancel: { completion(false) }
    )
  }

  @objc private func addTapped() {
    let form = MedicaFormViewController(medication: nil) { [weak self] in
      self?.reload()
    }
    navigationController?.pushViewController(form, animated: true)
  }

  @objc private func filterTapped() {
    let alert = UIAlertController(
      title: L10n.shared.t("medication.filterAll"), message: nil,
      preferredStyle: .actionSheet)
    alert.addAction(
      UIAlertAction(
        title: L10n.shared.t("medication.filterAll"),
        style: categoryFilter == nil && !lowStockOnly ? .destructive : .default
      ) { [weak self] _ in
        self?.categoryFilter = nil
        self?.lowStockOnly = false
        self?.reload()
      })
    for category in MedicationCategory.allCases {
      let isSelected = categoryFilter == category
      alert.addAction(
        UIAlertAction(
          title: L10n.categoryLabel(category),
          style: isSelected ? .destructive : .default
        ) { [weak self] _ in
          self?.categoryFilter = category
          self?.lowStockOnly = false
          self?.reload()
        })
    }
    alert.addAction(
      UIAlertAction(
        title: L10n.shared.t("medication.filterLow"),
        style: lowStockOnly ? .destructive : .default
      ) { [weak self] _ in
        self?.lowStockOnly = true
        self?.categoryFilter = nil
        self?.reload()
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    // iPad 上 actionSheet 必须给 popover 锚点，否则崩
    if let popover = alert.popoverPresentationController {
      popover.barButtonItem = navigationItem.leftBarButtonItem
    }
    present(alert, animated: true)
  }
}

extension MedicaListViewController: UISearchResultsUpdating {
  func updateSearchResults(for searchController: UISearchController) {
    query = searchController.searchBar.text ?? ""
    reload()
  }
}
