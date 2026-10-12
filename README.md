# RememberYao（原生版）

家庭用药提醒：记录家里每个人的用药配置，到点本地通知提醒，服用后自动扣减库存。

本仓库是 RememberYao 的原生实现（iOS Swift / Android Kotlin），由 Expo 版
（`expo/`，JavaScript + React Native）重写而来；两端共用同一份领域层契约，见
[`docs/domain-spec.md`](docs/domain-spec.md)。Expo 版不再是交付物，仅作行为参照。

| | iOS | Android |
| --- | --- | --- |
| 目录 | [`ios/`](ios/) | [`android/`](android/) |
| 语言 | Swift 6 | Kotlin 2.3 |
| UI | UIKit（纯代码，无 Storyboard） | Jetpack Compose + Material 3 **Expressive** |
| 最低版本 | iOS 26 | Android 14（minSdk 34） |
| 持久化 | SwiftData | Room + SQLite |
| 响应式 | `@Observable` + Observation | `StateFlow` / `Flow` |
| 通知 | UserNotifications | NotificationManager + AlarmManager |
| 本地化 | String Catalog（`.xcstrings`，源语言 zh-Hans） | `res/values/strings.xml` + `values-en` |
| 依赖注入 | 手动构造 + `Environment` | Hilt |
| 项目生成 | Xcode 工程（`RememberYao.xcodeproj`，手工维护） | Gradle KTS |

Expo 版在 `expo/` 目录作为行为参照，**不再是交付物**。后续改动只应落在 `ios/` /
`android/` 两端之一，并同步 `docs/domain-spec.md`。

---

## 构建

### iOS

```bash
cd ios
xcodebuild -project RememberYao.xcodeproj -scheme RememberYao \
  -destination 'generic/platform=iOS Simulator' -configuration Debug build
```

`RememberYao.xcodeproj` 是**手工维护的 Xcode 工程**——早期由 XcodeGen 从
`project.yml` 生成，该中间层已移除（`project.yml` 删除，配置全量落在
`project.pbxproj`；共享 scheme 在 `xcshareddata/xcschemes/`）。需要 development
build：依赖 `UserNotifications` 与 SwiftData，Expo Go 概念在这里不存在。

> **新增 / 重命名 .swift 文件后，必须把它加进 `project.pbxproj` 的 Sources
> 构建阶段**，否则它不参与编译，调用处直接报 `Cannot find 'X' in scope`。
> 在 Xcode 里把文件拖进工程最稳（会自动改 pbxproj）；纯命令行场景需手工编辑
> `project.pbxproj`，`PBXBuildFile` / `PBXFileReference` / `PBXGroup` /
> `PBXSourcesBuildPhase` 四处都要补。
> 资源目录（`Assets.xcassets`）和 `Resources/` 是整目录引用，往里加文件不用改
> pbxproj。

### Android

```bash
cd android
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # 已签名的 app-release.apk（见下）
```

- 包管理器：Gradle（唯一 lockfile 概念是依赖版本目录 `gradle/libs.versions.toml`）。
- 仓库配置里带了 Aliyun 镜像兜底，国内网络下直接可用。
- **不要**再引入 `pnpm-lock.yaml` / `package-lock.json` —— 那是 Expo 版的残留（现存于 `expo/`）。
- material3 显式锁 **1.5.0-alpha24**（`libs.versions.toml` 的 `composeMaterial3`）：
  M3 Expressive 的公开 API（`MaterialExpressiveTheme` / `MotionScheme.expressive()` /
  emphasized 字体 / 八档 `Shapes`）要到 1.5 才开放，BOM 仍钉 1.4.0；该版本要求
  compileSdk 37（本地已装 `android-37.0`）。
- **release 签名**：`assembleRelease` 读项目根的 `keystore.properties`（与
  `app/release.keystore` 一并被 `.gitignore` 排除，不随版本库分发）。文件缺失时
  release 退化为未签名，构建不失败。换环境分发时把这两个文件带给构建方即可。

---

## 目录结构

### iOS（`ios/RememberYao/`）

```
App/        AppCoordinator（根导航 / tab）+ AppDelegate
Core/
  Domain/   Domain.swift（常量 + 纯派生函数）+ Decisions.swift（写操作：
              实体级纯函数，返回 decision）
  Data/     Store（唯一数据出入口，增量落库）+ SwiftData 模型 + AppEnvironment
              + AppViewModel（按集合的 @Observable 状态）+ Repository 协议
  Model/    实体值类型 + Utilities（ISO8601 / id / 列表编解码）
  Notification/  UNUserNotificationCenter 调度
  Localization/  L10n（词条查询、语言偏好）
Features/   每屏一个 ViewController（Home / Medica / Profile / Onboarding）
UI/         共享基元：ListScreenViewController、FormScreenViewController、
            FieldCell、原生控件封装、Theme；两个带动画的展示组件
            （MiniArchiveView 收藏夹、ReminderCardStackView 提醒卡堆叠）
            + Motion（cubic-bezier）/ GradientView / PressScaleButton
Resources/   Localizable.xcstrings
```

### Android（`android/app/src/main/java/top/youngxhui/rememberyao/`）

```
core/
  domain/    Domain.kt（常量 + 纯派生函数）+ Decisions.kt（写操作：实体级纯函数，
             返回 decision）+ Repository.kt（接口 + ScheduleInput 只读投影）
  model/     实体值类型（snake_case 列名在 data/local/Entities.kt 映射）
  notification/  NotificationScheduler + 三个 BroadcastReceiver
  l10n/       L10n（词条查询）、LanguageStore、LocaleManager、Prefs
data/
  local/     Room：Entities / Daos（读走 Flow，写走增量 upsert）/ toDomain /
             toEntity
  repository/ Store.kt（唯一数据出入口：增量落库 + 事务 + 重排通知）
  di/        AppModule（Hilt）
ui/
  theme/      M3 Expressive 主题：动态取色（Android 12+ 壁纸配色，不支持时退回
              设计稿 Custom 系绿）+ MotionScheme.expressive() + 缩小的形状比例 +
              emphasized 字体；StatusTint（已服/偏低/告急）、Foil（泡罩铝箔实物色）、
              Promo（提醒卡展示 token）三组语义 / 实物色
  components/ 共享基元：SectionCard / InfoRow / LabeledField / DateField /
             ConnectedListItem（相连列表）+ SearchField（搜索栏）+ SplitButton
             （拆分按钮）+ Feedback（触感 / 减弱动效 / 分数渐变）；
             ReminderCardStack（提醒卡堆叠）带动画展示组件，
             含 takeEarliest / parseHexColor 等共用纯函数
  home/ medica/ profile/ records/ onboarding/   每屏一个 @Composable
  RememberYaoApp.kt   NavHost + 底部 NavigationBar + Routes + 屏幕过渡
  AppViewModel.kt     Activity 作用域，按集合的 StateFlow，三个 tab 与推入的
                      详情页共享同一份数据
tools/gen_strings.py  由 expo/ 里的 Expo 词典生成 res/values/strings.xml
```

---

## 硬规则

这些规则在两端都成立，改代码前先看一遍。

### 数据层

1. **屏幕永远不直接碰持久化**。所有状态集中在 `Store`（iOS）/ `Store.kt`（Android），
   屏幕只读快照并调它的方法。
2. 写操作一律走「套纯函数 → 更新内存态 → 落盘 → 重排通知」流水线，
   **不允许绕过通知重排**。
3. 领域层是**纯函数**：`Decisions` 里的 `decideXxx` 只接收涉及的实体、返回实体新状态（decision），不碰 IO；`Store` 只负责执行 decision，新逻辑保持这个形态。
4. **日期 / 时间一律用字符串**：日期 `YYYY-MM-DD`，时间 `HH:MM`，时间戳 ISO8601。
   比较时间用字符串 `localeCompare` / `<`，**不引入任何日期库**。
5. `MedicationUsage` 的 `personName` / `medicationName` / `time` 是**快照**，
   删除药品或用药人不清除历史。
6. 提醒状态机 `pending → taken / skipped / missed`；超过 **1 小时宽限期**未处理才判
   `missed`，漏服可补服（`late = true`）。
7. 板装药的不变式：`remainingQuantity === Σ full 槽位`。

### UI

8. **优先用平台原生组件**：iOS 用 UIKit 的 `UITableView` / `UITextField` /
   `UIDatePicker`，Android 用 Material 3 的 `Scaffold` / `Card` / `ListItem` /
   `OutlinedTextField` / `DatePicker` / `TimePicker`。不引第三方 UI 库，不自绘通用控件。
9. **不硬编码颜色、字号、间距**。iOS 走 `UI/Theme/Theme.swift`，Android 走
   `ui/theme/Theme.kt`。语义色：`primary` / `success`（已服）/ `warning`（即将到期）/
   `danger`（漏服）。
10. 图标不用 emoji：iOS 用 SF Symbol，Android 用 Material Icons。
11. 长列表 iOS 用 `UITableView`，Android 用 `LazyColumn`；都不自己写虚拟化。

### 路由与结构

12. iOS：根导航集中在 `AppCoordinator`；Android：路由集中在 `ui/RememberYaoApp.kt`
    的 `Routes`，**屏幕里不拼路由字符串**。
13. Android 是**单 Activity** 架构，页面切换全交 Navigation Compose。
14. 标题 iOS 走 `navigationItem.title` / `UISearchController`，Android 走
    `TopAppBar` / `LargeTopAppBar` + `SearchBar`。

### 多语言

15. **禁止在屏幕 / 组件里写死 UI 文案**。iOS 用 `L10n.shared.t("分组.键")`
    （带参数时 `t("键", ["name": …])`），Android 用 `stringResource(R.string.xxx)`；
    React 之外的地方（通知层、BroadcastReceiver）用 `L10n.get(context, key)`。
16. Android 词条由 `tools/gen_strings.py` 从 Expo 词典生成，**不要手改
    `res/values*/strings.xml`**；改 `tools/gen_strings.py` 里的 `EXTRA_ZH` / `EXTRA_EN`
    （或上游词典）后重跑：

    ```bash
    cd android && python3 -I tools/gen_strings.py
    ```

    zh / en 两侧键数必须始终相等。
17. **语言切换后必须重注册通知栏文案**，否则按钮标题停留在旧语言。
    iOS：`NotificationScheduler.registerLocalizedTexts()`（`AppEnvironment` 启动时 +
    设置页切语言时各调一次）；Android：`MainActivity.onCreate` 重建通知渠道。
18. 日期 / 星期走 `Intl` / `DateFormat`，不硬编码语序。

### 代码

19. 注释、UI 文案、提交信息用**中文**，标识符用英文。注释只解释「为什么」
    （业务规则、非显然约束），不复述代码。
20. 文件名 iOS 用 PascalCase，Android 类用 PascalCase / 路由文件用 kebab-case
    （各随平台惯例）；常量 UPPER_SNAKE_CASE。
21. **每个可交互控件都要有测试标识**：Android `Modifier.testId("<屏幕>-<角色>")`
    kebab-case（如 `medication-save-button`、 `plan-dose-input-<药id>`）；
    iOS `accessibilityIdentifier`。文案会变的控件（二次确认删除、引导页下一步）
    尤其不能省。
22. 提交前必须构建通过：iOS `xcodebuild … build`，Android `./gradlew assembleDebug`。
    当前基线：两端 0 error；Android 另有 2 条 Kotlin 未来兼容提示
    （`@ApplicationContext private val context: Context` 的 use-site target，
    改成 `@field:` 会让 Hilt 找不到注入，所以保持原样）。

---

## Android：M3 Expressive 改版（2026-10）

按设计稿把 Android 端整体重做为 Material 3 Expressive，行为与视觉基准：

- **配色两层**：Android 12+ 走壁纸动态取色（`dynamicLightColorScheme` /
  `dynamicDarkColorScheme`），其余设备退回设计稿的 Custom 系绿（`Theme.kt` 的
  `LightScheme` / `DarkScheme`，含全部 surface 分层与 inverse 角色）。界面只引用
  角色名；`StatusTint`（已服 / 偏低 / 告急）与 `Foil`（铝箔实物色）是两组例外，
  理由见文件内注释。
- **动效**：`MaterialExpressiveTheme` + `MotionScheme.expressive()`；屏幕过渡用
  主题的空间弹簧 —— tab 之间按排列方向左右滑入（右边的 tab 从右进），推入屏从右
  进、返回反向，药品表单从底部进。
- **字体**：Roboto + emphasized 变体（标题 / 按钮 / 标签页加粗，正文保持常规）。
- **形状**：整体缩小比例（卡片 8dp、对话框 12dp、大容器 28dp；按钮与导航指示器
  交给标准组件的胶囊形）。
- **五屏结构**：首页（日期应用栏 + 今日待处理牌堆容器 + 今日安排 + 药品库存进度
  行）、药品（搜索栏 + 慢性病 / 保健品 / 库存不足标签片组 + 相连列表 + 扩展
  FAB）、我的（本周概览大卡 + 家庭成员 + 相连列表）、添加药品（拆分按钮保存 +
  可撤销消息条）、设置（相连列表 + 语言暴露式下拉菜单）。
- **组件**：相连列表（3dp 间距、外侧 28dp / 内侧 8dp）、56dp 全圆角搜索栏
  （右端麦克风走系统语音识别）、SplitButton、Snackbar + 撤销。
- 导航栏在「设置」「药品添加」两屏也显示（设计稿如此），选中态随归属 tab。
- iOS 端未随本次改版（仍 UIKit 青绿）；两端领域层契约不变。

---

领域层逐条对齐，但 UI 层有几处**故意**不一样 —— 硬拉平反而会更不像原生：

| | iOS | Android | 理由 |
| --- | --- | --- | --- |
| 服药记录翻日期 | 导航栏 ‹ › + 日期选择器（action sheet 内嵌 inline `UIDatePicker`） | `LargeTopAppBar` 标题位放日期，‹ › 是右上角 `IconButton`（左侧 navigationIcon 留返回） | Android 没有等价的内联日历弹层，箭头翻页是日历 / 相册的原生交互 |
| 孪生页标题 | 「数字孪生」 | 药品名 | Android 推入屏的标题就是条目名，更符合 `TopAppBar` 惯例 |
| 成员筛选 | `UIMenu` | `FilterChip` 横排 | 两端各自的原生多选筛选形态 |
| 语言切换 | 单选列表（`UIAlertController`）；选项只有 中文 / English | `RadioButton` 列表对话框；选项多一项「跟随系统」 | iOS 上「跟随系统」已由 `L10n.resolve(preferred:system:)` 归一，再列一项是冗余；Android 需要在 `attachBaseContext` 里显式决定，所以保留 |
| 语言切换的生效方式 | 手动刷新本屏 + 逐个改 tab 标题 + 重注册通知文案 | 写偏好后 `Activity.recreate()` | iOS 没有等价的「重走入口」；Android 的 locale 只能在 `attachBaseContext` 里换 |
| 用药时间选择 | `UIDatePicker`（`.inline` / `.compact`） | `TimePicker` 对话框 | 各自平台的时间选择器 |
| 提醒调度量 | 只排最近的 60 条 pending 通知 | 每条提醒一个 `AlarmManager` exact alarm，不限量 | iOS 有 64 条 pending notification 硬上限（超出静默丢弃），Android 的 `AlarmManager` 没有对应上限 |

---

## 测试

- **Android 有单元测试**：`app/src/test/java/.../core/domain/DomainTest.kt`（JUnit 4），
  覆盖 `stableHash` 跨端一致、`DateKey` 运算、库存分级、`weekStats`、`inQuietHours`
  跨零点区间。跑：`./gradlew :app:testDebugUnitTest`。iOS 端没有测试源集，
  `stableHash` 的对齐由 Android 这组固定向量反向锁死。
- Maestro 流仍在 Expo 版里（`expo/maestro/*.yaml`），尚未移植。
- 最该继续覆盖的一层：`Decisions` / `Decisions.kt` 的提醒生成、库存扣减、
  `decideApplyPlanChanges`、`decideOpenTwin`。

## 已知未验证项

- **iOS 已能在模拟器上跑**（本机 Xcode 没有 `Simulator.app`，但 `simctl` 可用）：
  冷启动、引导页两页、进主界面后的 tab 栏与首页大标题都已截图验证，无崩溃。
  ⚠️ **`simctl io tap` / `swipe` 在这个环境里不送达事件**（点系统权限弹窗、
  点引导页按钮、滑屏全部无效），所以「点按钮翻页 / 进主界面」这条交互路径
  是**靠把起始页临时改成第 2 页**验证的，没有真正走完一次点击。
- **Android 未在真机 / 模拟器上运行过**：只保证 `assembleDebug` / `assembleRelease`
  编译通过 + 领域层单元测试绿。
- `expo-widgets` 的桌面 Widget 尚未实现。

## ⚠️ 两个 App 的 bundle id 不一样，别装错

| | bundle id |
| --- | --- |
| 原生版（本仓库根目录，**交付物**） | `top.youngxhui.rememberyao` |
| Expo 版（`expo/` 目录，不再是交付物） | `top.youngxhui.rememberyao.k3f9` |

两者的产物都叫 `RememberYao.app`，`DerivedData` 目录也同名（`RememberYao-<hash>`），
`ls | head -1` 极易抓到 Expo 那份。区分办法：原生版没有
`NSUserActivityTypes: …expo.index_route` 这个 Expo 残留键。验证时务必先确认装对，
否则测的是旧 App。

## 已修的坑（改动这些区域前先看）

- **`INFOPLIST_KEY_UIApplicationSceneManifest_Generation` 必须保持开启**。
  漏了它，UIKit 不建 scene session，`SceneDelegate.scene(_:willConnectTo:)`
  （**唯一**创建 `UIWindow` 的地方）永不触发 → App 能装能"启动"但一整片空白。
  该键在 `project.pbxproj` 的工程级 Debug / Release 两个配置里（target 级靠
  继承），动构建配置时别丢。同类的还有
  `INFOPLIST_KEY_UILaunchScreen_Generation`（启动图）、
  `ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME`（全局强调色）。
- **新增 .swift 文件必须手动加进 pbxproj 的 Sources 阶段**。工程已不用
  XcodeGen，不会再自动扫目录；漏加的 file 不编译，报
  `Cannot find 'X' in scope`。拖进 Xcode 最稳。
- **iOS 引导页的按钮 / 页码点必须 `bringSubviewToFront()`**。
  `UIPageViewController.view` 是后加的、铺满全屏且不透明，z 序压在它们上面；
  且每次 `setViewControllers` 翻页都会重建内部视图层级，得重复置顶。
  症状就是「最后一屏滑不动也点不到开始使用，卡死在引导页」。
- **通知权限不要在冷启动请求**。系统 alert 会盖在引导页上。改成
  `AppCoordinator.showMain()` 里调 `requestNotificationPermissionIfNeeded()`
  —— 引导页走完才要，且 iOS 对同一 App 只弹一次，不会重复。
- **iOS 待触发通知只排最近的 60 条**。iOS 对 pending notification 有 64 条硬上限，
  超出的 `add()` 静默丢弃 —— 一个家庭 7 天的待服提醒轻松 200+ 条，第 65 条之后
  会无声无息地不响。窗口靠 `sceneDidBecomeActive` 和每次写操作后的 resync 往前滚。
- **`stableHash` 必须掩符号位**（`& 0x7FFFFFFF`），不能 `abs()`。见
  `docs/domain-spec.md` §3.3。
- **`ID.generate()` 带进程内自增序号**。早先只有「毫秒 + 5 位随机」，
  `openBlisterTwin` 一次生成 20×144 = 2880 个 id，期望碰撞约 41 次；
  `BlisterSlotEntity.id` 是 `@Attribute(.unique)`，撞了 `context.save()` 抛错，
  而 `Store.persist` 用 `try?` 吞掉 —— 整批孪生数据静默丢失。
- **`UIContextualAction` 的 `done` 两条路都要调**。只在确认分支调的话，
  用户在二次确认弹窗上点取消，那一行会一直卡在侧滑展开态。
- `UIAlertController` 的 `setValue(_:forKey: "contentViewController")` 是私有 KVC
  （三处日期选择器在用）。这是 iOS 8 以来稳定的通行做法，替换它要么引入第三方库、
  要么自己写弹层 —— 与「优先原生组件、少造自定义组件」冲突，因此**有意保留**。
