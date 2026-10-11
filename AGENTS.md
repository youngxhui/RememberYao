# RememberYao — Agent 指南（原生版）

家庭用药提醒 App 的原生实现：iOS（Swift 6 / UIKit）与 Android（Kotlin / Jetpack Compose），
两端共用同一份领域层契约。旧 Expo 版在 `expo/` 目录，仅作行为参照，**不再是交付物**。

`CLAUDE.md` 仅引用本文件，所有约定以本文件为准。

## 文档地图

| 文件 | 内容 |
| --- | --- |
| [README.md](README.md) | 构建方法、目录结构、硬规则全文、两端故意差异、已修的坑、已知未验证项 |
| [docs/domain-spec.md](docs/domain-spec.md) | 领域层契约：实体、纯函数、状态机、通知、板装孪生不变式 |

本文件只放**硬规则**（必须 / 禁止），理由与示例见上面两份。

## 技术栈

| | |
| --- | --- |
| iOS | Swift 6 / UIKit（纯代码，无 Storyboard）/ SwiftData / UserNotifications，XcodeGen 生成工程 |
| Android | Kotlin / Jetpack Compose + Material 3 Expressive / Room / Hilt，Gradle KTS |
| 最低版本 | iOS 26 / Android 14（minSdk 34） |
| 测试 | Android JUnit（`app/src/test/`，覆盖领域层），iOS 无测试源集 |
| Maestro | 流在 Expo 版里（`expo/maestro/`），未移植 |

根目录**没有** package.json / node_modules —— 那是 Expo 版的残留（现存于 `expo/`），
不要在根目录跑 bun / npm / expo。

## 命令

```bash
# iOS（改了源码目录结构后先 xcodegen generate）
cd ios && xcodebuild -project RememberYao.xcodeproj -scheme RememberYao \
  -destination 'generic/platform=iOS Simulator' -configuration Debug build

# Android
cd android && ./gradlew assembleDebug
cd android && ./gradlew :app:testDebugUnitTest
```

## 硬规则

### 数据层

1. **屏幕永远不直接碰持久化**。所有状态集中在 `Store`（iOS）/ `Store.kt`（Android），屏幕只读快照并调它的方法。
2. 写操作一律走「套纯函数 → 更新内存态 → 落盘 → 重排通知」流水线，**不允许绕过通知重排**。
3. 领域层是**纯函数**：`AppData` 是不可变快照，新逻辑保持这个形态。
4. **日期 / 时间一律用字符串**：日期 `YYYY-MM-DD`，时间 `HH:MM`，时间戳 ISO8601。比较用字符串 `localeCompare` / `<`，**不引入任何日期库**。
5. `MedicationUsage` 的 `personName` / `medicationName` / `time` 是**快照**，删除药品或用药人不清除历史。
6. 提醒状态机 `pending → taken / skipped / missed`；超过 **1 小时宽限期**未处理才判 `missed`，漏服可补服（`late = true`）。
7. 板装药的不变式：`remainingQuantity === Σ full 槽位`。

### UI

8. **优先用平台原生组件**：iOS 用 UIKit 的 `UITableView` / `UITextField` / `UIDatePicker`，Android 用 Material 3 的 `Scaffold` / `Card` / `ListItem` / `OutlinedTextField` / `DatePicker` / `TimePicker`。不引第三方 UI 库，不自绘通用控件。
9. **不硬编码颜色、字号、间距**。iOS 走 `UI/Theme/Theme.swift`，Android 走 `ui/theme/Theme.kt`。语义色：`primary` / `success`（已服）/ `warning`（即将到期）/ `danger`（漏服）。
10. 图标不用 emoji：iOS 用 SF Symbol，Android 用 Material Icons。
11. 长列表 iOS 用 `UITableView`，Android 用 `LazyColumn`；都不自己写虚拟化。
12. iOS 根导航集中在 `AppCoordinator`；Android 路由集中在 `ui/RememberYaoApp.kt` 的 `Routes`，**屏幕里不拼路由字符串**。Android 是**单 Activity** 架构，页面切换全交 Navigation Compose。
13. 标题 iOS 走 `navigationItem.title` / `UISearchController`，Android 走 `TopAppBar` / `LargeTopAppBar` + `SearchBar`。

### 多语言

14. **禁止在屏幕 / 组件里写死 UI 文案**。iOS 用 `L10n.shared.t("分组.键")`（带参数时 `t("键", ["name": …])`），Android 用 `stringResource(R.string.xxx)`；通知层、BroadcastReceiver 等 React 之外的地方用 `L10n.get(context, key)`。
15. Android 词条由 `tools/gen_strings.py` 从 `expo/` 里的 Expo 词典生成，**不要手改 `res/values*/strings.xml`**；改 `tools/gen_strings.py` 里的 `EXTRA_ZH` / `EXTRA_EN` 后重跑：

    ```bash
    cd android && python3 -I tools/gen_strings.py
    ```

    zh / en 两侧键数必须始终相等。
16. **语言切换后必须重注册通知栏文案**，否则按钮标题停留在旧语言。iOS：`NotificationScheduler.registerLocalizedTexts()`；Android：`MainActivity.onCreate` 重建通知渠道。
17. 日期 / 星期走 `Intl` / `DateFormat`，不硬编码语序。

### 代码

18. 注释、UI 文案、提交信息用**中文**，标识符用英文。注释只解释「为什么」（业务规则、非显然约束），不复述代码。
19. 文件名 iOS 用 PascalCase，Android 类用 PascalCase / 路由文件用 kebab-case（各随平台惯例）；常量 UPPER_SNAKE_CASE。
20. **每个可交互控件都要有测试标识**：Android `Modifier.testId("<屏幕>-<角色>")` kebab-case（如 `medication-save-button`、`plan-dose-input-<药id>`）；iOS `accessibilityIdentifier`。文案会变的控件（二次确认删除、引导页下一步）尤其不能省。
21. 提交前必须构建通过：iOS `xcodebuild … build`，Android `./gradlew assembleDebug`。当前基线：两端 0 error；Android 另有 2 条 Kotlin 未来兼容提示（`@ApplicationContext private val context: Context` 的 use-site target，改成 `@field:` 会让 Hilt 找不到注入，所以保持原样）。
22. 改动任一端后同步 `docs/domain-spec.md`；改文案同步跑 `gen_strings.py`。
23. **不要主动进行 UI 自动化验证**：不启动模拟器 / 真机跑应用、不截图对比来验证自己的改动。改动的正确性以**构建通过** + 通读受影响代码为准，界面最终由开发者在真机 / 模拟器上亲自确认。模拟器相关操作只在用户明确要求时才执行。

## 目录结构

```
ios/RememberYao/
  App/        AppCoordinator（根导航 / tab）+ AppDelegate
  Core/       Domain（纯函数）+ Mutations（写操作）+ Data（Store/SwiftData/AppEnvironment）
              + Model（实体）+ Notification（调度）+ Localization（L10n）
  Features/   每屏一个 ViewController（Home / Medica / Profile / Onboarding）
  UI/         共享基元与 Theme；MiniArchiveView、ReminderCardStackView 两个动画展示组件
  Resources/   Localizable.xcstrings
android/app/src/main/java/top/youngxhui/rememberyao/
  core/       domain（纯函数 + Mutations + Store）+ model + notification + l10n
  data/       local（Room）+ di（Hilt）
  ui/         theme + components + home/medica/profile/records/onboarding 各屏
              + RememberYaoApp（NavHost）+ AppViewModel
docs/domain-spec.md   两端领域层契约
expo/                 旧 Expo 版（JS），行为参照，不要在此提交新功能
```

## 待办（改这些区域时留意）

- **Android 未在真机 / 模拟器上运行过**：只保证 `assembleDebug` / `assembleRelease` 编译通过 + 领域层单元测试绿。
- **iOS 只验证了引导页**（冷启动、两页、进主界面后的 tab 栏与首页大标题，无崩溃）；主界面各屏未做运行时验证。注意本环境 `simctl io tap` / `swipe` 不送达事件。
- `expo-widgets` 的桌面 Widget 尚未实现。
- Maestro 流未从 Expo 版（`expo/maestro/`）移植。
- 最该继续覆盖的测试层：`Mutations` / `Mutations.kt` 的提醒生成、库存扣减、`applyPlanChanges`、`openBlisterTwin`。
