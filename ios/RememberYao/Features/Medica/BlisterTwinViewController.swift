import UIKit

/// 板装药数字孪生：逐格镜像实体泡罩，点格子可记一次服用 / 标记损坏 / 撤销 / 恢复。
///
/// 网格用 `UICollectionView` + `UICollectionViewCompositionalLayout`：iOS 原生
/// 的等分网格方案，自带复用、自适应字号与无障碍，不需要自己算 frame。
/// 药板视觉（铝箔底 + 泡罩 + 药饼配色）由 `SlotCell` 用 `CALayer` 画 —— 格子
/// 状态会变，实时画比预渲染一批 `UIImage` 简单。
final class BlisterTwinViewController: UIViewController, ViewModelHolder {
  let viewModel: AppViewModel
  private let medicationId: String

  /// 单元格标识。diffable data source 要求 `Hashable`，槽位自带 id，
  /// 但同一格状态变化后要能刷新，所以再带上 packSeq 用于分组标题。
  struct SlotItem: Hashable {
    let slot: BlisterSlot
    let packSeq: Int
  }

  private var collectionView: UICollectionView!
  private var dataSource: UICollectionViewDiffableDataSource<Int, SlotItem>!

  private var medication: Medication? {
    viewModel.medications.first { $0.id == medicationId }
  }

  init(viewModel: AppViewModel, medicationId: String) {
    self.medicationId = medicationId
    self.viewModel = viewModel

    super.init(nibName: nil, bundle: nil)
  }

  func viewModelDataChanged() {
    applySnapshot()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = Theme.Color.canvas
    title = medication?.name ?? L10n.shared.t("twin.title")
    navigationController?.navigationBar.prefersLargeTitles = false
    configureCollectionView()
    applySnapshot()
    registerViewModelObservation()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    // 孪生页的格子会被本页改，也会被首页「已服用」改，回来必须重画
    applySnapshot()
  }

  // MARK: - 网格

  private func configureCollectionView() {
    // 每行 4 格：泡罩板常见 2×N / 3×N，4 列在手机上不挤
    let item = NSCollectionLayoutSize(
      widthDimension: .fractionalWidth(0.25),
      heightDimension: .fractionalHeight(1.0))
    let cellItem = NSCollectionLayoutItem(layoutSize: item)
    cellItem.contentInsets = NSDirectionalEdgeInsets(
      top: 4, leading: 4, bottom: 4, trailing: 4)
    let group = NSCollectionLayoutGroup.horizontal(
      layoutSize: NSCollectionLayoutSize(
        widthDimension: .fractionalWidth(1.0),
        heightDimension: .absolute(84)),
      subitems: [cellItem]
    )
    let section = NSCollectionLayoutSection(group: group)
    section.contentInsets = NSDirectionalEdgeInsets(
      top: Theme.Space.md, leading: Theme.Space.lg,
      bottom: Theme.Space.md, trailing: Theme.Space.lg)
    section.interGroupSpacing = Theme.Space.sm
    let layout = UICollectionViewCompositionalLayout(section: section)

    collectionView = UICollectionView(frame: .zero, collectionViewLayout: layout)
    collectionView.translatesAutoresizingMaskIntoConstraints = false
    collectionView.backgroundColor = Theme.Color.canvas
    collectionView.contentInsetAdjustmentBehavior = .automatic
    collectionView.delegate = self
    collectionView.register(SlotCell.self, forCellWithReuseIdentifier: SlotCell.reuseID)
    view.addSubview(collectionView)

    NSLayoutConstraint.activate([
      collectionView.topAnchor.constraint(equalTo: view.topAnchor),
      collectionView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      collectionView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      collectionView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])

    dataSource = UICollectionViewDiffableDataSource(
      collectionView: collectionView,
      cellProvider: { [weak self] collectionView, indexPath, item in
        guard let self else {
          return UICollectionViewCell()
        }
        let cell = collectionView.dequeueReusableCell(
          withReuseIdentifier: SlotCell.reuseID, for: indexPath)
        guard let slotCell = cell as? SlotCell else { return cell }
        slotCell.configure(with: item, tint: self.tint)
        return cell
      })
  }

  /// 药饼配色按药品 id 稳定取色：重录同药同色，改名不改色。
  private var tint: Domain.PillTint {
    guard let medication else { return Domain.pillTints[0] }
    return Domain.pillTints[stableHash(medication.id) % Domain.pillTints.count]
  }

  private func applySnapshot() {
    guard let medication else {
      title = L10n.shared.t("twin.notEnabled")
      return
    }
    let summary = blisterSummary(medication, viewModel.packs, viewModel.blisterSlots)
    guard summary.enabled else {
      title = L10n.shared.t("twin.notEnabled")
      var snapshot = NSDiffableDataSourceSnapshot<Int, SlotItem>()
      snapshot.appendSections([0])
      dataSource.apply(snapshot, animatingDifferences: false)
      return
    }

    // 按板序 → 格序排，与真人嗑药片的顺序一致
    let items = viewModel.packs
      .filter { $0.medicationId == medication.id }
      .sorted { $0.seq < $1.seq }
      .flatMap { pack -> [SlotItem] in
        viewModel.blisterSlots
          .filter { $0.packId == pack.id }
          .sorted { $0.index < $1.index }
          .map { SlotItem(slot: $0, packSeq: pack.seq) }
      }

    var snapshot = NSDiffableDataSourceSnapshot<Int, SlotItem>()
    snapshot.appendSections([0])
    snapshot.appendItems(items, toSection: 0)
    dataSource.apply(snapshot, animatingDifferences: false)

    let openSeq = summary.openPack?.seq ?? summary.packCount
    navigationItem.prompt = summary.fullSlots > 0
      ? L10n.shared.t(
        "medication.twinProgressOpen",
        ["seq": "\(openSeq)", "full": "\(summary.fullSlots)", "total": "\(summary.totalSlots)"])
      : L10n.shared.t("medication.twinProgressDone")
  }

  // MARK: - 点格子

  private func presentSlotActions(for item: SlotItem, sourceView: UIView?) {
    let alert = UIAlertController(
      title: L10n.shared.t(
        "twin.slotTitle",
        ["index": "\(item.slot.index + 1)", "seq": "\(item.packSeq)"]),
      message: nil,
      preferredStyle: .actionSheet
    )

    switch item.slot.status {
    case .full:
      alert.addAction(
        UIAlertAction(title: L10n.shared.t("twin.actionConsume"), style: .default) {
          [weak self] _ in
          self?.presentPersonChooser(for: item)
        })
      alert.addAction(
        UIAlertAction(title: L10n.shared.t("twin.actionVoid"), style: .destructive) {
          [weak self] _ in
          Task { await self?.viewModel.voidBlisterSlot(item.slot.id) }
        })

    case .empty:
      // 有服用记录才能撤销；历史补的空格（没记录）无撤销可言
      if item.slot.usageId != nil {
        alert.addAction(
          UIAlertAction(title: L10n.shared.t("twin.actionUndo"), style: .default) {
            [weak self] _ in
            Task {
              if let usageId = item.slot.usageId {
                await self?.viewModel.undoUsage(usageId)
              }
            }
          })
      }
      alert.addAction(
        UIAlertAction(title: L10n.shared.t("twin.actionRestore"), style: .default) {
          [weak self] _ in
          Task { await self?.viewModel.restoreBlisterSlot(item.slot.id) }
        })

    case .void:
      alert.addAction(
        UIAlertAction(title: L10n.shared.t("twin.actionRestore"), style: .default) {
          [weak self] _ in
          Task { await self?.viewModel.restoreBlisterSlot(item.slot.id) }
        })
    }

    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    present(alert, anchoredTo: sourceView ?? view, animated: true)
  }

  /// 手动记一次服用要知道是谁吃的：多名成员时先选人，一名时直接记。
  private func presentPersonChooser(for item: SlotItem) {
    let persons = viewModel.persons
    guard !persons.isEmpty else { return }
    guard persons.count > 1 else {
      Task { await viewModel.consumeBlisterSlot(item.slot.id, personId: persons[0].id) }
      return
    }
    presentSingleChoice(
      titleKey: "twin.whoTook",
      options: persons.map { (key: $0.id, label: $0.name) },
      selectedKey: nil,
      sourceView: view
    ) { [weak self] personId in
      Task { await self?.viewModel.consumeBlisterSlot(item.slot.id, personId: personId) }
    }
  }
}

extension BlisterTwinViewController: UICollectionViewDelegate {
  func collectionView(
    _ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath
  ) {
    collectionView.deselectItem(at: indexPath, animated: true)
    guard let item = dataSource.itemIdentifier(for: indexPath) else { return }
    presentSlotActions(
      for: item, sourceView: collectionView.cellForItem(at: indexPath))
  }
}

// MARK: - 格子

/// 单格泡罩。三层：铝箔底 → 透明泡罩 → 药饼。服后的格子是顶破的凹坑，
/// 损坏的打叉。全部用 `CALayer` 画，不引图片资源。
final class SlotCell: UICollectionViewCell {
  static let reuseID = "SlotCell"

  private let foilLayer = CALayer()
  private let blisterLayer = CALayer()
  private let pillLayer = CALayer()
  private let crossLayer = CAShapeLayer()

  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.layer.addSublayer(foilLayer)
    contentView.layer.addSublayer(blisterLayer)
    contentView.layer.addSublayer(pillLayer)
    contentView.layer.addSublayer(crossLayer)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }

  func configure(with item: BlisterTwinViewController.SlotItem, tint: Domain.PillTint) {
    switch item.slot.status {
    case .full:
      pillLayer.backgroundColor = Theme.Color.hex(tint.cap).cgColor
      pillLayer.opacity = 0.94
      blisterLayer.backgroundColor = UIColor(white: 1, alpha: 0.35).cgColor
      blisterLayer.borderColor = UIColor(white: 1, alpha: 0.7).cgColor
      crossLayer.path = nil

    case .empty:
      // 服后的格子：顶破的凹坑，只剩箔上的印子
      pillLayer.backgroundColor = UIColor.clear.cgColor
      blisterLayer.backgroundColor = UIColor(white: 0, alpha: 0.06).cgColor
      blisterLayer.borderColor = UIColor(white: 0, alpha: 0.12).cgColor
      crossLayer.path = nil

    case .void:
      pillLayer.backgroundColor = UIColor.clear.cgColor
      blisterLayer.backgroundColor = UIColor(white: 0, alpha: 0.06).cgColor
      blisterLayer.borderColor = UIColor(white: 0, alpha: 0.12).cgColor
      let inset = blisterLayer.frame.insetBy(dx: 4, dy: 4)
      let path = UIBezierPath()
      path.move(to: CGPoint(x: inset.minX, y: inset.minY))
      path.addLine(to: CGPoint(x: inset.maxX, y: inset.maxY))
      path.move(to: CGPoint(x: inset.maxX, y: inset.minY))
      path.addLine(to: CGPoint(x: inset.minX, y: inset.maxY))
      crossLayer.path = path.cgPath
      crossLayer.strokeColor = Theme.Color.danger.cgColor
      crossLayer.lineWidth = 2
      crossLayer.fillColor = nil
    }

    accessibilityIdentifier = "twin-slot-\(item.slot.id)"
    isAccessibilityElement = true
    accessibilityLabel = L10n.shared.t(
      "twin.slotTitle",
      ["index": "\(item.slot.index + 1)", "seq": "\(item.packSeq)"])
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // 复用会带上一格的 frame，三层都要按新 bounds 重排
    let bounds = contentView.bounds
    foilLayer.frame = bounds
    foilLayer.cornerRadius = 8
    foilLayer.borderWidth = 1
    foilLayer.borderColor = UIColor(white: 0, alpha: 0.08).cgColor
    foilLayer.backgroundColor = UIColor(
      red: 0.86, green: 0.86, blue: 0.84, alpha: 1).cgColor

    let inset = bounds.insetBy(dx: 6, dy: 6)
    blisterLayer.frame = inset
    blisterLayer.cornerRadius = min(inset.width, inset.height) / 2
    blisterLayer.borderWidth = 1

    pillLayer.frame = inset.insetBy(dx: 7, dy: 7)
    pillLayer.cornerRadius = min(pillLayer.bounds.width, pillLayer.bounds.height) / 2
    crossLayer.frame = bounds
  }

  override func prepareForReuse() {
    super.prepareForReuse()
    crossLayer.path = nil
    crossLayer.strokeColor = nil
    pillLayer.backgroundColor = UIColor.clear.cgColor
    pillLayer.opacity = 1
  }
}
