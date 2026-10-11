# 数据层与状态管理

## 单点原则

所有状态与持久化集中在 `src/lib/store.ts`，通知集中在 `src/lib/notifications.ts`。**屏幕永远不直接碰 AsyncStorage。**

数据流：

```
屏幕  →  useAppData()         读
屏幕  →  store 的写操作        写
写操作完成  →  setPostMutationHook  →  syncNotificationsWithStore()
```

## 实体

| 实体 | 说明 |
| --- | --- |
| `Medication` | 药品 + 库存：`type`（blister/bottle/loose）、`unit`（tablet/pill）、`totalQuantity`、`remainingQuantity` |
| `Person` | 用药人：`name`、`avatarColor` |
| `MedicationPlan` | 用药配置：药品 × 用药人 × `doseAmount` × `times[]` × `startDate`/`endDate` × `enabled` |
| `Reminder` | 按天生成的单次提醒：`date`、`time`、`doseAmount`、`status`、`snoozedUntil`（稍后提醒的推迟时刻） |
| `MedicationUsage` | 服用记录：含 `personName`/`medicationName`/`time` **快照**、`amount`、`late` |

关系：`MedicationPlan` 用 `medicationId` / `personId` 关联；`Reminder` 用 `planId` 关联；`MedicationUsage` 同时存 `reminderId` / `planId` / `medicationId` / `personId`。

### 快照不可变

`MedicationUsage` 里的 `personName` / `medicationName` / `time` 是**创建时的快照**。删除药品或用药人不清除历史记录，历史仍可读。新增字段时保持这个不可变性 —— 这是产品需求（"去年给谁吃过什么药"必须还能查），不是技术偏好。

## 读取

```tsx
const { medications, persons, plans, reminders, usages, loading, reload } = useAppData();

useFocusEffect(useCallback(() => { reload(); }, [reload]));
```

屏幕在 `useFocusEffect` 里调 `reload()` 刷新，不要自己起 `useEffect` 拉数据。

`loading` 是**首屏**加载标志。首屏加载没结束时不显示 empty 态（见 [ui-design.md](./ui-design.md#界面四态)）。

## 写入

写操作统一走 `updateData(mutator)` 这类入口，落盘通过 `writeQueue` 串行化，避免并发写覆盖。磁盘写入失败时保留内存态并在下次变更时重试，不丢用户操作。

**任何写操作后必须通过 `setPostMutationHook` 触发 `syncNotificationsWithStore()` 重排通知**。改 store 时不要绕过这个钩子 —— 绕过它会出现"改了吃药时间但通知还是老时间"的静默 bug。

## 纯函数

`store.ts` 里的提醒生成、库存扣减、状态迁移是**纯函数**。新增逻辑尽量保持纯函数形态：

- 输入输出明确，不碰 `AsyncStorage`、不发通知、不调 `setState`。
- 便于后续补单元测试（这是当前待办里优先级最高的一项）。
- 反例：`migrateLegacy()` 直接读 AsyncStorage，是迁移用的，不属于业务纯函数。

## 日期与时间

**一律用字符串，不引入日期库：**

| 类型 | 格式 | 例 |
| --- | --- | --- |
| 日期 | `YYYY-MM-DD` | `"2026-09-22"` |
| 时间 | `HH:MM` | `"08:00"` |
| 时间戳 | ISO 字符串 | `"2026-09-22T08:00:00.000Z"` |

- 比较时间用 `localeCompare`，不要 `new Date(...).getTime()`。
- 取"今天"用 `todayKey()`。
- 排序**不要用 `toSorted()`** —— Hermes 没有 ES2023 的 `toSorted()`，运行时是 `undefined`，一调就 `TypeError` 红屏（`tsc` 不报错，因为 `lib` 是 esnext）。正确写法：先 `filter()` / `map()` 拿到新数组，再原地 `sort()`（不碰 store 数据），并加行内禁用 + 注释：
  ```ts
  const day = reminders.filter((r) => r.date === date);
  // Hermes 没有 ES2023 的 toSorted()；上游是 filter 产物，原地排序不改 store
  // oxlint-disable-next-line unicorn/no-array-sort
  day.sort((a, b) => a.time.localeCompare(b.time));
  ```

## 提醒状态机

```
pending ──→ taken    已服用
         ├─→ skipped 跳过
         └─→ missed  漏服（超过宽限期未处理）
```

- **超过 1 小时宽限期**未处理才判 `missed`（`GRACE_MINUTES = 60`）。提前判漏服会在用户只是晚点时误报。
- 漏服可补服，记录标 `late: true`。
- 已服用/跳过/漏服都可以再次操作。
- **「稍后提醒」不是新状态**：`snoozeReminder(id, minutes)` 只写 `snoozedUntil`，状态仍是 `pending`。`rescheduleReminders` 取「原定时间」与「推迟时刻」的较晚者作为触发时间，所以推迟必须落在 store 里 —— 只在通知层临时排一条会被下一次 `cancelAllScheduledNotificationsAsync()` 冲掉。`snoozedReminder(reminder, now)` 判断推迟是否仍然生效，界面据此显示「稍后提醒」。

### 提醒生命周期

1. 配置保存后生成「今天起 7 天」的提醒，并调度本地通知。
2. 到点推送；通知栏可直接「已服用 / 跳过」。
3. 修改配置的时间/剂量或停用：废弃该配置**未处理**的提醒并按新配置重新生成，已处理的记录保留。
4. App 回前台（`AppState === "active"`）兜底同步一次 —— 见 `src/app/_layout.tsx`。

改提醒/库存逻辑时，**同步检查 `notifications.ts` 的调度是否仍然一致**。两边不同步是这类代码最容易出的 bug。

## 通知层

`src/lib/notifications.ts` 负责：权限申请、本地调度、通知栏操作按钮（已服用/跳过）、响应处理、与 store 同步。

- `initNotifications()` 在根布局启动时调用一次。
- `addNotificationResponseListener()` 返回的订阅必须 remove，见 `_layout.tsx` 的 cleanup。
- 用户在通知栏点了「已服用」时，走的是和界面点击同一套写操作，保证库存扣减与记录一致。

## 库存

- `stockSummary(medication, plans)` 计算剩余可服用天数与是否低库存。
- 补货会更新 `remainingQuantity`，同步更新 `updatedAt`。
- 低库存判定依赖该药品参与的所有**启用中**的配置，停用配置不参与估算。

## Maestro 测试

```bash
maestro test maestro/dashboard.yaml   # 首页（今日）冒烟：引导页 → 空态 → tab 往返
```

约定：

- Tab trigger 的 `testID` 命名 `<tab名>-tab`（`home-tab` / `medica-tab` / `profile-tab` / `playground-tab`），配置在 `src/components/app-tabs.tsx`。`playground-tab` 只在 debug 构建存在。
- 新增可交互的关键控件（按钮、列表项）按需加 `testID`，否则 Maestro 只能靠文案定位，文案一改测试就断。
- **断言优先用 testID**，只有真正渲染出来的业务文案才用文本匹配。
- **`@expo/ui` 的 `Text` 是例外：`testID` 在 iOS 上静默失效**。`TextView.body` 只调了 `applyModifiers`，漏掉 `applyAccessibilityIdentifier`（见 `node_modules/@expo/ui/ios/TextView.swift`），而 `UIBaseView.body` 是调了的。实测：`Column`/`Row`/`Button`/`ListItem`/`TextInput`/`Picker`/`Switch`/`ScrollView` 都正常，只有 `Text` 不行。给 `Text` 加 testID 不报错也不生效，只能按文案断言。其余组件均已实机验证可用。
- **切 tab 用 `repeat` 兜一下**：过引导页后第一次点底部 tab 会被吞（`router.replace` 之后首次触摸不生效），第二次就正常，`waitForAnimationToEnd` 救不了。写法见 `dashboard.yaml`。
- **表单里 `inputText` 之后不能直接点主操作按钮**：数字键盘会盖住「保存」。`hideKeyboard` 对 `@expo/ui` 原生 `TextInput` 无效（不暴露标准 dismiss action），点静态文案也不收键盘，上滑会被当成返回手势 —— 需要 app 侧给表单加 `scrollDismissesKeyboard`（见下方待办）。
- **动态 id 在 flow 里写成正则**：列表行 id 拼了实体 id（如 `dose-take-<reminderId>`），flow 里写 `id: "dose-take-.*"`。`id` 字段本身按正则编译，所以 `mini-archive-entry-.*` 这种后缀通配是合法的。
- **别用只在上一步页面出现的文案做等待**：`assertVisible: "维生素C"` 在药品表单页也能匹配到（它就在「药品名称」输入框里），会假通过。要用列表页独有的文案（如 `全部 1`、空态提示）确认真的回到了列表。
- **动态 id 在 flow 里写成正则**：列表行 id 拼了实体 id（如 `dose-take-<reminderId>`），flow 里写 `id: "dose-take-.*"`。`id` 字段本身按正则编译，所以 `mini-archive-entry-.*` 这种后缀通配是合法的。
- **系统弹窗用 `label` 匹配并标 `optional: true`**：权限弹窗文案随系统语言变（「允许」/「Allow」）。
- 首页（今日）现在是**纯 RN 树**（`src/screens/home`），`Pressable` / `RNView` 的 `testID` 正常落到 `accessibilityIdentifier`，不受上面「@expo/ui 的 Text 不行」的限制。首页关键 id：`home-add-button`、`home-member-all`、`home-member-<personId>`、`home-gap-row-<from>-<to>`、`home-refill-button`、`dose-take-<reminderId>`、`dose-skip-<reminderId>`、`dose-snooze-<reminderId>`、`stack-card-take-<reminderId>`。
- 首页进度文本是 `已完成 N/M`，`M === 0` 时照常渲染 `已完成 0/0`；数字随当日配置变化，只断言 `N/M` 这个结构。空态文案是「今天没有用药安排」。
- flow 文件名用连字符（kebab-case），与路由和组件保持一致。

### testID 命名规范

`@expo/ui` 的 universal 组件（`Column` / `Row` / `Button` / `ListItem` / `TextInput` / `Picker` / `Switch` / `ScrollView`）接受 `testID`，iOS 落到 `accessibilityIdentifier`、Android 落到 Compose `testTag`，Maestro 可直接用 `tapOn: { id: ... }`。

**`Text` 不行** —— 它的 `testID` 在 iOS 上不落 `accessibilityIdentifier`（`TextView.swift` 漏调），实测无效。给 `Text` 加 testID 既不报错也不生效，只能按文案断言。

格式：`<屏幕或组件>-<角色后缀>`，kebab-case，**不跟可见文案走**。

| 后缀 | 用途 | 例 |
| --- | --- | --- |
| `-button` | 按钮 | `medication-save-button` |
| `-input` | 文本 / 数字输入 | `plan-dose-input` |
| `-picker` | 下拉选择 | `plan-medication-picker` |
| `-switch` | 开关 | `plan-enabled-switch` |
| `-filter-*` | 筛选 chip | `medica-filter-low` |
| `-item-<id>` / `-<id>` | 列表行、行内按钮 | `person-item-<id>`、`dose-take-<reminderId>` |

规则：

- **文案会变的控件必须靠 testID 定位**。二次确认删除（`medication-delete-button` 文案在「删除药品 / 再次点击确认删除」间切换）、分步引导（`onboarding-next-button` 在「下一步 / 开始使用」间切换）都是典型场景。
- **列表行 id 用数据 id 拼接**（`<前缀>-<实体id>`），不要用数组下标 —— 排序/过滤后下标会漂。
- **只给可交互控件和列表行加**，纯展示文本不加，避免噪音。
- `Stack.Toolbar.Button` **没有** `testID`（iOS 侧 identifier 是内部 `useId()`，不可控）。工具栏按钮只能用 `accessibilityLabel` 或可见文案定位，例如右上角「添加」目前靠 `tapOn: "添加"`。

## 当前 lint 状态

`bun run lint` 当前为 **0 errors / 0 warnings**。日期选择直接使用通用 `DateTimePicker`；其余平台 UI 能力由 `src/components/native-layout.{ios,android}.tsx` 隔离，通用路由不再直接导入 SwiftUI / Compose 子包。

已修完的问题（2026-09-22）：

| 规则 | 原位置 | 处理 |
| --- | --- | --- |
| `no-unused-vars` | `store.ts` `migrateLegacy` | 删除确认无用的迁移死代码 |
| `no-unused-vars` | `persons.tsx` `Avatar` 导入 | 删除无用导入 |
| `no-unused-vars` | `home/index.tsx` | 将已有进度、通知与库存组件接回页面，而不是删除实现 |
| `react(set-state-in-effect)` | `store.ts` `useAppData` | 误报，按文件关闭并注明原因 |
| `react(immutability)` | 使用 universal `useNativeState` 的文件 | 误报，按文件关闭并注明原因 |
| `promise(always-return)` | `notifications.ts`、`use-onboarding-gate.ts` | 补全回调返回值 |
| `unicorn(no-array-sort)` | `home` / `records` | 保持原地 `.sort()` + 行内禁用：**Hermes 没有 `toSorted()`**，按规则改过去会 `TypeError` 红屏（用 app 实际链接的 hermes 二进制实测 `typeof Array.prototype.toSorted === "undefined"`），上游是 `filter()` 产物，原地排序不改 store |
| `no-restricted-imports` | 通用路由 | 日期选择改用通用 `DateTimePicker`；其余平台能力集中到 `src/components/native-layout.{ios,android}.tsx` |

## flow 当前状态（2026-09-26 实机验证）

`maestro/dashboard.yaml` —— 通过，连跑 4 次稳定。其余 flow 已删除。

待办（app 侧，非测试问题）：给药品表单（`medica/form.tsx`）与用药配置表单（`profile/plan-form.tsx`）
加上 `scrollDismissesKeyboard`，修掉「键盘盖住保存按钮」。这是规则 36
「表单主操作不能被键盘挡住」目前唯一的违反点 —— 实测 `hideKeyboard` 对 `@expo/ui`
原生 `TextInput` 无效，点静态文案不收键盘，上滑会被当成返回手势，所以补药品/主流程
这类带表单的 flow 在修好之前写不出来。
