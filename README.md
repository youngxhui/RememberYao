# RememberYao

家庭用药提醒 App：记录家里每个人的用药配置，到点自动推送通知，服用后自动扣减库存。

## 功能

- **今日**：当天的全部用药提醒，支持“已服用 / 跳过 / 补服”；漏服超过 1 小时宽限期才标记漏服，漏服可补记
- **药箱**：药品库存管理（剩余/总量、库存进度条、按计划估算可服用天数、低库存提醒、补货）
- **用药人**：家庭成员管理，每人可配置多种用药方案（药品、每次剂量、每日次数与具体时间、起止日期）
- **通知**：到点本地通知推送，通知栏直接“已服用 / 跳过”；修改或停用配置会立即同步未来的提醒

## 快速开始

```bash
npm install
npx expo start
```

> ⚠️ 本项目使用 `expo-notifications` 等原生模块，**必须使用 development build**（`npx expo run:ios` / `npx expo run:android`），Expo Go 中无法运行。新增原生依赖后需要重新构建。

## 目录结构

```
src/
  app/
    _layout.tsx            根布局：NativeTabs 四标签导航 + 通知初始化
    index.tsx              入口：未看过引导页 → 引导页，否则 → 首页
    (tabs)/
      home/                首页：今日进度、用药时间线、库存速览；首次启动承载引导页
      medica/              药品：库存列表 / 详情 / 表单 / 添加入口（拍照·手动·扫码）
      records/             记录：按日期查看服药记录与当日服药率
      profile/             我的：设置、家庭成员管理、用药配置
  lib/
    store.ts               数据层：实体、AsyncStorage 持久化、提醒生成与状态机
    notifications.ts       通知层：权限、调度、操作按钮、响应处理
    onboarding.ts          引导页“已看过”标记
  hooks/
    use-onboarding-gate.ts 首次启动引导页门禁
  components/              通用组件（头像、进度条、服药时间线、Tab 栏等）
  constants/theme.ts       主题色
maestro/                   端到端测试
```

## 数据模型

- `Medication` 药品：名称、包装类型、单位、总/剩余数量
- `Person` 用药人
- `MedicationPlan` 用药配置：药品 × 用药人 × 剂量 × 每日时间 × 起止日期 × 启用开关
- `Reminder` 提醒：由配置按天生成（提前 7 天），状态 `pending → taken / skipped / missed`
- `MedicationUsage` 服用记录：永久保留（含名称快照），删除药品或用药人不清除历史

## 提醒生命周期

1. 配置保存后按“今天起 7 天”生成提醒，并调度对应的本地通知
2. 到点推送通知；**超过 1 小时宽限期**未处理才标记“漏服”
3. 已服用/跳过/漏服均可再次操作（漏服可补服，记录标记为补记）
4. 修改配置的时间/剂量/停用：废弃该配置未处理的提醒并按新配置重新生成，已处理的记录保留
5. App 回前台或数据变更时自动重排通知

## 测试

```bash
maestro test maestro/mvp_flow.yaml    # 完整主流程
maestro test maestro/main_layout.yaml # Tab 布局
maestro test maestro/add_medica.yaml  # 添加药品
```

## 待办

- “记录”页：按日期查看历史与依从率统计（服用记录已采集，缺展示界面）
- 桌面 Widget（`expo-widgets` 已配置，未实现）
- 单元测试（`store.ts` 的提醒生成 / 库存扣减为纯函数，适合覆盖）
