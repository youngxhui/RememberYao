import UIKit

/// 表单屏基类：`UITableView` inset grouped + 原生输入单元格 + 底部固定主按钮。
///
/// 表单一律用表格而不是一摉 `UIStackView`：系统表格自带分组圆角、发丝线、
/// 键盘避让（`UITableView` 会自动滚动到当前第一响应者）、大字号适配。
/// 输入框用 `UITextField` 直接嵌单元格右侧，label 走单元格左侧文字。
@MainActor
class FormScreenViewController<RowType: Hashable & Sendable>: UIViewController,
  UITableViewDelegate
{
  private(set) var tableView: UITableView!
  private var dataSource: UITableViewDiffableDataSource<SectionKey, RowType>!
  private var bottomConstraint: NSLayoutConstraint!

  enum SectionKey: Int {
    case form
  }

  /// 底部主按钮（保存 / 提交）。
  let primaryButton = UIButton(type: .system)

  /// 键盘高度变化时把按钮顶上去。表单主操作不能被键盘挡住。
  ///
  /// 块式 `addObserver` 返回的 token 必须留着并主动移除：丢掉它的话，
  /// 通知中心会一直持有这个块，表单页推一次就多一个常驻观察者，
  /// 之后每次键盘动所有历史页面都会跟着跑一遍（还会读已释放的约束）。
  private var keyboardObserver: NSObjectProtocol?

  private func observeKeyboard() {
    keyboardObserver = NotificationCenter.default.addObserver(
      forName: UIResponder.keyboardWillChangeFrameNotification,
      object: nil, queue: .main
    ) { [weak self] note in
      guard let self,
        let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey]
          as? CGRect
      else { return }
      let keyboardTop = view.convert(frame, from: nil).minY
      let offset = max(0, view.bounds.height - keyboardTop)
      bottomConstraint.constant = -offset - Theme.Space.lg
      UIView.animate(withDuration: 0.25) { self.view.layoutIfNeeded() }
    }
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = Theme.Color.canvas
    configureTableView()
    configurePrimaryButton()
    observeKeyboard()
    registerViewModelObservation()
  }

  deinit {
    // deinit 是 nonisolated 的，而移除观察者要在主线程做。UIKit 的 VC 本来
    // 就在主线程释放，所以 assumeIsolated 在这里是安全的。
    MainActor.assumeIsolated {
      if let keyboardObserver {
        NotificationCenter.default.removeObserver(keyboardObserver)
      }
    }
  }

  private func configureTableView() {
    tableView = UITableView(frame: .zero, style: .insetGrouped)
    tableView.translatesAutoresizingMaskIntoConstraints = false
    tableView.delegate = self
    tableView.backgroundColor = Theme.Color.canvas
    tableView.contentInsetAdjustmentBehavior = .automatic
    // 可滚动表单：点空白处收键盘，但别吞掉按钮点击
    tableView.keyboardDismissMode = .interactive
    tableView.register(FieldCell.self, forCellReuseIdentifier: FieldCell.reuseID)
    tableView.register(
      UITableViewCell.self, forCellReuseIdentifier: "ActionCell")
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
        if let field = self.field(for: row) {
          let cell = tableView.dequeueReusableCell(
            withIdentifier: FieldCell.reuseID, for: indexPath)
          guard let fieldCell = cell as? FieldCell else { return cell }
          fieldCell.configure(with: field)
          // 闭包在这里挂而不是 willDisplay：cellProvider 每次配置都会跑，
          // willDisplay 只在可见时跑，滚动后新行可能拿不到回调
          fieldCell.onValueChange = { [weak self] value in
            self?.setValue(value, for: row)
          }
          fieldCell.onReadOnlyTap = { [weak self] in
            self?.didSelect(row, at: indexPath)
          }
          return cell
        }
        let cell = tableView.dequeueReusableCell(
          withIdentifier: "ActionCell", for: indexPath)
        configureAction(cell, for: row)
        return cell
      })
  }

  private func configurePrimaryButton() {
    var configuration = UIButton.Configuration.filled()
    configuration.cornerStyle = .capsule
    configuration.contentInsets = NSDirectionalEdgeInsets(
      top: Theme.Space.md, leading: Theme.Space.xl, bottom: Theme.Space.md,
      trailing: Theme.Space.xl)
    primaryButton.configuration = configuration
    primaryButton.configurationUpdateHandler = { button in
      var config = button.configuration ?? configuration
      config.title = self.primaryTitleKey.isEmpty
        ? nil : L10n.shared.t(self.primaryTitleKey)
      button.configuration = config
      button.isEnabled = self.isFormValid
      button.alpha = button.isEnabled ? 1 : 0.5
    }
    primaryButton.addTarget(self, action: #selector(primaryTapped), for: .touchUpInside)
    primaryButton.accessibilityIdentifier = "form-primary-button"
    primaryButton.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(primaryButton)

    bottomConstraint = primaryButton.bottomAnchor.constraint(
      equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -Theme.Space.lg)
    NSLayoutConstraint.activate([
      primaryButton.leadingAnchor.constraint(
        equalTo: view.leadingAnchor, constant: Theme.Space.page),
      primaryButton.trailingAnchor.constraint(
        equalTo: view.trailingAnchor, constant: -Theme.Space.page),
      primaryButton.heightAnchor.constraint(equalToConstant: Theme.Size.button),
      bottomConstraint,
    ])
  }

  // MARK: - 子类钩子

  /// 主按钮标题的 i18n 键。
  var primaryTitleKey: String { "" }
  /// 表单是否可提交。用来驱动主按钮禁用态。
  var isFormValid: Bool { true }
  /// 返回该行对应的输入字段；nil 表示这是普通操作行。
  func field(for row: RowType) -> FieldCell.Field? { nil }
  /// 配置普通操作行。
  func configureAction(_ cell: UITableViewCell, for row: RowType) {}
  /// 子类覆盖：返回 sections → rows。
  func buildRows() -> [SectionKey: [RowType]] { [:] }
  /// 主按钮点击。
  @objc func primaryTapped() {}

  /// 子类覆盖：输入字段值变化。`row` 是 `buildRows()` 里返回的那个行标识。
  func setValue(_ value: String, for row: RowType) {}

  /// ViewModel 数据变更后刷新表单行。
  func viewModelDataChanged() {}

  func applyRows() {
    var snapshot = NSDiffableDataSourceSnapshot<SectionKey, RowType>()
    let rows = buildRows()
    for section in rows.keys.sorted(by: { $0.rawValue < $1.rawValue }) {
      snapshot.appendSections([section])
      snapshot.appendItems(rows[section] ?? [], toSection: section)
    }
    dataSource.apply(snapshot, animatingDifferences: false)
  }

  func reloadRows() {
    applyRows()
    primaryButton.setNeedsUpdateConfiguration()
  }

  // MARK: - UITableViewDelegate

  func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
    tableView.deselectRow(at: indexPath, animated: true)
    guard let row = dataSource.itemIdentifier(for: indexPath) else { return }
    didSelect(row, at: indexPath)
  }

  /// 子类覆盖：点操作行。
  func didSelect(_ row: RowType, at indexPath: IndexPath) {}
}
