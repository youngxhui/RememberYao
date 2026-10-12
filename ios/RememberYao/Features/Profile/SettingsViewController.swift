import UIKit

enum SettingsSection: Int, CaseIterable {
  case general
  case reminder
  case about
}

enum SettingsRow: Hashable {
  case language
  case notifications
  case snooze
  case quiet
  case sound
  case missedStreak
  case privacy
  case version
}

/// 设置页：通知总开关、稍后提醒间隔、免打扰时段、声音、连续漏服阈值、语言。
///
/// 全部原生控件：`UITableView` inset grouped + 单元格右侧 `UISwitch`、
/// `UIAlertController` 单选。分组列表就是 iOS 设置页的标准形态，
/// 不需要自造任何东西。
final class SettingsViewController: ListScreenViewController<SettingsRow>, ViewModelHolder {

  init(viewModel: AppViewModel) {
    self.viewModel = viewModel
    super.init(nibName: nil, bundle: nil)
  }


  var viewModel: AppViewModel!

  private var settings: Settings { viewModel.settings }

  override func viewDidLoad() {
    super.viewDidLoad()
    title = L10n.shared.t("settings.title")
    reload()
    registerViewModelObservation()
  }

  override func reload() {
    guard !viewModel.loading else { return }
    applySnapshot()
  }

  override func buildSnapshot() -> [SectionKey: [SettingsRow]] {
    [
      SettingsSection.general.rawValue: [.language],
      SettingsSection.reminder.rawValue: [.notifications, .snooze, .quiet, .sound, .missedStreak],
      SettingsSection.about.rawValue: [.privacy, .version],
    ]
  }

  override func configure(_ cell: UITableViewCell, for row: SettingsRow, at indexPath: IndexPath) {
    var content = UIListContentConfiguration.valueCell()
    switch row {
    case .language:
      content.text = L10n.shared.t("settings.language")
      content.secondaryText = L10n.shared.language == .zh ? "中文" : "English"
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "settings-language-row"

    case .notifications:
      content.text = L10n.shared.t("settings.notificationsTitle")
      content.secondaryText = L10n.shared.t("settings.notificationsSub")
      content.secondaryTextProperties.numberOfLines = 1
      cell.accessoryView = Self.toggle(
        isOn: settings.notificationsEnabled,
        identifier: "settings-notifications-switch"
      ) { [weak self] isOn in
        self?.update { $0.notificationsEnabled = isOn }
      }

    case .snooze:
      content.text = L10n.shared.t("settings.snoozeTitle")
      content.secondaryText = L10n.shared.t(
        "settings.minutesValue", ["count": "\(settings.snoozeMinutes)"])
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "settings-snooze-row"

    case .quiet:
      content.text = L10n.shared.t("settings.quietTitle")
      content.secondaryText = quietSummary()
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "settings-quiet-row"

    case .sound:
      content.text = L10n.shared.t("settings.soundTitle")
      content.secondaryText = L10n.shared.t("settings.soundSub")
      content.secondaryTextProperties.numberOfLines = 1
      cell.accessoryView = Self.toggle(
        isOn: settings.soundEnabled, identifier: "settings-sound-switch"
      ) { [weak self] isOn in
        self?.update { $0.soundEnabled = isOn }
      }

    case .missedStreak:
      content.text = L10n.shared.t("settings.notifyMissedTitle")
      content.secondaryText = settings.missedAlertStreak == 0
        ? L10n.shared.t("settings.quietOff")
        : L10n.shared.t(
          "settings.notifyMissedSub", ["count": "\(settings.missedAlertStreak)"])
      cell.accessoryType = .disclosureIndicator
      cell.accessibilityIdentifier = "settings-missed-streak-row"

    case .privacy:
      content.text = L10n.shared.t("settings.privacyTitle")
      content.secondaryText = L10n.shared.t("settings.privacySub")
      content.secondaryTextProperties.numberOfLines = 2
      cell.accessoryType = .disclosureIndicator

    case .version:
      content.text = L10n.shared.t("settings.version")
      content.secondaryText = Bundle.main.infoDictionary?[
        "CFBundleShortVersionString"] as? String ?? "1.0.0"
      cell.selectionStyle = .none
    }
    cell.contentConfiguration = content
  }

  /// 免打扰时段摘要。跨零点的区间（22:00–07:00）也要读得懂。
  private func quietSummary() -> String {
    guard let start = settings.quietStart, let end = settings.quietEnd else {
      return L10n.shared.t("settings.quietOff")
    }
    return "\(start) – \(end)"
  }

  private static func toggle(
    isOn: Bool, identifier: String, onChange: @escaping (Bool) -> Void
  ) -> UISwitch {
    let toggle = ClosureSwitch(isOn: isOn, identifier: identifier)
    toggle.onChange = onChange
    return toggle
  }

  private func update(_ patch: @escaping (inout Settings) -> Void) {
    Task { await viewModel.updateSettings(patch: patch) }
  }

  override func didSelect(_ row: SettingsRow) {
    switch row {
    case .language:
      presentLanguageChooser()

    case .snooze:
      presentSingleChoice(
        titleKey: "settings.snoozeTitle",
        options: Domain.snoozeOptions.map {
          (key: "\($0)", label: L10n.shared.t("settings.minutesValue", ["count": "\($0)"]))
        },
        selectedKey: "\(settings.snoozeMinutes)",
        sourceView: nil
      ) { [weak self] key in
        guard let self, let minutes = Int(key) else { return }
        self.update { $0.snoozeMinutes = minutes }
      }

    case .quiet:
      presentQuietHoursEditor()

    case .missedStreak:
      presentSingleChoice(
        titleKey: "settings.notifyMissedTitle",
        options: [0, 2, 3, 5].map {
          (key: "\($0)",
           label: $0 == 0
             ? L10n.shared.t("settings.quietOff")
             : L10n.shared.t("settings.notifyMissedSub", ["count": "\($0)"]))
        },
        selectedKey: "\(settings.missedAlertStreak)",
        sourceView: nil
      ) { [weak self] key in
        guard let self, let count = Int(key) else { return }
        self.update { $0.missedAlertStreak = count }
      }

    case .privacy:
      presentPrivacy()

    default:
      break
    }
  }

  private func presentLanguageChooser() {
    presentSingleChoice(
      titleKey: "settings.language",
      options: [
        (key: Language.zh.rawValue, label: "中文"),
        (key: Language.en.rawValue, label: "English"),
      ],
      selectedKey: L10n.shared.language.rawValue,
      sourceView: nil
    ) { [weak self] key in
      guard let self, let language = Language(rawValue: key) else { return }
      L10n.shared.language = language
      // 通知栏文案在语言切换后必须重注册，否则按钮标题停留在旧语言
      NotificationScheduler.shared.registerLocalizedTexts()
      Task { await NotificationScheduler.shared.resync() }
      self.reload()
      // tab 标题也要跟着变
      self.tabBarController?.viewControllers?.forEach { controller in
        guard let navigation = controller as? UINavigationController,
          let root = navigation.viewControllers.first
        else { return }
        root.title = L10n.shared.t(Self.titleKey(for: root))
        navigation.tabBarItem.title = root.title
      }
    }
  }

  private static func titleKey(for controller: UIViewController) -> String {
    switch controller {
    case is HomeViewController: return "tab.home"
    case is MedicaListViewController: return "tab.medica"
    case is ProfileViewController: return "tab.profile"
    default: return "tab.home"
    }
  }

  /// 免打扰时段编辑。原生 alert 两个时间字段。
  private func presentQuietHoursEditor() {
    let alert = UIAlertController(
      title: L10n.shared.t("settings.quietTitle"),
      message: L10n.shared.t("settings.quietSub"),
      preferredStyle: .alert
    )
    alert.addTextField { field in
      field.placeholder = "22:00"
      field.text = self.settings.quietStart ?? ""
      field.keyboardType = .numbersAndPunctuation
      field.accessibilityIdentifier = "settings-quiet-start-input"
    }
    alert.addTextField { field in
      field.placeholder = "07:00"
      field.text = self.settings.quietEnd ?? ""
      field.keyboardType = .numbersAndPunctuation
      field.accessibilityIdentifier = "settings-quiet-end-input"
    }
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.done"), style: .default) { [weak self] _ in
        guard let self else { return }
        let start = alert.textFields?[0].text ?? ""
        let end = alert.textFields?[1].text ?? ""
        // 免打扰成对出现：只填一端等于禁用
        let valid = Self.isValidTime(start) && Self.isValidTime(end)
        self.update {
          $0.quietStart = valid ? start : nil
          $0.quietEnd = valid ? end : nil
        }
        self.reload()
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("settings.quietOff"), style: .destructive) {
        [weak self] _ in
        self?.update {
          $0.quietStart = nil
          $0.quietEnd = nil
        }
        self?.reload()
      })
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.cancel"), style: .cancel))
    present(alert, animated: true)
  }

  private static func isValidTime(_ value: String) -> Bool {
    let parts = value.split(separator: ":")
    guard parts.count == 2, let hour = Int(parts[0]), let minute = Int(parts[1])
    else { return false }
    return (0...23).contains(hour) && (0...59).contains(minute)
  }

  private func presentPrivacy() {
    let alert = UIAlertController(
      title: L10n.shared.t("settings.privacyTitle"),
      message: L10n.shared.t("settings.privacyBody"),
      preferredStyle: .alert
    )
    alert.addAction(
      UIAlertAction(title: L10n.shared.t("common.done"), style: .default))
    present(alert, animated: true)
  }

    required init?(coder: NSCoder) {
      fatalError("init(coder:) has not been implemented")
    }
}
