import UIKit

/// 列表屏基类：diffable data source + inset grouped 表格 + 统一刷新。
///
/// 只收「每个列表屏都要写一遍的那几行」，不含任何业务。子类实现
/// `buildSnapshot()` 即可，刷新时调 `applySnapshot()`。
///
/// 泛型参数是行标识类型：各屏的行结构差异大（有的只有 id，有的要带
/// title/detail 之类的派生值），用 enum 表达比塞进字典更类型安全。
/// 行 enum 必须声明在**文件作用域** —— 继承子句里的名字查不到类体内的成员。
///
/// `UITableViewDelegate` 的声明故意放在类体里而不是扩展里：泛型类的扩展
/// 不允许出现 `@objc` 成员，而这个协议的每个方法都是 `@objc`。
@MainActor
class ListScreenViewController<RowType: Hashable & Sendable>: UIViewController,
  UITableViewDelegate
{
  /// 分区键。故意不叫 `Section`：子类都会声明自己的 `Section` enum，
  /// 同名会把继承来的这个别名遮住。
  typealias SectionKey = Int

  private(set) var tableView: UITableView!
  private(set) var dataSource: UITableViewDiffableDataSource<SectionKey, RowType>!

  var cellReuseIdentifier: String { "Cell" }

  /// 子类覆盖：固定在滚动区之外的头部，高度由自身约束决定。
  ///
  /// 给「不能嵌进 UIScrollView 的视图」用 —— 例如提醒卡堆叠的纵向拖动与
  /// 表格滚动手势同向，嵌套会互相抢。水平滚动之类的视图（如 Mini Archive）
  /// 与表格方向正交，直接走 `tableHeaderView`，不需要这个挂载点。
  var fixedHeader: UIView? { nil }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = Theme.Color.canvas
    configureTableView()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    reload()
  }

  /// 子类覆盖：重新读 `Store` 并 `applySnapshot()`。
  func reload() {
    applySnapshot()
  }

  private func configureTableView() {
    tableView = UITableView(frame: .zero, style: .insetGrouped)
    tableView.translatesAutoresizingMaskIntoConstraints = false
    tableView.delegate = self
    tableView.backgroundColor = Theme.Color.canvas
    tableView.contentInsetAdjustmentBehavior = .automatic
    tableView.keyboardDismissMode = .interactive
    tableView.register(UITableViewCell.self, forCellReuseIdentifier: cellReuseIdentifier)
    view.addSubview(tableView)

    // 固定头部（可选）：贴在导航栏下方、滚动区之外
    let header = fixedHeader
    if let header {
      header.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(header)
      NSLayoutConstraint.activate([
        header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
        header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
        header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      ])
    }

    NSLayoutConstraint.activate([
      tableView.topAnchor.constraint(equalTo: header?.bottomAnchor ?? view.topAnchor),
      tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])

    dataSource = UITableViewDiffableDataSource(
      tableView: tableView,
      cellProvider: { [weak self] tableView, indexPath, row in
        guard let self else { return UITableViewCell() }
        let cell = tableView.dequeueReusableCell(
          withIdentifier: cellReuseIdentifier, for: indexPath)
        configure(cell, for: row, at: indexPath)
        return cell
      })
  }

  /// 子类覆盖：配置单元格。
  func configure(_ cell: UITableViewCell, for row: RowType, at indexPath: IndexPath) {}

  /// 子类覆盖：点行。
  func didSelect(_ row: RowType) {}

  /// 子类覆盖：返回 sections → rows。
  func buildSnapshot() -> [SectionKey: [RowType]] { [:] }

  func applySnapshot() {
    var snapshot = NSDiffableDataSourceSnapshot<SectionKey, RowType>()
    let sections = buildSnapshot()
    for section in sections.keys.sorted() {
      snapshot.appendSections([section])
      snapshot.appendItems(sections[section] ?? [], toSection: section)
    }
    dataSource.apply(snapshot, animatingDifferences: true)
  }

  func rowIdentifier(at indexPath: IndexPath) -> RowType? {
    dataSource.itemIdentifier(for: indexPath)
  }

  // MARK: - UITableViewDelegate

  func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    tableView.deselectRow(at: indexPath, animated: true)
    guard let row = rowIdentifier(at: indexPath) else { return }
    didSelect(row)
  }

  /// 侧滑删除。原生 `trailingSwipeActionsConfiguration`，不要自己挂手势。
  func tableView(
    _ tableView: UITableView,
    trailingSwipeActionsConfigurationForRowAt indexPath: IndexPath
  ) -> UISwipeActionsConfiguration? {
    guard let row = rowIdentifier(at: indexPath), swipeDeleteEnabled(for: row) else {
      return nil
    }
    let action = UIContextualAction(style: .destructive, title: nil) {
      [weak self] _, _, done in
      // 确认和取消都必须调 done：UIKit 靠它收起侧滑。只在确认分支调的话，
      // 用户点取消后那一行会一直卡在展开态（ trash 按钮露在外面）。
      self?.confirmDelete(row) { confirmed in done(confirmed) }
    }
    action.image = UIImage(systemName: "trash")
    return UISwipeActionsConfiguration(actions: [action])
  }

  // MARK: - 子类钩子

  /// 子类覆盖：该行是否可侧滑删除。
  func swipeDeleteEnabled(for row: RowType) -> Bool { false }

  /// 子类覆盖：弹二次确认后执行删除。
  ///
  /// 完成后**必须**调 `completion(Bool)`：`true` = 已删除，`false` = 用户取消。
  /// 默认实现按「没删」处理，漏调也不会把侧滑卡住。
  func confirmDelete(_ row: RowType, completion: @escaping (Bool) -> Void) {
    completion(false)
  }

  /// 二次确认删除弹窗。系统 `UIAlertController`，不要自己写 modal。
  func presentDeleteConfirmation(
    titleKey: String, confirmKey: String,
    onConfirm: @escaping () -> Void,
    onCancel: @escaping () -> Void = {}
  ) {
    present(
      NativeControls.confirmDelete(
        titleKey: titleKey, confirmKey: confirmKey,
        onConfirm: onConfirm, onCancel: onCancel),
      anchoredTo: view,
      animated: true
    )
  }
}
