# RememberYao

家庭用药提醒 App：记录家里每个人的用药配置，到点本地通知提醒，服用后自动扣减库存。

**交付物是根目录的两端原生工程**（iOS / Android）。Expo 原型已归档在 `expo/`（只读参照），
业务规则以 [docs/domain-spec.md](docs/domain-spec.md) 为唯一契约，代理约定见 [AGENTS.md](AGENTS.md)。

## 功能

- **今日**：当天的全部用药提醒，卡片堆叠上下滑换卡，支持「已服用 / 跳过 / 补服」；漏服超过 1 小时宽限期才标记漏服，漏服可补记
- **药箱**：药品库存管理（剩余/总量、库存进度条、按计划估算可服用天数、低库存提醒、按数量 / 按板补货）；板装药的数字孪生逐格镜像实体泡罩
- **用药人**：家庭成员管理（头像照片），每人可配置多种用药方案（药品多选、每种单独剂量、每日次数与具体时间、起止日期）。首次启动自动创建默认用户「自己」（不可删除），配药开箱即用
- **通知**：到点本地通知推送，通知栏直接「已服用 / 跳过」；免打扰只压声音不压通知；连续漏服额外提醒
- **订阅**：RememberYao Pro（RevenueCat 远程付费墙 + Customer Center）
- **多语言**：中文 / 英文，跟随 App 内偏好（不跟系统 locale）

## 技术栈

| | iOS | Android |
| --- | --- | --- |
| 路径 | `ios/` | `android/` |
| 语言 / UI | Swift 6 + SwiftUI（iOS 26 液态玻璃） | Kotlin 2.4+ + Jetpack Compose |
| 最低版本 | iOS 26 | Android 14（API 34） |
| 持久化 | SwiftData | Room |
| 通知 | UserNotifications | NotificationManager + AlarmManager |
| 订阅 | RevenueCat（SPM） | RevenueCat |

## 快速开始

```bash
# iOS：用 Xcode 打开 ios/rememberyao.xcodepj，或命令行：
xcodebuild -project ios/rememberyao.xcodeproj -scheme rememberyao \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
xcodebuild -project ios/rememberyao.xcodeproj -scheme rememberyao test   # 领域层单测

# 词条：改 expo/src/i18n/dictionaries/ 后重新生成 iOS String Catalog（不手抄）
bun scripts/gen-localizable-catalog.ts
```

## 目录结构

```
ios/rememberyao/
  App/        @main、AppEnvironment（SwiftData 容器 + Store）、AppState、
              NavigationRouter（三个 tab 的导航 path）、AvatarPhotoStore
  Core/       Model（实体 + 工具）/ Domain（常量 + 纯函数 + Decisions）/
              Data（SwiftData 实体 + Repository + Store）/
              Notification / Localization / Subscription
  Features/   Onboarding / Home / Medica / Profile（每屏一个 SwiftUI 文件）
  UI/         Theme（设计令牌）+ Components（SectionCard / Chip / FormKit / SettingRow / …）
android/      Gradle KTS 工程（模板已就位，业务代码待落地）
docs/         domain-spec.md（两端领域契约）
expo/         Expo 原型（归档参照，不再交付）
scripts/      gen-localizable-catalog.ts（词典 → String Catalog）
```

## 数据模型

`Medication` 药品 · `Person` 用药人 · `MedicationPlan` 用药配置（药品 × 人 × 剂量 ×
每日时间 × 起止日期 × 启用）· `Reminder` 提醒（提前 7 天生成，状态
`pending → taken / skipped / missed`）· `MedicationUsage` 服用记录（永久保留、名称快照）·
`BlisterPack` / `BlisterSlot` 板装孪生 · `Settings` 全局设置单行。

## 数据层

SwiftData / Room + **纯函数决策 + Store 增量落库**：`Decisions` 只算不改，
`Store` 一个事务只动涉及的行，写完重排通知。界面读用 `@Query` 订阅，写走
`AppEnvironment.shared.store`。提醒生成 / 库存扣减 / 孪生建板是纯函数，
由 `ios/rememberyaoTests/DomainTests.swift` 用固定向量锁死两端一致。

## 提醒生命周期

1. 配置保存后按「今天起 7 天」生成提醒，并调度本地通知（iOS 64 条上限，只排最近的 60 条）
2. 到点推送；**超过 1 小时宽限期**未处理才标记「漏服」
3. 已服用 / 跳过 / 漏服均可再次操作（漏服可补服，记录标记 `late`）
4. 修改配置：废弃未处理的提醒并按新配置重新生成，已处理的记录保留
5. 回前台或数据变更时重排通知

## 测试

```bash
xcodebuild -project ios/rememberyao.xcodeproj -scheme rememberyao test   # 领域层固定向量
```

界面验证由开发者在真机 / 模拟器上确认（代理不主动跑 UI 自动化）。

## 待办

- Android 端全部业务代码（当前仅模板）：Kotlin 2.4+、minSdk 34、Decisions / Store / Room / 通知 / Compose 屏
- RevenueCat 测试 key 换平台正式 key（上线前）
- 条款 / 隐私链接替换 `example.com` 占位（上线前）
- 桌面 Widget（原型用 `expo-widgets` 配过，未实现）
