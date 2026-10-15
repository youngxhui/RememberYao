import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { AvatarMark } from "@/components/avatar";
import { GlassHostButton } from "@/components/expo-ui-island";
import { FormSection } from "@/components/rn-form";
import { HairLine } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { BottomTabInset, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  deletePerson,
  medicationUnitLabel,
  planStatusLabel,
  SELF_PERSON_ID,
  useMedications,
  usePerson,
  usePlansForPerson,
  type Medication,
  type MedicationPlan,
} from "@/lib/store";

/**
 * 用药人详情：头像 → 基本信息 → 用药配置 → 操作。
 *
 * 分区外壳与添加成员（persons.tsx）同一套 rn-form 基元，卡片里面是设置页的
 * 行式排版（design/settings.html 的 `.setting-item`）：标签在左、值在右、
 * 行间发线。两个都不做的中间态都试过，很难看：
 *   - 「标签在上 + 输入盒」：盒子是输入控件，只读值套一圈又重又空；
 *   - 「标签在上 + 裸文本」：宽卡片里每行各自抱内容宽，左右边缘全是锯齿。
 * 行式排版把整行撑满，标签列与值列各自对齐，长值（过敏原列表）允许压缩折行。
 */
export default function PersonDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  // 按需读取：这一屏只要这位用药人、他的配置，以及配置行里要显示的药名
  const {
    data: person,
    loading: personLoading,
    reload: reloadPerson,
  } = usePerson(id);
  const {
    data: plans,
    loading: plansLoading,
    reload: reloadPlans,
  } = usePlansForPerson(id);
  const {
    data: medications,
    loading: medicationsLoading,
    reload: reloadMedications,
  } = useMedications();
  const loading = personLoading || plansLoading || medicationsLoading;
  const reload = useCallback(() => {
    reloadPerson();
    reloadPlans();
    reloadMedications();
  }, [reloadPerson, reloadPlans, reloadMedications]);
  // 「自己」是 App 的默认用户（账号本体），不是家庭成员，不能删；
  // 家庭成员则随便删 —— 删光了也只是家庭区块回到空态，「自己」还在
  const isSelf = person?.id === SELF_PERSON_ID;
  const [confirmDeletePerson, setConfirmDeletePerson] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reload();
      setConfirmDeletePerson(false);
    }, [reload]),
  );

  // 首屏还在读 SQLite：直接渲染会闪一下「用药人不存在」
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas }}>
        <Stack.Screen.BackButton displayMode="minimal">
          {t("person.listTitle")}
        </Stack.Screen.BackButton>
        <Stack.Title large>{t("person.listTitle")}</Stack.Title>
      </View>
    );
  }

  if (!person) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.canvas }}>
        <Stack.Screen.BackButton displayMode="minimal">
          {t("person.listTitle")}
        </Stack.Screen.BackButton>
        <Stack.Title large>{t("person.listTitle")}</Stack.Title>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 120,
          }}
        >
          <Text style={{ color: theme.textSecondary }}>
            {t("person.notFound")}
          </Text>
        </View>
      </View>
    );
  }

  const personPlans = plans;

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

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <View style={{ gap: Spacing.four }}>
          {/* 没照片时退回「底色 + 姓名首字」（AvatarMark 内部处理），
              有照片时直接渲染本地文件 URI */}
          <View style={{ alignItems: "center", paddingVertical: Spacing.two }}>
            <AvatarMark
              color={person.avatarColor}
              name={person.name}
              uri={person.avatarUri}
              size={64}
            />
          </View>

          {basicRows.length > 0 ? (
            <FormSection title={t("person.basicInfo")}>
              {basicRows.map((row, index) => (
                <View key={row.label}>
                  {index > 0 ? <HairLine /> : null}
                  <BasicRow label={row.label} value={row.value} />
                </View>
              ))}
            </FormSection>
          ) : null}

          <FormSection title={t("person.plans")}>
            {personPlans.length === 0 ? (
              <View
                style={{ alignItems: "center", paddingVertical: Spacing.three }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {t("plan.emptyAddHint")}
                </Text>
              </View>
            ) : (
              <View>
                {personPlans.map((plan, index) => {
                  const medication = medications.find(
                    (m) => m.id === plan.medicationId,
                  );
                  return (
                    <View key={plan.id}>
                      {index > 0 ? <HairLine /> : null}
                      <PlanEntry plan={plan} medication={medication} />
                    </View>
                  );
                })}
              </View>
            )}
          </FormSection>

          <View style={{ gap: Spacing.three }}>
            <GlassHostButton
              testID="plan-add-button"
              label={t("plan.formTitle")}
              onPress={() => {
                router.push({
                  pathname: "/(tabs)/profile/plan-form",
                  params: { personId: person.id },
                });
              }}
            />
            {/* 改名 / 补基本信息：编辑屏与添加成员同一个表单（persons.tsx，
                id 参数区分新建与编辑）。默认用户「自己」也走这里 */}
            <Pressable
              testID="person-edit-button"
              onPress={() => {
                router.push({
                  pathname: "/(tabs)/profile/persons",
                  params: { id: person.id },
                });
              }}
              style={({ pressed }) => ({
                backgroundColor: pressed
                  ? theme.backgroundSelected
                  : theme.surface,
                borderRadius: Radius.card,
                borderCurve: "continuous",
                borderWidth: 1,
                borderColor: theme.border,
                paddingVertical: Spacing.three,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
              })}
            >
              <Text
                style={{
                  color: theme.text,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {t("person.editButton")}
              </Text>
            </Pressable>
            {/* 删除是危险操作：不用主题色填充/描边，改纯文字按钮 + 危险色文字。
                「自己」是 App 的默认用户，不是家庭成员，不给删 */}
            {isSelf ? (
              <Text
                style={{
                  fontSize: 13,
                  color: theme.textSecondary,
                  textAlign: "center",
                }}
              >
                {t("person.selfLockedHint")}
              </Text>
            ) : (
              <Pressable
                testID="person-delete-button"
                onPress={() => {
                  removePerson();
                }}
                style={({ pressed }) => ({
                  paddingVertical: Spacing.three,
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 44,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text
                  style={{
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
              </Pressable>
            )}
          </View>
        </View>
      </ScreenScaffold>
    </>
  );
}

/**
 * 基本信息行：标签在左（次级色）、值在右（粗体深色）—— 值才是信息
 * （对什么过敏、有什么基础病），标签只是语境。值列允许压缩折行：长过敏原
 * 列表会把整行撑爆，让标签列先让位。
 */
function BasicRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.rowGap,
      }}
    >
      <Text style={{ fontSize: 15, color: theme.textSecondary }}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text
        numberOfLines={2}
        style={{
          fontSize: 15,
          fontWeight: "600",
          color: theme.text,
          textAlign: "right",
          flexShrink: 1,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * 用药配置条目：药名与状态打头（同在一条行式排版的首行），剂量 / 服用时间 /
 * 起止日期各一行，条目间发线分隔，整条可点进编辑。
 *
 * 药品由父组件查找后传入：删药会级联删配置，取不到只可能是数据异常，
 * 留兜底文案。
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
    <Pressable
      testID={`plan-item-${plan.id}`}
      onPress={() => {
        router.push({
          pathname: "/(tabs)/profile/plan-form",
          params: { id: plan.id },
        });
      }}
      style={({ pressed }) => ({
        gap: Spacing.one,
        paddingVertical: Spacing.two,
        backgroundColor: pressed ? theme.backgroundSelected : "transparent",
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.two,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontSize: 15,
            fontWeight: "600",
            color: theme.text,
            flexShrink: 1,
          }}
        >
          {medication?.name ?? t("home.unknownMedication")}
        </Text>
        <View style={{ flex: 1 }} />
        <Text
          numberOfLines={1}
          style={{ fontSize: 13, color: theme.textSecondary }}
        >
          {planStatusLabel(plan, t)}
        </Text>
      </View>
      <Text style={{ fontSize: 13, color: theme.textSecondary }}>
        {t("medication.doseLine", { amount: plan.doseAmount, unit })}
      </Text>
      <Text style={{ fontSize: 13, color: theme.textSecondary }}>
        {t("person.timesLine", {
          count: plan.times.length,
          times: plan.times.join(" / "),
        })}
      </Text>
      <Text style={{ fontSize: 13, color: theme.textSecondary }}>
        {[
          t("person.startFrom", { start: plan.startDate }),
          plan.endDate
            ? t("person.rangeTo", { end: plan.endDate })
            : t("person.rangeOngoing"),
        ].join("")}
      </Text>
    </Pressable>
  );
}
