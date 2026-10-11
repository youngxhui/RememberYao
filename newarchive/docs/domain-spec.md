# RememberYao 领域规格（两端唯一权威）

本文档是 iOS（Swift）与 Android（Kotlin）共用的**领域层契约**。
所有业务规则、公式、不变式以此文为准；两端实现必须逐条对齐，不允许各自发挥。

来源：Expo 版 `src/lib/store.ts` / `src/db/schema.ts` / `src/lib/notifications.ts`。

---

## 1. 实体模型

### 1.1 Medication（药品）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 主键 |
| name | String | 药品名称 |
| type | MedicationType | 包装形式：`blister` 板装 / `bottle` 瓶装 / `loose` 散装 |
| category | MedicationCategory | 用途分类：`chronic` 慢性病 / `acute` 临时用药 / `supplement` 保健品 |
| specification | String | 规格自由文本，如 `10mg/片`，可为空 |
| unit | MedicationUnit | `tablet` 片 / `pill` 粒 |
| totalQuantity | Int | 总数量（入库时） |
| remainingQuantity | Int | 剩余数量 |
| blisterRows | Int? | 每板行数，非板装或未记录为 null |
| blisterCols | Int? | 每板列数，与 blisterRows 配对 |
| expiryDate | String? | `YYYY-MM-DD`，null = 未记录，不参与到期提醒 |
| prescription | Bool | 是否处方药 |
| notes | String | 备注 |
| createdAt | String | ISO8601 |
| updatedAt | String | ISO8601 |

### 1.2 Person（用药人）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 主键 |
| name | String | 姓名 |
| avatarColor | String | 头像底色 `#rrggbb` |
| gender | Gender? | `male` / `female` / `other`，未填写为 null |
| age | Int? | 周岁，未填写为 null |
| allergies | [String] | 过敏原列表 |
| underlyingConditions | [String] | 基础病 / 慢性病史 |
| createdAt | String | ISO8601 |

### 1.3 MedicationPlan（用药配置）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 主键 |
| medicationId | String | 外键 → Medication |
| personId | String | 外键 → Person |
| doseAmount | Int | 每次剂量（药品单位） |
| times | [String] | 每日服用时间 `HH:MM` 数组，长度即每日次数 |
| startDate | String | `YYYY-MM-DD` |
| endDate | String? | null = 长期 |
| enabled | Bool | |
| createdAt / updatedAt | String | ISO8601 |

### 1.4 Reminder（提醒）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 主键 |
| planId | String | 外键 → MedicationPlan |
| medicationId / personId | String | 冗余外键，快照化查询 |
| date | String | `YYYY-MM-DD` |
| time | String | `HH:MM` |
| doseAmount | Int | |
| status | ReminderStatus | `pending` / `taken` / `skipped` / `missed` |
| snoozedUntil | String? | 「稍后提醒」推迟时刻 ISO |
| resolvedAt | String? | 已服用 / 跳过的处理时刻 ISO |
| createdAt | String | ISO8601 |

**去重唯一键：`(planId, date, time)`** —— 同一次服用只允许一条提醒。

### 1.5 MedicationUsage（服用记录）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 主键 |
| reminderId | String? | 来源提醒，手动记录为 null |
| planId | String? | 来源配置，手动记录为 null |
| medicationId | String | |
| personId | String | |
| personName | String | **快照**，删用药人不清历史 |
| medicationName | String | **快照**，删药品不清历史 |
| time | String | 计划服用时间 `HH:MM`；手动记录为操作时刻 |
| amount | Int | 实际服用数量 |
| late | Bool | 是否漏服后补记 |
| takenAt | String | ISO8601 |
| createdAt | String | ISO8601 |

### 1.6 BlisterPack（药板）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 主键 |
| medicationId | String | 外键 |
| seq | Int | 盒内第几板，从 1 开始 |
| rows / cols | Int | 存在板自己身上；老板规格可能被改过，历史板保持自身几何 |
| createdAt | String | ISO8601 |

**唯一键：`(medicationId, seq)`。不存 status** —— `sealed` / `open` / `consumed` 全部由槽位推导。

### 1.7 BlisterSlot（槽位）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | String | 主键 |
| packId | String | 外键 |
| index | Int | 从 0 开始，从左到右、从上到下 |
| status | BlisterSlotStatus | `full` 有药 / `empty` 已服（含历史消耗）/ `void` 损坏遗失 |
| usageId | String? | 消耗它的服用记录 id；历史消耗格为 null |
| consumedAt | String? | 消耗时刻 ISO |
| consumedBy | String? | **快照**：消耗者姓名 |

**唯一键：`(packId, index)`。**

### 1.8 Settings（全局设置，单例）

| 字段 | 类型 | 默认值 |
| --- | --- | --- |
| notificationsEnabled | Bool | `true` |
| snoozeMinutes | Int | `10` |
| quietStart | String? | `null` |
| quietEnd | String? | `null` |
| soundEnabled | Bool | `true` |
| missedAlertStreak | Int | `2` |

`SNOOZE_OPTIONS = [10, 15, 30, 60]`（分钟）

---

## 2. 常量

| 名称 | 值 | 用途 |
| --- | --- | --- |
| `GRACE_MINUTES` | 60 | 到点后这么久未处理才判漏服 |
| `REMINDER_KEEP_DAYS` | 90 | 更早的已处理提醒被清理，服用记录永久保留 |
| `LOW_STOCK_DAYS` | 3 | 按当前配置估算剩余天数 ≤ 该值视为库存不足 |
| `GENERATE_AHEAD_DAYS` | 7 | 提前生成的天数（含今天） |
| `MAX_PACK_SIDE` | 12 | 每板单边格数上限 |
| `MAX_PACK_COUNT` | 20 | 补货板数上限 |
| `MAX_PENDING_NOTIFICATIONS` | 60 | iOS「待触发通知」硬上限 64，留 4 条余量给即时通知；只排最近的这么多条 |
| `PERSON_AVATAR_COLORS` | `#0F766E #D97706 #DC2626 #2563EB #7C3AED #DB2777` | 头像色板 |

`DEFAULT_MEDICATION_CATEGORY = chronic`

---

## 3. 纯函数（必须逐字对齐）

### 3.1 日期 / 时间

```
dateKey(Date) -> "YYYY-MM-DD"          // 本地时区
todayKey() -> dateKey(now)
addDays("YYYY-MM-DD", n) -> "YYYY-MM-DD"
parseDateTime("YYYY-MM-DD", "HH:MM") -> Date   // 本地
dateFromKey("YYYY-MM-DD") -> Date             // 当天 00:00
dateToTime(Date) -> "HH:MM"
compareTime(a, b) -> Int                      // 字典序，禁止用时间库
defaultTimes(n) -> ["08:00","12:00","18:00","21:00","10:00","15:00"][0..<n]
```

### 3.2 派生时间点

```
reminderDueDate(r)  = parseDateTime(r.date, r.time)
reminderMissDate(r) = reminderDueDate(r) + GRACE_MINUTES
```

### 3.3 姓名 / ID 取色（稳定 hash）

```
hashName(s): h = 0
             for c in s.utf16: h = (h * 31 + c) | 0   // 32 位有符号回绕
             return h & 0x7FFFFFFF                    // 掩掉符号位，必然非负
pickAvatarColor(name) = PERSON_AVATAR_COLORS[hashName(name.trim()) % 6]
pickPillTint(id)      = PILL_TINTS[hashName(id) % 6]
```

⚠️ 最后一步是**掩符号位**，不是 `abs(h)`：`abs(Int32.min)` 在 Swift 里直接 trap，
Kotlin 的 `abs(Int.MIN_VALUE)` 又原样返回负数、取模出负下标越界。两端都必须
`& 0x7FFFFFFF`。由 `DomainTest` 用固定向量锁死跨端一致。

`PILL_TINTS`（body / cap / score）：

```
#FDFDFA / #F2DFB4 / #E5DEC9
#FFF6DE / #F2C94C / #E8D49A
#FDEBEB / #E86A6A / #EFC3C3
#FFF1D6 / #F2994A / #EBD2A6
#EAF2FD / #4A7FD4 / #C9D9F0
#EDF7EF / #5FA777 / #CDE6D5
```

### 3.4 配置生效与状态

```
planActiveOnDate(plan, key):
  !plan.enabled                        -> false
  key < plan.startDate                 -> false
  plan.endDate != null && key > endDate -> false
  otherwise                            -> true

planStatusLabel(plan):
  !enabled        -> "已停用"
  ended (< today) -> "已结束"
  otherwise       -> "服用中"
```

> **命名差异（两端的硬性差异，不是分歧）：**
> - iOS：`planActiveOnDate(plan, key)`；Android：`MedicationPlan.isActive(day: String)`。
>   Kotlin 的 `on` 是保留字，形参不能叫 `on`，改叫 `day`。
> - 所有写函数 iOS 带 `In` 后缀（`takeReminderIn`），Android 不带（`takeReminder`）——
>   Swift 需要靠后缀把「返回新快照的纯函数」与 `Store` 上的挂起方法区分开，
>   Kotlin 的包级函数与方法在不同命名空间，不需要。

### 3.5 库存

```
stockLevel(m):
  ratio = m.totalQuantity > 0 ? remaining / total : 0
  ratio <= 0.15 -> critical
  ratio <= 0.30 -> low
  otherwise     -> ok

stockSummary(m, plans):
  dailyDose = Σ (p.doseAmount * p.times.count)
              over plans where p.medicationId == m.id && planActiveOnDate(p, today)
  daysLeft   = dailyDose > 0 ? floor(m.remaining / dailyDose) : null
  low        = daysLeft != null && daysLeft <= LOW_STOCK_DAYS
```

> `stockLevel` 只看剩余比例（不依赖有没有人在吃）；`stockSummary().low` 看还能吃几天（依赖配置）。两者维度不同，不可混用。`totalQuantity == 0` 时按 `critical` 处理。

### 3.6 板装孪生

```
clampSide(n) = clamp(round(n), 1, MAX_PACK_SIDE)   // 非有限值 -> 1

packStatus(slots):
  空            -> sealed
  无 full       -> consumed
  有 non-full   -> open
  否则          -> sealed

blisterSummary(m, packs, slots):
  own      = packs where medicationId == m.id, 按 seq 升序
  ownSlots = slots where packId ∈ own
  enabled      = own 非空
  packCount    = own.count
  slotsPerPack = own.first?.rows * cols ?? 0
  totalSlots   = ownSlots.count
  fullSlots    = ownSlots.count where status == full
  openPack     = own.first where 该板有 full 槽位, else null

nextFullSlots(packs, slots, count):
  按 pack.seq 升序；每板内按 slot.index 升序；取前 count 个 full
```

**不变式：`medication.remainingQuantity == Σ(full 槽位)`。**

### 3.7 统计

```
weekStartKey(today):
  offset = (weekday(today) + 6) % 7      // 周一 = 0
  return addDays(today, -offset)

weekStats(reminders, from, to):
  inRange = reminders where from <= date <= to
  taken   = count where status == taken
  missed  = count where status == missed
  planned = inRange.count
  adherence = planned > 0 ? round(taken / planned * 100) : 0

missedStreaks(reminders, threshold):
  threshold <= 0 -> 空集合
  按 personId 分组；每组按 (date, time) **降序**
  从最新往回数连续 missed：
    missed  -> streak++;  if streak >= threshold: 命中该 person
    taken/skipped -> streak = 0
    pending -> break（未来待服用既不计入也不打断）
```

### 3.8 免打扰

```
inQuietHours(settings, "HH:MM"):
  quietStart / quietEnd 任一为空 -> false
  两者相等                  -> false
  start < end  -> start <= t && t < end
  start > end  -> t >= start || t < end        // 跨零点拆两段
```

---

## 4. 状态机与写操作

### 4.1 提醒同步（幂等，无变更返回原值）

```
syncReminders(data):
  1. 为每个 plan 生成 today ~ today+6 天的提醒，按 (planId,date,time) 去重
  2. status == pending 且 reminderMissDate(r) < now -> missed（resolvedAt = now）
  3. 清理 date < today - 90 天的提醒（保留已处理历史中的服用记录）
```

### 4.2 takeReminder(id)

```
r = reminders[id]
if r == nil || (r.status != pending && r.status != missed): 原样返回
usage = MedicationUsage(
  reminderId = r.id, planId = r.planId,
  medicationId = r.medicationId, personId = r.personId,
  personName     = person?.name     ?? "已删除的用药人",
  medicationName = medication?.name ?? "已删除的药品",
  time = r.time, amount = r.doseAmount,
  late = (r.status == missed), takenAt = now, createdAt = now)
r.status = taken, r.resolvedAt = now
medication.remainingQuantity = max(0, remaining - r.doseAmount)
按 nextFullSlots 消耗 doseAmount 个槽位 -> empty（usageId = usage.id）
```

> 槽位不足时 `consumeSlots` 原样返回 —— **提醒闭环永不因孪生数据不完整而阻断，库存照扣。**

### 4.3 snoozeReminder(id, minutes?)

```
delay = minutes ?? settings.snoozeMinutes
r.snoozedUntil = now + delay 分钟     // 仅 pending / missed 可设置
```

### 4.4 skipReminder(id)

```
r.status = skipped, r.resolvedAt = now   // 不扣库存；pending / missed 可跳过
```

### 4.5 药品 CRUD

- `addMedication(input)`：板装且带 `blister{rows,cols,packCount}` 时，
  `total = remaining = perPack * packCount`，并调用 `openBlisterTwinIn` 建板。
- `updateMedication(id, patch)`：只覆盖传入字段，`updatedAt = now`。
- `deleteMedication(id)`：级联删除 plans / reminders / packs / blisterSlots；
  **usages 作为历史永久保留**。

### 4.6 用药人 CRUD

- `addPerson(input)`：`avatarColor = pickAvatarColor(name)`，`name` 去空格。
- `updatePerson(id, patch)`：只覆盖传入字段。
- `deletePerson(id)`：级联删除 plans / reminders；**usages 永久保留**。

### 4.7 配置 CRUD

- `addPlan(input)` → `syncRemindersIn`
- `updatePlan(id, patch)`：作废该配置**未处理**的提醒，再重新生成（已 taken/skipped/missed 作为历史保留）
- `deletePlan(id)`：删除配置及其全部提醒
- `applyPlanChanges({add, update, remove})`：**一次写库 + 一次 syncReminders + 一次通知重排**。
  逐笔调用会导致选四种药闪四次通知重排。

### 4.8 孪生写操作

| 操作 | 语义 |
| --- | --- |
| `openBlisterTwin(id, {rows, cols, packCount})` | 重建：先清旧板格。`packCount ≥ max(1, round(input), ceil(remaining/perPack))`。总格数 − 剩余 = 历史消耗，按板序格序从第一格标 `empty`（usageId = null）。`totalQuantity` 重写为真实槽位数 |
| `appendBlisterPacks(id, count)` | 追加 count 块满板，`seq` 续号；`total`/`remaining` 各加 `count * perPack` |
| `consumeBlisterSlot(slotId, personId)` | 点哪格耗哪格，产生 usage（reminderId/planId = null，amount = 1，time = 操作时刻） |
| `voidBlisterSlot(slotId)` | 标损坏，不产生 usage，库存 −1 |
| `restoreBlisterSlot(slotId)` | void / 历史 empty（无 usage）→ full，库存 +1（≤ totalQuantity） |
| `undoUsage(usageId)` | 删 usage、提醒回退 `pending`（**非 taken**）、恢复槽位、回补库存 |

### 4.9 设置

`updateSettings(patch)`：免打扰**成对出现**，只改一端等于禁用，统一补齐为 null。

---

## 5. 通知调度

```
rescheduleReminders(data):
  1. cancelAllScheduled
  2. if !settings.notificationsEnabled: return
  3. for r in reminders where status == pending:
       due    = reminderDueDate(r)
       snooze = r.snoozedUntil ?? 0
       at     = max(due > now ? due : reminderMissDate(r), snooze > now ? snooze : 0)
       if at <= now: continue
       overdue = due <= now
       silent  = !settings.soundEnabled || inQuietHours(settings, dateToTime(at))
       title   = overdue ? "该吃药了（已超时）" : "该吃药了"
       body    = "{person} · {medication} {amount}{unit}"
       schedule(at, identifier = r.id, silent)
```

**要点：**
- 免打扰**只压声音，不压通知本身** —— 漏服是安全相关的事。
- Android 优先精确闹钟（`AlarmClock`），不可用时退回普通调度。
- `missedStreaks` 命中的成员补发一条即时通知；`alertedStreaks` 记住已提醒的人，只有连击**重新攒起来**才再响。

通知操作按钮：`已服用` / `跳过`（点击后直接落库并重排）。

### 5.1 Android 用两条通知渠道承载「静音」

API 26 起声音与震动由**渠道**决定，`Notification.Builder.setSound/setVibrate/setDefaults`
已废弃且对渠道不生效。因此 Android 建两条渠道，`silent` 只决定挑哪条：

| 渠道 | importance | 声音 / 震动 |
| --- | --- | --- |
| `medication-reminder` | HIGH | 有 |
| `medication-reminder-silent` | LOW | 无 |

渠道名走本地化词条，语言切换后由 `MainActivity.onCreate` 重建一次
（`recreate()` 不会再走 `Application.onCreate`）。iOS 端没有渠道概念，
`soundEnabled` / 免打扰在 `UNMutableNotificationContent` 上直接生效。

---

## 6. 两端技术选型

| | iOS | Android |
| --- | --- | --- |
| 语言 | Swift 6 | Kotlin 2.x |
| UI | UIKit（纯代码，无 Storyboard） | Jetpack Compose + Material 3 |
| 最低版本 | iOS 26 | Android 14（API 34） |
| 持久化 | SwiftData | Room |
| 响应式 | `@Observable` + Observation | StateFlow / Flow |
| 通知 | UserNotifications（UNUserNotificationCenter） | NotificationManager + AlarmManager |
| 本地化 | String Catalog（`.xcstrings`） | `res/values/strings.xml` + `values-en` |
| 依赖注入 | 手动构造 + Environment | Hilt |
| 项目生成 | XcodeGen（`project.yml`） | Gradle KTS |

**禁止**：RxJava、Retrofit、任何跨端框架、任何日期库（用 `Calendar`/`LocalDateTime` 手写）。

---

## 7. 实现状态

| | 状态 |
| --- | --- |
| Android | `./gradlew assembleDebug` / `assembleRelease` 通过，0 error 0 warning（仅 `@ApplicationContext` 的 Kotlin 未来兼容提示 2 条：改成 `@field:` 会让 Hilt 找不到注入，故保持原样）。12 条路由全部接通，无占位屏。**未在真机 / 模拟器上运行过** |
| iOS | `xcodebuild ... build` 通过。**引导页在模拟器上跑通不崩溃**；主 tab 与推入的各屏未做运行时验证 |

> 迁移来源是仓库根目录的 Expo 版（`src/`）。Expo 版仍保留作为行为参照，
> 但不再是交付物；后续改动只应落在 `newarchive/` 两端之一，并同步本规格。

