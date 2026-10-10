import { Button, Column, Host, Row, ScrollView, Spacer, Text } from "@expo/ui";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";

import { MemberAvatar } from "@/components/avatar";
import { FormSection } from "@/components/form";
import {
  nativeButtonModifiers,
  nativeLayout,
} from "@/components/native-layout";
import { HairLine } from "@/components/section-card";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  deletePerson,
  medicationUnitLabel,
  planStatusLabel,
  useAppData,
  type Medication,
  type MedicationPlan,
} from "@/lib/store";

/**
 * 用药人详情：头像 → 基本信息 → 用药配置 → 操作。
 *
 * 分区外壳用表单那一套（`FormSection`：绿条标题 + 描边白卡，与添加成员一致），
 * 卡片里面是设置页的行式排版（design/settings.html 的 `.setting-item`）：标签在
 * 左、值在右、行间发线。两个都不做的中间态都试过，很难看：
 *   - 「标签在上 + 输入盒」：盒子是输入控件，只读值套一圈又重又空；
 *   - 「标签在上 + 裸文本」：宽卡片里每行各自抱内容宽，左右边缘全是锯齿。
 * 行式排版把整行撑满，标签列与值列各自对齐，长值（过敏原列表）允许压缩折行。
 *
 * ⚠️ 不要再把 `FieldGroup` / `List` 嵌进外层 `ScrollView`：它们在 iOS 上是
 * SwiftUI Form / List，本身就是滚动容器，嵌进去会塌成零高（项目已记录的
 * 真机 bug）。
 */
export default function PersonDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { persons, medications, plans, loading, reload } = useAppData();
  const [confirmDeletePerson, setConfirmDeletePerson] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reload();
      setConfirmDeletePerson(false);
    }, [reload]),
  );

  // 首屏还在读 SQLite：persons 是空的，直接渲染会闪一下「用药人不存在」
  if (loading) {
    return (
      <>
        <Stack.Screen.BackButton displayMode="minimal">
          {t("person.listTitle")}
        </Stack.Screen.BackButton>
        <Host style={{ flex: 1 }} />
      </>
    );
  }

  const person = persons.find((p) => p.id === id);

  if (!person) {
    return (
      <>
        <Stack.Screen.BackButton displayMode="minimal">
          {t("person.listTitle")}
        </Stack.Screen.BackButton>
        <Host style={{ flex: 1 }}>
          {/* 同药品详情页：HStack + 弹性 Spacer 才能把文案压到中线，
              VStack 的 alignment="center" 只在自己那个内容宽的盒子里自居中 */}
          <Row alignment="center" style={{ paddingTop: 120 }}>
            <Spacer flexible />
            <Text textStyle={{ color: theme.textSecondary }}>
              {t("person.notFound")}
            </Text>
            <Spacer flexible />
          </Row>
        </Host>
      </>
    );
  }

  const personPlans = plans.filter((p) => p.personId === person.id);

  // 基本信息行：只列已填写的项，未填项不占位（性别/年龄/过敏/基础病都可选）
  const basicRows: { label: string; value: string }[] = [];
  if (person.gender) {
    const value =
      person.gender === "male"
        ? t("person.genderMale")
        : person.gender === "female"
          ? t("person.genderFemale")
          : t("person.genderOther");
    basicRows.push({ label: t("person.gender"), value });
  }
  if (person.age != null) {
    basicRows.push({ label: t("person.age"), value: String(person.age) });
  }
  if (person.allergies.length > 0) {
    basicRows.push({
      label: t("person.allergies"),
      value: person.allergies.join("、"),
    });
  }
  if (person.underlyingConditions.length > 0) {
    basicRows.push({
      label: t("person.underlyingConditions"),
      value: person.underlyingConditions.join("、"),
    });
  }

  const removePerson = async () => {
    if (!confirmDeletePerson) {
      setConfirmDeletePerson(true);
      return;
    }
    await deletePerson(person.id);
    router.back();
  };

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal">
        {/* 返回键文案显式钉成「家庭成员」：persons 屏的标题是「添加家庭成员」，
            不钉的话返回键会跟着变成它（Maestro 也按这个文案点返回） */}
        {t("person.listTitle")}
      </Stack.Screen.BackButton>
      <Stack.Title large>{person.name}</Stack.Title>
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        {/* 排版与添加成员（persons.tsx）同一套：画布底 + 屏幕边距 + 分区卡片 */}
        <ScrollView
          showsIndicators={false}
          style={{ backgroundColor: theme.canvas }}
        >
          <Column
            spacing={Spacing.four}
            style={{
              paddingHorizontal: Spacing.screen,
              paddingTop: Spacing.three,
              // 详情页在 (tabs) 组内，尾部必须让开原生 tab 栏，
              // 否则「删除用药人」会被压在 tab 栏底下点不到
              paddingBottom: BottomTabInset + Spacing.four,
            }}
          >
            {/* 头像居中不能靠 Column 的 alignment：收缩成内容宽后会贴左，
                左右各一个弹性 Spacer 才能压到中线。
                用 MemberAvatar（纯 universal 组件）而不是 Avatar（RNHostView）——
                iOS 不转发 RNHostView 的 style，没有死尺寸的头像插在弹性 Spacer
                里会把外层 Column 的理想宽度带崩，整页卡片被顶出屏外 */}
            <Row alignment="center" style={{ paddingVertical: Spacing.two }}>
              <Spacer flexible />
              <MemberAvatar
                color={person.avatarColor}
                name={person.name}
                size={64}
              />
              <Spacer flexible />
            </Row>

            {basicRows.length > 0 ? (
              <FormSection title={t("person.basicInfo")}>
                {/* 行与行之间只隔发线：再套一层无间距的 Column，FormSection
                    默认的 16pt 字段间距会让发线悬在空隙中间 */}
                <Column>
                  {basicRows.map((row, index) => (
                    <Column key={row.label}>
                      {index > 0 ? <HairLine /> : null}
                      {/* 标签在左、值在右（design/settings.html 的
                          .setting-item）。标签用次级色、值用粗体深色 ——
                          值才是信息（对什么过敏、有什么基础病），标签只是语境 */}
                      <Row
                        alignment="center"
                        style={{
                          paddingHorizontal: Spacing.three,
                          paddingVertical: Spacing.rowGap,
                        }}
                      >
                        <Text
                          textStyle={{
                            fontSize: 15,
                            color: theme.textSecondary,
                          }}
                        >
                          {row.label}
                        </Text>
                        <Spacer flexible />
                        {/* 值列允许压缩折行：长过敏原列表会把整行撑爆，
                            让标签列先让位（同药品详情页的 InfoRow） */}
                        <Column
                          modifiers={[
                            nativeLayout({ unconstrainedWidth: true }),
                          ]}
                        >
                          <Text
                            numberOfLines={2}
                            textStyle={{
                              fontSize: 15,
                              fontWeight: "600",
                              color: theme.text,
                              textAlign: "right",
                            }}
                          >
                            {row.value}
                          </Text>
                        </Column>
                      </Row>
                    </Column>
                  ))}
                </Column>
              </FormSection>
            ) : null}

            <FormSection title={t("person.plans")}>
              {personPlans.length === 0 ? (
                /* 空态：Row + 左右弹性 Spacer 把文案压到中线（同药品库空态） */
                <Row alignment="center">
                  <Spacer flexible />
                  <Text
                    textStyle={{
                      fontSize: 13,
                      color: theme.textSecondary,
                      textAlign: "center",
                    }}
                  >
                    {t("plan.emptyAddHint")}
                  </Text>
                  <Spacer flexible />
                </Row>
              ) : (
                <Column>
                  {personPlans.map((plan, index) => {
                    const medication = medications.find(
                      (m) => m.id === plan.medicationId,
                    );
                    return (
                      <Column key={plan.id}>
                        {index > 0 ? <HairLine /> : null}
                        <PlanEntry plan={plan} medication={medication} />
                      </Column>
                    );
                  })}
                </Column>
              )}
            </FormSection>

            <Column spacing={Spacing.three}>
              <Button
                testID="plan-add-button"
                label={t("plan.formTitle")}
                onPress={() => {
                  router.push({
                    pathname: "/(tabs)/profile/plan-form",
                    params: { personId: person.id },
                  });
                }}
                modifiers={nativeButtonModifiers({ fullWidth: true })}
              />
              {/* 删除是危险操作：不用主题色的 borderedProminent（填充/描边都会
                  带主色），改纯文字按钮 + 危险色文字。文字色必须靠 children 里的
                  Text 显式给 —— label 的文字色跟按钮样式的 tint 走，压不住 */}
              <Button
                testID="person-delete-button"
                variant="text"
                onPress={() => {
                  removePerson();
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
                  {confirmDeletePerson
                    ? t("common.confirmDelete")
                    : t("person.deleteButtonAlt")}
                </Text>
              </Button>
            </Column>
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}

/**
 * 用药配置条目：药名与状态打头（同在一条行式排版的首行），剂量 / 服用时间 /
 * 起止日期各一行，条目间发线分隔，整条可点进编辑。
 *
 * 条目列要显式撑满（`fullWidth`）：VStack 按内容收缩，首行的行尾状态要靠弹性
 * Spacer 推到右边，父列不撑满时间隙就是 0。药品由父组件查找后传入：删药会
 * 级联删配置，取不到只可能是数据异常，留兜底文案。
 */
function PlanEntry({
  plan,
  medication,
}: {
  plan: MedicationPlan;
  medication?: Medication;
}) {
  const theme = useTheme();
  const t = useTranslation();
  const router = useRouter();

  const unit = medication ? medicationUnitLabel(medication.unit, t) : "";

  return (
    <Column
      testID={`plan-item-${plan.id}`}
      onPress={() => {
        router.push({
          pathname: "/(tabs)/profile/plan-form",
          params: { id: plan.id },
        });
      }}
      spacing={Spacing.one}
      style={{ paddingVertical: Spacing.two }}
      modifiers={[nativeLayout({ fullWidth: true })]}
    >
      <Row alignment="center" spacing={Spacing.two}>
        <Text
          numberOfLines={1}
          textStyle={{ fontSize: 15, fontWeight: "600", color: theme.text }}
        >
          {medication?.name ?? t("home.unknownMedication")}
        </Text>
        <Spacer flexible />
        <Text
          numberOfLines={1}
          textStyle={{ fontSize: 13, color: theme.textSecondary }}
        >
          {planStatusLabel(plan, t)}
        </Text>
      </Row>
      <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>
        {t("medication.doseLine", { amount: plan.doseAmount, unit })}
      </Text>
      <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>
        {t("person.timesLine", {
          count: plan.times.length,
          times: plan.times.join(" / "),
        })}
      </Text>
      <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>
        {[
          t("person.startFrom", { start: plan.startDate }),
          plan.endDate
            ? t("person.rangeTo", { end: plan.endDate })
            : t("person.rangeOngoing"),
        ].join("")}
      </Text>
    </Column>
  );
}
