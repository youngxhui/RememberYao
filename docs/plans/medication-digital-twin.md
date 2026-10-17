# 药品数字孪生（泡罩药板）— 方案

> 状态：已实施（typecheck / lint / format / i18n / Metro 打包均通过；真机未验证）
> 关联：`AGENTS.md` 硬规则 22（快照不可变）、26（迁移）；视觉基准暂无设计稿，按 `design/medications.html` 的既有语言延展。

## 1. 定位

**每一板泡罩药在 App 里有一块一一对应的数字孪生：逐格镜像物理药板，吃了哪一泡、谁吃的、什么时候吃的，都在格子上。**

一句话：*库存从「还剩 23 片」精确到「还剩哪 23 泡」。*

本期范围（已与需求方确认）：

- **只做板装**（`type === "blister"`）。瓶装 / 散装维持现有计数库存，不做液位可视化。
- **双向联动**：提醒闭环「已服」按序消耗槽位；孪生页点格子可手动记一次服用、可撤销。
- **一盒多板**：板带序号，一板吃完自动落到下一板，孪生页可逐板查看。

明确不做：拍照数格子（OCR）、智能药盒硬件、瓶装孪生、药品批号追溯。

## 2. 核心概念

| 概念 | 实体 | 说明 |
| --- | --- | --- |
| 药板 `pack` | `BlisterPack` | 一块实体泡罩：`rows × cols` 格，`seq` 是盒内第几板 |
| 槽位 `slot` | `BlisterSlot` | 泡罩里的一格，`index` 从 0 开始，从左到右、从上到下 |
| 消耗 | 槽位 `empty` + 一条 `MedicationUsage` | 槽位通过 `usageId` 指向服用记录 |

**槽位状态**：`full`（有药）/ `empty`（已服，或迁移进来的历史消耗）/ `void`（损坏、遗失——物理上没吃但格子里没药了）。

**服用顺序即泡罩顺序**：`nextFullSlots` 按「板序 → 格序」取前 N 个 `full` 格，与真人从左上角开始嗑药片一致。

## 3. 数据模型

### 3.1 新表

```ts
packs        // id, medication_id, seq, rows, cols, created_at；UNIQUE (medication_id, seq)
blisterSlots // id, pack_id, slot_index（列名避让 SQLite 的 INDEX 关键字）, status, usage_id, consumed_at, consumed_by；UNIQUE (pack_id, slot_index)
```

- `packs` **不存 status**：sealed / open / consumed 全部由槽位推导（`packStatus(slots)`），避免两处事实漂移。
- `blisterSlots.consumed_by` 是**快照姓名**（与 `usages.person_name` 同策略，硬规则 22）：删用药人不让历史格子变成空白。
- `usage_id` 可空：迁移进来的「历史消耗」格没有对应记录。

### 3.2 现有表改动

| 表 | 改动 | 理由 |
| --- | --- | --- |
| `medications` | + `blister_rows` / `blister_cols`（可空整数） | 药品级板型规格；补货新建板时用它。非板装药为 NULL |
| `usages` | `reminder_id` / `plan_id` 改可空 | 孪生页手动点格子产生的服用没有提醒来源；存量行不受影响 |

`SCHEMA_VERSION` 2 → 3（`client.ts` 的 `CREATE_TABLES` 与 `TABLES` 同步改，硬规则 26）。

### 3.3 不变式（本方案最重要的一条）

```
remainingQuantity === Σ(status === "full" 的槽位)
totalQuantity    === Σ(全部槽位)
```

只对**已建孪生**的板装药成立。每条写操作都必须维持它：

| 操作 | 槽位 | 库存 | usage | reminder |
| --- | --- | --- | --- | --- |
| 提醒「已服」`takeReminder` | 按序消耗 N 格 → `empty` + usageId | `−N`（clamp 0） | +1 | → taken |
| 手动点格 `consumeBlisterSlot` | 该格 → `empty` + usageId | `−1` | +1（reminderId null） | 无 |
| 标记损坏 `voidBlisterSlot` | 该格 → `void` | `−1` | 无 | 无 |
| 恢复槽位 `restoreBlisterSlot` | `void`/历史 `empty` → `full` | `+1` | 无 | 无 |
| 撤销服用 `undoUsage` | 该 usage 占用的格 → `full` | `+amount`（clamp total） | −1 | → pending |
| 补货按板 `appendBlisterPacks` | 新板全 `full` | `+板数×每板粒数`（total 同增） | 无 | 无 |
| 开启孪生 `openBlisterTwin` | 建板；前 `板数×粒数−remaining` 格标历史 `empty` | remaining 不变，total 重写为真实槽位数 | 无 | 无 |

槽位不足时（如只剩 2 格但剂量 3 片）`takeReminder` **静默跳过槽位消耗**，库存照扣——提醒闭环永不因孪生数据不完整而阻断。

## 4. 存量药品开启孪生

老板装药没有 packs/slots。孪生页对没建板的药承载**开启表单**（每板行数、列数、板数）：

- `packCount` 至少 `ceil(remaining / 每板粒数)`，保证不变式
- 按「板序 → 格序」前 `板数×粒数 − remaining` 格标为 `empty` 且 `usageId = null`（UI 显示「历史消耗 · 无服用记录」），其余 `full`
- `totalQuantity` 重写为真实槽位数（老数据里「记了 25 但实际一板 30」这类账，以物理板为准修正）

新建板装药时在表单里填规格 + 板数，`addMedication` 同事务建板，不需要走开启流程。

## 5. store.ts 纯函数

`packStatus` / `blisterSummary` / `nextFullSlots` 为纯函数；写操作统一 `xxxIn(data): AppData` 形态（与 `syncRemindersIn` 一致），异步入口只做 `updateData(xxxIn)`。

## 6. UI

| 位置 | 改动 |
| --- | --- |
| `medica/form.tsx` | 选「板装」时出现「每板规格（行×列）+ 板数」，库存输入框隐藏（由板推导）；已建板的药锁死包装形式，规格只影响后续新板 |
| `medica/detail.tsx` | 新增「数字孪生」区块：已建板 → 进度卡进孪生页；未建板 → 引导卡；补货区对板装改为「补充药板」 |
| `medica/twin.tsx`（新路由，实现在 `src/screens/medica/twin.tsx`） | 概览（剩余/总数/预计天数）→ 板切换 chip 行 → 泡罩网格 → 图例 → 操作；点格弹 universal `BottomSheet` 做「标记已服 / 标记损坏 / 撤销 / 恢复」 |
| 用药人选择 | 网格顶部 universal `Picker appearance="menu"`（同首页成员筛选），决定手动服用记在谁头上；默认取该药第一个生效配置的用药人 |

网格格子尺寸按 `useExpoUiContentWidth` 实测宽计算（universal 无 flex，等分靠算，同表单两列字段），每格 `testID="twin-slot-<seq>-<index>"`。sheet 内操作为 RN 视图（BottomSheet 的 children 在各平台都是 RN 视图），按钮带 testID。

## 7. i18n 与测试

- `twin.*` 词条组，zh + en 同步加（规则 29）。
- `maestro/twin.yaml`：建板装药 → 进孪生页 → 点格服药 → 概览数变化 → 撤销。

## 8. 遗留

- 系统大字号下网格格子尺寸固定，格内图标不缩放（格子是等分几何，不是文字行）。
- 一盒多药盒（组合包装）不做：一药一盒，盒内多板。
