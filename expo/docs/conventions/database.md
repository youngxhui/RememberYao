# 数据库层

本地 **SQLite**（`expo-sqlite` + `drizzle-orm`），2026-09 从「AsyncStorage 存整份 JSON」迁移而来。

## 结构

```
src/db/
  schema.ts   表定义（Drizzle），列名 snake_case
  client.ts   打开数据库 + 按 user_version 顺序跑迁移
  repo.ts     仓储层：selectAll / replaceAll
```

`src/lib/store.ts` 仍然是**唯一的数据入口**（规则 19/20 不变），只是把 `AsyncStorage.setItem(JSON)` 换成了 `replaceAll()`。对外 API 一字未改，屏幕层无感知。

## 表

| 表 | 说明 | 索引 |
| --- | --- | --- |
| `medications` | 药品 + 库存 | PK |
| `persons` | 用药人 | PK |
| `plans` | 用药配置 | `medication_id`、`person_id` |
| `reminders` | 按天生成的单次提醒 | `date`、`plan_id`、**UNIQUE `(plan_id, date, time)`** |
| `usages` | 服用记录（快照） | `taken_at`、`reminder_id` |

### 两个设计决定

**`plans.times` 存 JSON 字符串。** 每日服用时间数组总是整体读写、从不按元素查询，拆子表只会让写入路径变复杂。`store.ts` 的 `toRows`/`fromRows` 负责序列化。

**`reminders` 上有 UNIQUE `(plan_id, date, time)`。** 这是提醒去重的**最后一道防线** —— `syncRemindersIn` 已经在内存里去重过（幂等），但它只靠 `Set` 判断，一旦并发写或逻辑改动，重复提醒会直接变成重复通知。数据库层兜底比在 UI 层排查便宜得多。

**服用记录的快照字段仍是快照。** `usages.person_name` / `medication_name` / `time` 存的是创建时的值，删药品/删人不清除历史（规则 22）。这几列**没有外键约束**就是为此。

## 全量快照语义

`replaceAll(data)` 在一个事务里做两件事：

1. `INSERT ... ON CONFLICT DO UPDATE` 写入传入的全部行
2. `DELETE WHERE id NOT IN (...)` 删掉不在集合内的行

**先插后删**，这样删除不会破坏外键引用。

这不是偷懒的整表覆盖，是刻意选择：提醒生成与状态机本来就是纯函数在内存里算出完整份数据（`store.ts` 规则 25），仓储层只负责把结果写回去，业务逻辑没有分叉。家庭用药一年也就几千行，全量写的开销可以忽略，换来的是实现简单、失败整体回滚。

`NOT IN (NULL)` 在 SQL 里恒为假，所以空集合要走特殊分支（`repo.ts` 的 `stale()`）—— 直接 `notInArray(col, [])` 表达不了「删光」。

## 迁移

`client.ts` 按 `PRAGMA user_version` 顺序执行 `MIGRATIONS` 表里的 SQL：

```ts
const MIGRATIONS: Record<number, string> = { 1: MIGRATION_V1 };
```

**加新迁移**：在末尾追加 `2: MIGRATION_V2`，SQL 全部用 `IF NOT EXISTS` 写，重复执行安全。版本号由 `Object.keys(MIGRATIONS).length` 推导，不用手改常量。

开库时固定设 `journal_mode = WAL`（并发读性能）和 `foreign_keys = ON`。

### 从 AsyncStorage 迁移

`store.ts` 的 `initDb()` 在开库后检查 AsyncStorage 的 `rememberyao-data-v1`：

- 有 → 解析、规范化（补全快照字段）、`replaceAll` 写进 SQLite、**成功后**才 `removeItem`
- 失败 → 保留旧数据，下次启动重试

**绝不先删后写。** 静默丢用户两年的服药历史是不可接受的失败模式。

## 并发

`store.ts` 保留原来的 `writeQueue` 串行化：写盘失败重试一次，写队列不被 rejection 污染，磁盘失败时保留内存态、下次变更继续尝试。SQLite 的事务提供了原子性，`writeQueue` 提供的是「同一时刻只有一个写事务」。

`readData()` 首次调用会开 `initDb()`，并发调用共享同一个 Promise（`initPromise`），只真正开一次库。失败时把 `initPromise` 置空让下次重试，并退化为空数据 —— 屏幕走 error/empty 态而不是白屏。

## 加字段的流程

1. `schema.ts` 加列（带默认值，否则老行是 NULL）
2. `client.ts` 的 `MIGRATIONS` 加 `2: MIGRATION_V2`，用 `ALTER TABLE ... ADD COLUMN`
3. `store.ts` 的 `fromRows` / `toRows` 处理新字段
4. 更新 `schema.ts` 里对应的索引定义（Drizzle schema 用于类型推导，运行时建表走 `client.ts` 的 SQL —— **两处都要改**）

## 开发工具

`expo-sqlite` 的 inspector 在开发模式自动可用：Expo CLI 终端按 `Shift + M` → **Open expo-sqlite**，可以浏览表、看行、跑 SQL、导出数据库。
