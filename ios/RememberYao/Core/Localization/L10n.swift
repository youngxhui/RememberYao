import Foundation

/// 界面语言。
public enum Language: String, Codable, CaseIterable, Sendable {
  case zh
  case en

  /// 语言跟随 App 自身偏好，不是系统 locale —— 用户可能在中文系统里用英文界面。
  public static func resolve(preferred: Language?, system: String) -> Language {
    if let preferred { return preferred }
    return Language(code: system)
  }

  /// 系统语言码（如 `zh-Hans-CN`）→ 归一后的语言。
  public init(code: String) {
    let lower = code.lowercased()
    if lower.hasPrefix("zh") { self = .zh }
    else if lower.hasPrefix("en") { self = .en }
    else { self = .zh }
  }

  /// `Intl` / `DateFormatter` 用的 locale 标识。
  public var localeIdentifier: String {
    switch self {
    case .zh: return "zh_CN"
    case .en: return "en_US"
    }
  }

  /// `.lproj` 目录名（String Catalog 生成的就是它）。
  ///
  /// 与 `localeIdentifier` 不是一回事：`zh_CN.lproj` 这种带下划线的名字
  /// Xcode 不会生成，用它查会永远落到系统语言，App 内切语言就失效了。
  public var bundleName: String {
    switch self {
    case .zh: return "zh-Hans"
    case .en: return "en"
    }
  }

  /// 列举时的连接词（中文用顿号，英文用逗号）。
  public var listSeparator: String {
    switch self {
    case .zh: return "、"
    case .en: return ", "
    }
  }
}

/// 本地化运行时。
///
/// 词条用 String Catalog（`.xcstrings`）承载，运行时通过 `NSLocalizedString`
/// 读取；替换占位符（`{person}` / `{count}`）的逻辑集中在这里，避免每个调用点
/// 自己拼字符串。
@MainActor
public final class L10n {
  public static let shared = L10n()

  /// 当前语言。设置页切换后写 `UserDefaults` 并通知界面刷新。
  public var language: Language {
    didSet { UserDefaults.standard.set(language.rawValue, forKey: Self.storageKey) }
  }

  private static let storageKey = "rememberyao.language"

  private init() {
    let stored = UserDefaults.standard.string(forKey: Self.storageKey)
      .flatMap(Language.init(rawValue:))
    let system = Locale.preferredLanguages.first ?? "zh-Hans-CN"
    language = Language.resolve(preferred: stored, system: system)
  }

  /// 非隔离访问：通知调度跑在 `@MainActor` 之外的 Task 里也要能取到当前语言。
  nonisolated public static var current: Language {
    MainActor.assumeIsolated { shared.language }
  }

  /// 供通知层（React 之外）使用的翻译函数。
  nonisolated public static var translator: Translate {
    Translate(language: current)
  }

  /// 取一条文案，替换 `{key}` 占位符。
  public func t(_ key: String) -> String {
    NSLocalizedString(key, bundle: .main, comment: "")
  }

  /// 带占位符参数的文案。真正做替换的是 `Translate`，这里只是转发 ——
  /// 语言切换后 translator 会重建，转发拿到的永远是当前语言。
  public func t(_ key: String, _ args: [String: String]) -> String {
    Self.translator.t(key, args)
  }

  /// 单位标签（片 / 粒）。
  nonisolated public static func unitLabel(_ unit: MedicationUnit) -> String {
    switch unit {
    case .tablet: return translator.t("medication.unitTablet")
    case .pill: return translator.t("medication.unitPill")
    }
  }

  /// 包装形式标签（板装 / 瓶装 / 散装）。
  nonisolated public static func typeLabel(_ type: MedicationType) -> String {
    switch type {
    case .blister: return translator.t("medication.typeBlister")
    case .bottle: return translator.t("medication.typeBottle")
    case .loose: return translator.t("medication.typeLoose")
    }
  }

  /// 用途分类标签（慢性病 / 临时用药 / 保健品）。
  nonisolated public static func categoryLabel(_ category: MedicationCategory) -> String {
    switch category {
    case .chronic: return translator.t("medication.categoryChronic")
    case .acute: return translator.t("medication.categoryAcute")
    case .supplement: return translator.t("medication.categorySupplement")
    }
  }

  /// 性别标签。
  nonisolated public static func genderLabel(_ gender: Gender) -> String {
    switch gender {
    case .male: return translator.t("person.genderMale")
    case .female: return translator.t("person.genderFemale")
    case .other: return translator.t("person.genderOther")
    }
  }

  /// 默认用药人（「自己」）的展示名字：跟随当前界面语言。
  nonisolated public static func defaultPersonName() -> String {
    translator.t("person.defaultName")
  }

  /// 日期 / 星期走 `Intl` 等价的 `DateFormatter`，不硬编码语序
  /// （中文「9月5日」vs 英文「Sep 5」）。
  nonisolated public static func formatDate(_ date: Date, style: DateStyle = .monthDay)
    -> String
  {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: current.localeIdentifier)
    switch style {
    case .monthDay:
      formatter.setLocalizedDateFormatFromTemplate("MMMMd")
    case .full:
      formatter.setLocalizedDateFormatFromTemplate("yyyyMMMMdEEE")
    case .monthDayTime:
      formatter.setLocalizedDateFormatFromTemplate("MMMMd HH:mm")
    }
    return formatter.string(from: date)
  }

  public enum DateStyle: Sendable {
    case monthDay
    case full
    case monthDayTime
  }

  /// 星期几（中文「星期六」/ 英文「Saturday」），模板里**不能**再加「星期」前缀。
  nonisolated public static func weekday(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: current.localeIdentifier)
    formatter.setLocalizedDateFormatFromTemplate("EEEE")
    return formatter.string(from: date)
  }
}

/// 翻译函数。
///
/// 占位符用字典传：`t("notification.body", ["person": name, "medication": med,
/// "amount": amount])`。词条里的占位符写成 `{person}` / `{count}`，字典里多给的
/// 键会被忽略、少给的键保持原样 —— 后者能在真机上一眼看出漏传，比静默吞掉好。
public struct Translate: Sendable {
  let language: Language

  public func t(_ key: String, _ args: [String: String] = [:]) -> String {
    let template = lookup(key)
    guard !args.isEmpty else { return template }
    var result = template
    for (placeholder, value) in args {
      result = result.replacingOccurrences(of: "{\(placeholder)}", with: value)
    }
    return result
  }

  /// 支持 `translator("key")` 直接调用，通知层写起来就是一行。
  public func callAsFunction(_ key: String, _ args: [String: String] = [:]) -> String {
    t(key, args)
  }

  private func lookup(_ key: String) -> String {
    // 语言可能不在 .lproj 里，退回开发语言（中文）
    if let path = Bundle.main.path(
      forResource: language.bundleName, ofType: "lproj"),
      let bundle = Bundle(path: path)
    {
      let value = NSLocalizedString(key, bundle: bundle, value: "", comment: "")
      if !value.isEmpty { return value }
    }
    return NSLocalizedString(key, bundle: .main, value: key, comment: "")
  }
}
