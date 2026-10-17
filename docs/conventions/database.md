# 数据库层

本地 **SQLite**（`expo-sqlite` + `drizzle-orm`），2026-09 从「AsyncStorage 存整份 JSON」迁移而来。
2026-10 从「整份读入内存再整份写回」改为**按实体、按需读写**。

## 结构

```
src/db/
  schema.ts   表定义（Drizzle），列名 snake_case
  client.ts   打开数据库 + 版本不符即重建
  repo.ts     仓储层：按实体 / 按查询的 granular 读写 + 事务
```

`src/lib/store.ts` 仍然是**唯一的数据入口**（规则 19/20 不变）：屏幕只调它的
查询 Hook 与写操作，SQL 与列名不出现在 `src/db` 以外。行 ↔ 实体的映射
（snake_case 列名、JSON 列、枚举收窄）收敛在 `repo.ts`，store 与屏幕只见到
`src/lib/entities.ts` 的实体形状。

## 表

| 表 | 说明 | 索引 |
| --- | --- | --- |
| `medications` | 药品 + 库存 | PK |
| `persons` | 用药人（`avatar_uri` = 本地照片文件路径，null 表示没照片） | PK |
| `plans` | 用药配置 | `medication_id`、`person_id` |
| `reminders` | 按天生成的单次提醒 | `date`、`plan_id`、**UNIQUE `(plan_id, date, time)`** |
| `usages` | 服用记录（快照） | `taken_at`、`reminder_id` |
| `packs` | 泡罩药板（板装孪生） | `medication_id`、UNIQUE `(medication_id, seq)` |
| `blister_slots` | 泡罩槽位 | `pack_id`、UNIQUE `(pack_id, slot_index)` |
| `settings` | 全局偏好（单行，id 恒为 `singleton`） | PK |

### 两个设计决定

**`plans.times` 存 JSON 字符串。** 每日服用时间数组总是整体读写、从不按元素查询，拆子表只会让写入路径变复杂。`repo.ts` 的 `toPlanRow` / `fromPlanRow` 负责序列化。

**`reminders` 上有 UNIQUE `(plan_id, date, time)`。** 这是提醒去重的**最后一道防线** —— 生成前会在内存里去重（`planReminderSync`），但它只靠 `Set` 判断；提醒同步是「读窗口 → 算差异 → 写」的多步流程，并发同步会算出同一批新提醒，数据库层兜底比在 UI 层排查便宜得多。

**服用记录的快照字段仍是快照。** `usages.person_name` / `medication_name` / `time` 存的是创建时的值，删药品/删人不清除历史（规则 22）。这几列**没有外键约束**就是为此。

## 按需读写（替代全量快照）

每个仓储函数只碰自己那张表（级联删除除外），读什么、写什么由调用方决定：

```ts
// 读：屏幕要什么查什么
const reminder = await getReminder(id, tx);
const ownPacks = await listPacksForMedication(medicationId, tx);

// 写：只写改动到的行
await updateReminder(id, { status: "taken", resolvedAt }, tx);
await updateMedicationRow(id, { remainingQuantity, updatedAt }, tx);
```

**多表写入包在 `withTransaction` 里。** store 的每个写操作都是一个事务：
「标记已服用」要同时插 usage、改提醒状态、扣库存、消耗槽位，要么全部落库，
要么整体回滚，不会留下半份数据。所有写操作经 store 的 `mutate()` 串行执行
（写队列），保证「已服用」进行到一半时进来的「撤销」能看到前者的写。

查询函数都接受可选的最后一个参数 `db?: Handle`（库连接或事务句柄）：
不传走全局连接，传了就在调用方的事务里执行 —— 事务边界由 store 控制。

### 为什么不再全量快照

旧版 `replaceAll()` 每次写盘都 upsert 全部行再删不在集合内的行，配 `selectAll()`
整份读入内存。家庭用药一年几千行，全量写的开销确实可以忽略，但它有两个真实代价：

1. **每次写盘都重写整库**：标记一次服用要顺带重写全部药品、配置、历史记录；
2. **整个应用只有一份内存态**：任何屏幕的 reload 都是全表读取，数据量随使用时间单调增长，
   读取成本与屏幕实际需要什么无关。

现在读写都按屏幕的实际需要：首页查未处理提醒，详情页查这一味药的配置 / 板 / 槽位，
服药记录按日期查。业务逻辑没有分叉 —— 提醒生成与状态机照旧是纯函数
（`planReminderSync` / `planTwinBuild` / `planPackAppend`），只是输入从
「整份 AppData」变成「这一操作用到的几个切片」。

## 查询 Hook

store 层把仓储函数包成按屏幕的 Hook（`useMedications` / `useRemindersForDate` /
`useMedication` / `usePacksForMedication` …），统一形态：

```tsx
const { data, loading, reload } = useRemindersForDate(date);

useFocusEffect(useCallback(() => { reload(); }, [reload]));
```

- `deps` 变化自动重查（如翻日期），`reload` 供聚焦时手动刷新；
- `loading` 是**首屏**加载标志，加载没结束时不显示 empty 态（界面四态约定）；
- 提醒类查询（`useOpenReminders` / `useRemindersForDate` / `useReminderHistory`）
  读数据前会先跑 `syncReminders()`（幂等）：界面看到的状态必须和状态机的当前判定一致；
- 读失败保留上一份数据并结束 loading，屏幕走 empty / error 态而不是白屏。

## 迁移

`client.ts` 按 `PRAGMA user_version` 判断表结构版本：**不符即整库重建**
（`DROP` 全部表 → 按最新 `CREATE_TABLES` 重建 → 写回版本号）。开发阶段不做
增量迁移，代价是本地数据丢失 —— 换表结构本就要重来，比留着半张旧表崩在
`no such column` 上好。

**加字段 / 加表的流程**：

1. `schema.ts` 加列（带默认值，否则老行是 NULL）
2. `client.ts` 的 `CREATE_TABLES` 同步加（**两处都要改**：Drizzle schema 用于类型推导，运行时建表走这份 SQL）
3. `SCHEMA_VERSION` +1 —— 下次启动自动删库重建
4. `repo.ts` 的行映射（`fromXxxRow` / `toXxxRow` / `xxxSetValues`）处理新字段
5. `src/lib/entities.ts` 的实体类型加字段

`user_version` 只在建表成功后才写入，中途失败会让版本停留在旧值，下次启动重来。
开库时固定设 `journal_mode = WAL`（并发读性能）和 `foreign_keys = ON`。

**版本号之外还有一道列名兜底。** 版本号只证明「上次重建过」，证明不了表还是那个
形状：跑过一版「改了版本号但 CREATE_TABLES 还没改」的包时，`user_version` 已经
是新值，重建会被跳过，之后写库直接撞 `no such column named xxx`（极难排查）。
所以开库时除了比版本号，还会用 `PRAGMA table_info` 逐表比对 `schema.ts` 推导出的
列名（列名从 drizzle 的内部 symbol 取，不手写第二份清单），缺列就整库重建。
取不到列名（升级 drizzle 改了内部结构）时跳过这道检查，退回只比版本号的老行为 ——
不会因为读不懂内部结构就把库反复删掉。

## 并发

- **写**：store 的 `mutate()` 用写队列串行化所有事务，同一时刻只有一个写事务；
  单次失败记日志后吞掉（事务已回滚，不留半份数据），屏幕随后 reload 会看到操作未生效。
- **读**：WAL 下读不阻塞写，查询 Hook 直接并发读。
- **提醒同步**：`syncReminders()` 整段串行（sync 链）—— 生成前的读不在写事务里，
  两个屏幕同时聚焦会算出同一批新提醒，靠 UNIQUE 索引兜底会让其中一次事务失败。

`getDb()` 懒打开数据库，并发调用共享同一个实例；打开失败时抛给上层，
屏幕走 error / empty 态而不是白屏。

## 开发工具

`expo-sqlite` 的 inspector 在开发模式自动可用：Expo CLI 终端按 `Shift + M` → **Open expo-sqlite**，可以浏览表、看行、跑 SQL、导出数据库。
