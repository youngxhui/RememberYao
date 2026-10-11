import Foundation
import os

/// 全项目的时间戳格式：ISO8601，UTC，秒级精度。
///
/// 统一走这里而不是散落各处 `ISO8601DateFormatter()` —— 每个 formatter 实例
/// 都是惰性初始化的，反复 new 会明显拖慢提醒生成（一次要写几百条）。
public enum ISO8601 {
  /// 秒级精度（`2026-10-11T00:00:00Z`）。`ISO8601DateFormatter` 没有小数秒选项，
  /// 统一用秒精度，省得同一份数据出现两种长度。
  nonisolated(unsafe) static let formatter: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime]
    return f
  }()

  /// 当前时刻。
  public static func now() -> String { formatter.string(from: Date()) }

  /// Date → ISO8601 字符串。
  public static func string(_ date: Date) -> String { formatter.string(from: date) }

  /// ISO8601 字符串 → Date。解析失败返回 nil（调用方按「没有这个时间」处理）。
  public static func parse(_ value: String) -> Date? { formatter.date(from: value) }
}

/// 实体 id 生成。
///
/// 时间戳 + 进程内自增序号 + 随机后缀。
///
/// ⚠️ 自增序号是**必须的**，不能只靠随机：`openBlisterTwin` 一次要建
/// 20 板 × 144 格 = 2880 个 id，全在同一个毫秒里生成。只留 5 位随机数时，
/// 2880 个 id 撞在同 10 万空间里的期望碰撞数约 41 次；`BlisterSlotEntity.id`
/// 是 `@Attribute(.unique)`，撞了 `context.save()` 就抛错，而 `Store.persist`
/// 用的是 `try?` —— 整批孪生数据会**静默丢失**（不崩、无提示、界面显示空板）。
/// 序号保证同进程内绝不重复，随机数兜住不同进程落在同一毫秒的极端情况。
public enum ID {
  /// 进程内单调递增，配 `OSAllocatedUnfairLock` 保证并发安全（Swift 6 下
  /// `ID.generate` 可能从任意线程被调，孪生页的建格循环跑在任务里）。
  private static let counter = OSAllocatedUnfairLock<UInt64>(initialState: 0)

  public static func generate() -> String {
    let ms = Int(Date().timeIntervalSince1970 * 1000)
    let seq = counter.withLock { state -> UInt64 in
      state += 1
      return state
    }
    let noise = Int.random(in: 0..<100_000)
    return "\(ms)-\(seq)-\(String(format: "%05d", noise))"
  }
}

/// 颜色工具：`#rrggbb` / `#rgb` → `UIColor` / `SwiftUI.Color`。
public extension String {
  /// 十六进制颜色串 → RGBA 分量（0~1）。非法串返回 nil。
  var hexComponents: (r: Double, g: Double, b: Double, a: Double)? {
    var s = trimmingCharacters(in: .whitespacesAndNewlines)
    guard s.hasPrefix("#") else { return nil }
    s.removeFirst()
    guard [3, 6, 8].contains(s.count) else { return nil }
    var value: UInt64 = 0
    guard Scanner(string: s).scanHexInt64(&value) else { return nil }

    let r, g, b, a: Double
    switch s.count {
    case 3:
      r = Double((value >> 8) & 0xF) / 15
      g = Double((value >> 4) & 0xF) / 15
      b = Double(value & 0xF) / 15
      a = 1
    case 6:
      r = Double((value >> 16) & 0xFF) / 255
      g = Double((value >> 8) & 0xFF) / 255
      b = Double(value & 0xFF) / 255
      a = 1
    default:
      r = Double((value >> 24) & 0xFF) / 255
      g = Double((value >> 16) & 0xFF) / 255
      b = Double((value >> 8) & 0xFF) / 255
      a = Double(value & 0xFF) / 255
    }
    return (r, g, b, a)
  }
}
