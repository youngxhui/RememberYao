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
  // MARK: - 分区键

  /// 分区键。故意不叫 `Section`：子类都会声明自己的 `Section` enum，
  /// 同名会把继承来的这个别名遮住。
  typealias SectionKey = Int

  // MARK: - 表格

  private(set) var tableView: UITableView!
  private(set) var dataSource: UITableViewDiffableDataSource<SectionKey, RowType>!

  var cellReuseIdentifier: String { "Cell" }

  // MARK: - 子类钩子（必须在类主体，才能在子类里 override）

  /// 子类覆盖：分区的标题（nil = 不显示标题）。参数是快照里的分区 key，
  /// 不是表格中的分区索引 —— 索引由 delegate 收到后经 dataSource 反查传入
  func sectionTitle(for section: SectionKey) -> String? { nil }

  /// 子类覆盖：为某行出 cell。默认按 `cellReuseIdentifier` 出普通单元格并
  /// `configure`；需要异形行（库存进度条等）的屏幕覆写它，自己 dequeue 对应的
  /// cell 类（参照 `FormScreenViewController` 的 FieldCell 用法）
  func cell(
    for row: RowType, in tableView: UITableView, at indexPath: IndexPath
  ) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(
      withIdentifier: cellReuseIdentifier, for: indexPath)
    configure(cell, for: row, at: indexPath)
    return cell
  }

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

  // MARK: - Lifecycle

  /// 子类覆盖：数据变更后刷新本屏。
  ///
  /// 列表屏的数据只来自 ViewModel：冷启动时首屏的 `viewWillAppear` 可能赶在
  /// 首次 `refresh()` 完成之前（`loading` 还是 true，`reload()` 被守卫挡掉），
  /// 观察回调是唯一能补上的时机 —— 没有它，冷启动的首页会一直空着，直到切一次
  /// tab 再回来。写操作（标记服用等）后的刷新也一并走这里
  func viewModelDataChanged() {
    reload()
  }

  /// 子类覆盖：重新读 `Store` 并 `applySnapshot()`。
  func reload() {
    applySnapshot()
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = Theme.Color.canvas
    configureTableView()
    registerViewModelObservation()
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

    NSLayoutConstraint.activate([
      tableView.topAnchor.constraint(equalTo: view.topAnchor),
      tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      tableView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])

    dataSource = UITableViewDiffableDataSource(
      tableView: tableView,
      cellProvider: { [weak self] tableView, indexPath, row in
        guard let self else { return UITableViewCell() }
        return cell(for: row, in: tableView, at: indexPath)
      })
  }

  // MARK: - UITableViewDelegate

  /// 分区标题视图。
  ///
  /// 走 `viewForHeaderInSection` 而不是只给 `titleForHeaderInSection`：后者在
  /// 本表的 diffable data source 组合下能取到标题、header view 的帧却恒为 0
  /// （真机实测标题不渲染），显式给视图行为确定。返回 nil 的分区不显示标题。
  func tableView(_ tableView: UITableView, viewForHeaderInSection section: Int) -> UIView? {
    // `section` 是表格里的分区**索引**，不是快照里的分区 key：空分区不进快照，
    // 两者会错位（今天没有安排时，库存分区就占到索引 0），必须经 dataSource
    // 反查出 key 再问标题
    guard let key = dataSource.sectionIdentifier(for: section),
      let title = sectionTitle(for: key)
    else { return nil }
    let view = UITableViewHeaderFooterView()
    view.textLabel?.text = title
    return view
  }

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
}
