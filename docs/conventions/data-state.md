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
| `Reminder` | 按天生成的单次提醒：`date`、`time`、`doseAmount`、`status` |
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
- 排序用 `toSorted()` 而不是 `sort()` —— `sort()` 会原地修改数组，`toSorted()` 返回新数组。oxlint 的 `unicorn/no-array-sort` 规则会提醒（当前 3 处待改）。

## 提醒状态机

```
pending ──→ taken    已服用
         ├─→ skipped 跳过
         └─→ missed  漏服（超过宽限期未处理）
```

- **超过 1 小时宽限期**未处理才判 `missed`（`GRACE_MINUTES = 60`）。提前判漏服会在用户只是晚点时误报。
- 漏服可补服，记录标 `late: true`。
- 已服用/跳过/漏服都可以再次操作。

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
maestro test maestro/mvp_flow.yaml     # 完整主流程
maestro test maestro/main_layout.yaml  # Tab 布局
maestro test maestro/add_medica.yaml   # 添加药品
```

约定：

- Tab trigger 的 `testID` 命名 `<tab名>-tab`（`home-tab` / `medica-tab` / `records-tab` / `profile-tab`），配置在 `src/components/app-tabs.tsx`。
- 新增可交互的关键控件（按钮、列表项）按需加 `testID`，否则 Maestro 只能靠文案定位，文案一改测试就断。
- 文件名用下划线分隔（`add_medica.yaml` 是历史遗留，新文件建议改用连字符以保持和 kebab-case 一致 —— 但改名要同步 CI，先问过再动）。

## 当前待修的 lint 问题

`bun run lint` 目前 **0 errors / 12 warnings**，全部是 `no-restricted-imports`（`@expo/ui/swift-ui` 平台导入）。

已修完的问题（2026-09-22）：

| 规则 | 原位置 | 处理 |
| --- | --- | --- |
| `no-unused-vars` | `store.ts` `migrateLegacy` | 死代码，连同 `LegacyMedicine` 类型和 `LEGACY_MEDICINES_KEY` 一起删除 |
| `no-unused-vars` | `persons.tsx` `Avatar` 导入 | 删导入 |
| `no-unused-vars` | `home/index.tsx` `StockBrief.onPress` | 真 bug：调用方传了 `router.push` 但组件从未使用。已接到 `Column` 的 `onPress`（universal 组件支持） |
| `react(set-state-in-effect)` | `store.ts` `useAppData` | 误报：`reload()` 是 async，setState 在 await 之后的微任务里执行，非同步。已在 `.oxlintrc.json` 按文件关闭并注明原因（oxlint 行内禁用对该规则无效） |
| `react(immutability)` × 3 | `persons.tsx`、`medica/detail.tsx` | 误报：`useNativeState` 写 `.value` 是既定用法，universal 导入下没有 `.get()`/`.set()`。已在 `.oxlintrc.json` 按文件关闭 |
| `promise(always-return)` × 2 | `notifications.ts`、`use-onboarding-gate.ts` | `.then()` 回调补 `return undefined` |
| `unicorn(no-array-sort)` × 3 | `home`/`records` | 改 `toSorted()` |

剩余 12 处平台导入警告的处置见 [ui-design.md](./ui-design.md#平台专属组件隔离最重要) —— 涉及架构决策（modifier 两端命名完全不同、`DatePicker`/`TabView` 无 universal 等价物），需先定方案再动。
