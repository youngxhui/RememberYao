import {
  Button,
  Checkbox,
  Column,
  Host,
  Picker,
  Row,
  ScrollView,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from "@expo/ui";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { MemberAvatar } from "@/components/avatar";
import {
  ChipField,
  ErrorText,
  Field,
  FormSection,
  HintText,
  Subtitle,
} from "@/components/form";
import { InputShell } from "@/components/input-shell";
import { NativeDatePicker } from "@/components/native-date-picker";
import { nativeButtonModifiers } from "@/components/native-layout";
import { HairLine } from "@/components/section-card";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { pickerFormat, useI18n } from "@/i18n";
import { requestNotificationPermission } from "@/lib/notifications";
import {
  applyPlanChanges,
  dateFromKey,
  dateKey,
  dateToTime,
  defaultTimes,
  medicationUnitLabel,
  timeToDate,
  todayKey,
  useAppData,
  type Medication,
} from "@/lib/store";

const TIMES_PER_DAY = [1, 2, 3, 4, 5, 6];

/** 新勾一味药时的默认剂量 */
const DEFAULT_DOSE = "1";

/**
 * 用药配置：**先定人，再定他要吃的那些药**。
 *
 * 人与药是一对多 —— 一味药可以好几个人吃，一个人也可以同时吃好几味药。所以这一页
 * 的主语是「用药人」，药品是**可多选**的一组：勾几味药就一次落几条配置，每味药各自
 * 的剂量单独填（单位不同：片 / 粒 / ml），而服用时间与起止日期是这组药共用的。编辑态
 * 同理：原来那味药被取消勾选，保存时就移除那条配置。
 *
 * 用药人是不是「可改」取决于入口：从用药人详情进来（`params.personId`）时人已经定了，
 * 只读展示头像 + 姓名，不再摆选择器；从药品详情进来（`params.medicationId`）时不知道
 * 谁吃，才给菜单 Picker 选。
 *
 * 排版与添加药品（`src/app/(tabs)/medica/form.tsx`）、添加家庭成员
 * （`src/app/(tabs)/profile/persons.tsx`）共用 `@/components/form` 的基元：画布底 +
 * 分区卡片，label 在控件**上方**。但只有**文字输入**套 `InputShell` 圆角描边盒 ——
 * 原生自绘控件（菜单 `Picker`、compact 日期选择器）自己就带一颗灰底胶囊，再套一层
 * 就是「盒子里嵌盒子」（本项目对 Picker 的既有结论），一律裸放，并用 `accentColor`
 * 上品牌色、用 App 语言定日期时间格式。设置页（`src/screens/profile/settings.tsx`）
 * 那套原生 `FieldGroup` 是分组行的正解，表单页别混用。
 *
 * 药品多选不用 chip 行：`Row` 在 iOS 上是 HStack，**不折行**，药一多就溢出屏外
 * （成员筛选的既有结论，见 docs/conventions/ui-design.md）；改用 universal
 * `Checkbox` 逐行列。用药人保持 `Picker`（`appearance="menu"`）—— 选项数量不定，
 * 菜单只占一行、选项还能纵向滚动。
 *
 * ⚠️ 不要再把 `FieldGroup` / `List` 嵌进外层 `ScrollView`：它们在 iOS 上是
 * SwiftUI Form / List，本身就是滚动容器，嵌进去会塌成零高（项目已记录的真机
 * bug）。
 */
export default function PlanFormScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, language } = useI18n();
  const picker = pickerFormat(language);
  const params = useLocalSearchParams<{
    id?: string;
    personId?: string;
    medicationId?: string;
  }>();
  const isEditing = Boolean(params.id);
  const { medications, persons, plans, loading } = useAppData();

  // 首屏等 SQLite 载入再渲染：medications / persons 空着会闪一下「药箱还是空的」，
  // 编辑态还会把回填闪成新建态（AGENTS.md：首屏加载没结束时不显示 empty 态）
  const [loaded, setLoaded] = useState(false);
  const [personId, setPersonId] = useState(params.personId ?? "");
  // 勾选的药 → 每次剂量文本。用映射而不是单值：一个人可同时配多味药，
  // 每味药的单位不同，剂量必须逐味记。有键即「已勾选」
  const [doses, setDoses] = useState<Record<string, string>>(() =>
    params.medicationId ? { [params.medicationId]: DEFAULT_DOSE } : {},
  );
  /** 编辑态下原配置的那味药：保存时它还在勾选里就更新，被取消勾选就移除 */
  const [editingMedicationId, setEditingMedicationId] = useState<string | null>(
    null,
  );
  const [timesPerDay, setTimesPerDay] = useState(1);
  const [times, setTimes] = useState<string[]>(defaultTimes(1));
  const [startDate, setStartDate] = useState(todayKey());
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(todayKey());
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 数据就绪后只填充一次：等 plans 载入完再填，避免把用户已输入的内容覆盖掉
  const filledRef = useRef(false);
  useEffect(() => {
    if (filledRef.current || loading) return;
    filledRef.current = true;
    if (params.id) {
      const existing = plans.find((p) => p.id === params.id);
      if (existing) {
        setPersonId(existing.personId);
        setDoses({ [existing.medicationId]: String(existing.doseAmount) });
        setEditingMedicationId(existing.medicationId);
        setTimesPerDay(existing.times.length);
        setTimes(existing.times);
        setStartDate(existing.startDate);
        setHasEndDate(Boolean(existing.endDate));
        if (existing.endDate) setEndDate(existing.endDate);
        setEnabled(existing.enabled);
      }
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, plans, loading]);

  const changeTimesPerDay = (count: number) => {
    setTimesPerDay(count);
    setTimes((prev) => {
      const next = prev.slice(0, count);
      const defaults = defaultTimes(count);
      while (next.length < count) next.push(defaults[next.length]);
      return next;
    });
  };

  const changeTime = (index: number, date: Date) => {
    // 形参避开 t：外层已有 t()（翻译函数），同名会把两个概念混在一起
    setTimes((prev) =>
      prev.map((time, i) => (i === index ? dateToTime(date) : time)),
    );
  };

  const toggleMedication = (id: string) => {
    setDoses((prev) => {
      if (prev[id] !== undefined) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: DEFAULT_DOSE };
    });
  };

  const changeDose = (id: string, text: string) => {
    setDoses((prev) => ({ ...prev, [id]: text }));
    setError("");
  };

  const toggleEndDate = () => {
    const next = !hasEndDate;
    setHasEndDate(next);
    // 打开时兜一个不早于开始日期的值：结束日期默认「今天」，而开始日期可能被拨到
    // 将来，不兜这一手就会一保存就撞「结束日期不能早于开始日期」
    if (next && endDate < startDate) setEndDate(startDate);
  };

  const save = async () => {
    if (!personId) {
      setError(t("plan.errorPerson"));
      return;
    }
    // 勾选的药按药品库的顺序列，剂量逐一校验（每味药的单位不同，必须都有值）
    const entries = medications
      .filter((m) => doses[m.id] !== undefined)
      .map((m) => ({
        medication: m,
        amount: Number.parseInt(doses[m.id], 10),
      }));
    if (entries.length === 0) {
      setError(t("plan.errorMedication"));
      return;
    }
    if (entries.some((e) => !Number.isFinite(e.amount) || e.amount <= 0)) {
      setError(t("plan.errorDose"));
      return;
    }
    if (times.length === 0) {
      setError(t("plan.errorTimes"));
      return;
    }
    if (new Set(times).size !== times.length) {
      setError(t("plan.errorDuplicateTimes"));
      return;
    }
    if (hasEndDate && endDate < startDate) {
      setError(t("plan.errorEndDate"));
      return;
    }
    // 新建配置时申请通知权限，保证到点能收到提醒（被拒绝也不影响保存）
    if (!params.id) {
      await requestNotificationPermission();
    }
    const planId = params.id;
    // 时间与起止日期是这组药共用的，剂量才逐味不同
    const shared = {
      personId,
      times,
      startDate,
      endDate: hasEndDate ? endDate : null,
      enabled,
    };
    const editing = entries.find(
      (e) => e.medication.id === editingMedicationId,
    );
    await applyPlanChanges({
      add: entries
        .filter((e) => e.medication.id !== editingMedicationId)
        .map((e) => ({
          ...shared,
          medicationId: e.medication.id,
          doseAmount: e.amount,
        })),
      update:
        planId && editing
          ? [
              {
                id: planId,
                patch: {
                  ...shared,
                  medicationId: editing.medication.id,
                  doseAmount: editing.amount,
                },
              },
            ]
          : [],
      // 编辑态下把原来那味药取消勾选 = 把这味药从这位家人的配置里移除
      remove: planId && !editing ? [planId] : [],
    });
    router.back();
  };

  const remove = async () => {
    const planId = params.id;
    if (!planId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await applyPlanChanges({ remove: [planId] });
    router.back();
  };

  const title = isEditing ? t("plan.editTitle") : t("plan.formTitle");

  // 首屏还在读 SQLite：plans 是空的，直接渲染会把编辑态闪成新建态
  if (!loaded) {
    return (
      <>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>{title}</Stack.Title>
        <Host seedColor={theme.primary} style={{ flex: 1 }} />
      </>
    );
  }

  // 勾中的药按药品库顺序渲染：不用 Object.keys(doses)，勾选顺序会随点序变化，
  // 列表会跟着跳
  const selected = medications.filter((m) => doses[m.id] !== undefined);
  // 入口带 personId（用药人详情）时主语已定；人已被删才退回选择器
  const presetPerson = persons.find((p) => p.id === params.personId);

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>{title}</Stack.Title>
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <ScrollView
          showsIndicators={false}
          style={{ backgroundColor: theme.canvas }}
        >
          <Column
            spacing={Spacing.four}
            style={{
              paddingHorizontal: Spacing.screen,
              paddingVertical: Spacing.three,
              // 表单在 (tabs) 组内，尾部必须让开原生 tab 栏的高度，
              // 否则「保存配置」会被压在 tab 栏底下点不到
              paddingBottom: BottomTabInset + Spacing.four,
            }}
          >
            <Subtitle text={t("plan.formSubtitle")} />

            {/* ── 用药人：这一页的主语。人与药一对多，先定人再定他的药 ── */}
            <FormSection title={t("plan.sectionPerson")}>
              {presetPerson ? (
                /* 从用药人详情进来时人已经定了（params.personId）：不再给选择器，
                   直接显示是谁 —— 摆一个能改的选择器会让人以为还能换人 */
                <Row
                  alignment="center"
                  spacing={Spacing.rowGap}
                  style={{ paddingVertical: Spacing.two }}
                >
                  <MemberAvatar
                    color={presetPerson.avatarColor}
                    name={presetPerson.name}
                    size={36}
                  />
                  <Text
                    numberOfLines={1}
                    textStyle={{ fontSize: 17, fontWeight: "600" }}
                  >
                    {presetPerson.name}
                  </Text>
                </Row>
              ) : (
                <Field label={t("plan.person")}>
                  <Picker
                    testID="plan-person-picker"
                    appearance="menu"
                    selectedValue={personId}
                    onValueChange={(value) => setPersonId(value as string)}
                  >
                    <Picker.Item label={t("plan.personPlaceholder")} value="" />
                    {persons.map((p) => (
                      <Picker.Item key={p.id} label={p.name} value={p.id} />
                    ))}
                  </Picker>
                </Field>
              )}
              <HintText
                text={
                  presetPerson
                    ? t("plan.personFixedHint")
                    : persons.length === 0
                      ? t("plan.noPersonHint")
                      : t("plan.personHint")
                }
              />
            </FormSection>

            {/* ── 药品与剂量：多选，每味药一个剂量输入 ── */}
            <FormSection title={t("plan.sectionMedications")}>
              {medications.length === 0 ? (
                <HintText text={t("plan.noMedicationHint")} />
              ) : (
                <Column spacing={Spacing.three}>
                  <Field label={t("plan.medicationsLabel")}>
                    <Column spacing={Spacing.three}>
                      {medications.map((m) => {
                        const checked = doses[m.id] !== undefined;
                        return (
                          <Column key={m.id} spacing={Spacing.two}>
                            <Checkbox
                              testID={`plan-medication-${m.id}`}
                              value={checked}
                              onValueChange={() => toggleMedication(m.id)}
                              label={m.name}
                            />
                            {checked ? (
                              <DoseField
                                medication={m}
                                initial={doses[m.id]}
                                onChange={(text) => changeDose(m.id, text)}
                              />
                            ) : null}
                          </Column>
                        );
                      })}
                    </Column>
                  </Field>
                  {selected.length > 0 ? (
                    <HintText
                      text={t("plan.selectedCount", { count: selected.length })}
                    />
                  ) : null}
                  <HintText
                    text={
                      isEditing
                        ? t("plan.editUncheckHint")
                        : t("plan.medicationMultiHint")
                    }
                  />
                </Column>
              )}
            </FormSection>

            {/* ── 服用时间：这组药共用 ── */}
            <FormSection title={t("plan.sectionTimes")}>
              <Field label={t("plan.timesPerDay")}>
                <Picker
                  testID="plan-times-picker"
                  appearance="menu"
                  selectedValue={timesPerDay}
                  onValueChange={(value) => changeTimesPerDay(Number(value))}
                >
                  {TIMES_PER_DAY.map((n) => (
                    <Picker.Item
                      key={n}
                      label={t("plan.perDay", { count: n })}
                      value={n}
                    />
                  ))}
                </Picker>
              </Field>
              <HintText text={t("plan.timesSharedHint")} />
              {/* 时间行是「第 N 次 … 时间」的列表，不是带外盒的字段：compact
                  日期选择器自己就画一颗灰底胶囊（同菜单 Picker），再套一层
                  InputShell 就是盒子里嵌盒子。行间用发丝线分组 */}
              <Column>
                {times.map((time, index) => (
                  <Column key={index}>
                    {index > 0 ? <HairLine /> : null}
                    <Row
                      alignment="center"
                      style={{ paddingVertical: Spacing.two }}
                    >
                      <Text textStyle={{ fontSize: 15 }}>
                        {t("plan.ordinal", { index: index + 1 })}
                      </Text>
                      <Spacer flexible />
                      <NativeDatePicker
                        value={timeToDate(time)}
                        mode="time"
                        accentColor={theme.primary}
                        locale={picker.locale}
                        is24Hour={picker.is24Hour}
                        testID={`plan-dose-time-${index}`}
                        onValueChange={(date) => {
                          changeTime(index, date);
                        }}
                      />
                    </Row>
                  </Column>
                ))}
              </Column>
            </FormSection>

            <FormSection title={t("plan.sectionDateRange")}>
              {/* 两个日期字段的容器必须一致：控件都作为 Row 的首子元素，
                  左边距才相同。原先开始日期把选择器直接放在 Field 的 Column 里、
                  结束日期放在 Row 里，两种容器各排一遍 —— 社区选择器正是因此
                  一个顶出内边距、一个纵向偏移（见 native-date-picker.ios.tsx） */}
              <Field label={t("plan.startDate")}>
                <Row alignment="center">
                  <NativeDatePicker
                    value={dateFromKey(startDate)}
                    mode="date"
                    accentColor={theme.primary}
                    locale={picker.locale}
                    testID="plan-start-date"
                    onValueChange={(date) => setStartDate(dateKey(date))}
                  />
                </Row>
              </Field>
              <Field label={t("plan.endDate")}>
                <Row alignment="center" spacing={Spacing.rowGap}>
                  {hasEndDate ? (
                    <NativeDatePicker
                      value={dateFromKey(endDate)}
                      mode="date"
                      minimumDate={dateFromKey(startDate)}
                      accentColor={theme.primary}
                      locale={picker.locale}
                      testID="plan-end-date"
                      onValueChange={(date) => setEndDate(dateKey(date))}
                    />
                  ) : (
                    <Text
                      textStyle={{ fontSize: 15, color: theme.textSecondary }}
                    >
                      {t("plan.endDateUnlimited")}
                    </Text>
                  )}
                  <Spacer flexible />
                  {/* 结束日期可空：设了要能清掉，否则「长期」这个语义进得去出不来 */}
                  <Text
                    testID={
                      hasEndDate ? "plan-end-date-clear" : "plan-end-date-set"
                    }
                    onPress={toggleEndDate}
                    textStyle={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: theme.primary,
                    }}
                  >
                    {hasEndDate ? t("common.clear") : t("plan.endDateSet")}
                  </Text>
                </Row>
              </Field>
            </FormSection>

            <FormSection title={t("plan.sectionStatus")}>
              <ChipField
                label={t("plan.enableLabel")}
                testID="plan-enabled"
                value={enabled ? "on" : "off"}
                onChange={(value) => {
                  setEnabled(value === "on");
                }}
                options={[
                  { value: "on", label: t("plan.enabledChip") },
                  { value: "off", label: t("plan.disabledChip") },
                ]}
              />
              <HintText text={t("plan.statusHint")} />
            </FormSection>

            {error ? <ErrorText text={error} /> : null}

            <Column spacing={Spacing.three}>
              <Button
                testID="plan-save-button"
                label={t("plan.savePlan")}
                onPress={() => {
                  void save();
                }}
                modifiers={nativeButtonModifiers({ fullWidth: true })}
              />
              <Button
                testID="plan-cancel-button"
                label={t("common.cancel")}
                variant="text"
                onPress={() => {
                  router.back();
                }}
                modifiers={nativeButtonModifiers({ fullWidth: true })}
              />
              {isEditing ? (
                /* 删除是危险操作：不用主题色的 borderedProminent，改纯文字按钮 +
                   危险色文字。文字色必须靠 children 里的 Text 显式给 —— label 的
                   文字色跟按钮样式的 tint 走，压不住。文案在「删除该配置 /
                   再次点击确认删除」之间切换，靠 testID 稳定定位 */
                <Button
                  testID="plan-delete-button"
                  variant="text"
                  onPress={() => {
                    void remove();
                  }}
                  modifiers={nativeButtonModifiers({ fullWidth: true })}
                >
                  <Text
                    textStyle={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: theme.danger,
                      textAlign: "center",
                    }}
                  >
                    {confirmDelete
                      ? t("common.confirmDelete")
                      : t("plan.deleteButtonAlt")}
                  </Text>
                </Button>
              ) : null}
              <Row alignment="center">
                <Spacer flexible />
                <Text
                  textStyle={{
                    fontSize: 12,
                    color: theme.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {t("plan.saveHint")}
                </Text>
                <Spacer flexible />
              </Row>
            </Column>
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}

/**
 * 一味药的剂量输入。
 *
 * 每味药一个 `useNativeState` —— hooks 不能按勾选数量动态调用，所以勾中的每味药
 * 各挂一个本组件（取消勾选即卸载，再勾回来按默认剂量重来）。初值只在挂载时读一次，
 * 之后经 `onChangeText` 同步回父级的 doses 映射：父级才是保存时的唯一数据源
 * （同 medica/form.tsx 给规格预览用的 React 镜像）。
 */
function DoseField({
  medication,
  initial,
  onChange,
}: {
  medication: Medication;
  initial: string;
  onChange: (text: string) => void;
}) {
  const t = useI18n().t;
  const dose = useNativeState(initial);
  return (
    <Field
      label={t("plan.doseForMedication", {
        name: medication.name,
        unit: medicationUnitLabel(medication.unit, t),
      })}
    >
      <InputShell>
        <TextInput
          testID={`plan-dose-input-${medication.id}`}
          placeholder={t("plan.dosePlaceholder")}
          keyboardType="number-pad"
          value={dose}
          onChangeText={onChange}
        />
      </InputShell>
    </Field>
  );
}
