import {
  Button,
  Column,
  FieldGroup,
  Host,
  Icon,
  Picker,
  Row,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";

import {
  nativeButtonModifiers,
  nativeFieldModifiers,
  nativeLayout,
} from "@/components/native-layout";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  addPerson,
  pickAvatarColor,
  useAppData,
  type Gender,
} from "@/lib/store";

/** 逗号 / 顿号 / 分号 / 换行都当分隔符：把一段自由文本切成标签数组 */
function splitTags(raw: string): string[] {
  return raw
    .split(/[,，、;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 添加家庭成员：整屏一个 `@expo/ui` `FieldGroup`（iOS = SwiftUI Form），
 * 只负责「新建」—— 成员列表在「我的」首页的家庭区，这里不重复展示。
 * 第一段「添加成员」收姓名 + 性别 + 年龄，第二段「健康信息」收过敏史 + 基础病，
 * 末段是提交按钮 —— 与同栈的 plan-form 同一套写法。
 *
 * ⚠️ 不要把 `FieldGroup` / `List` 嵌进外层 `ScrollView`：它们在 iOS 上是
 * SwiftUI Form / List，本身就是滚动容器，嵌进去会塌成零高（项目已记录的真机
 * bug）。所以这里让 `FieldGroup` 自己当滚动容器，页面不再套 ScrollView。
 */
export default function PersonsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
  const { reload } = useAppData();
  const [nameError, setNameError] = useState(false);
  // 头像预览用的 React 镜像：useNativeState 在原生端不触发 React 重渲染，
  // 输入实时预览要在 onChangeText 里单独存一份
  const [namePreview, setNamePreview] = useState("");
  // 性别走 React state（Picker 选择的取值），其余输入走 native state
  const [gender, setGender] = useState("");
  const name = useNativeState("");
  const age = useNativeState("");
  const allergies = useNativeState("");
  const conditions = useNativeState("");

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const add = async () => {
    if (!name.value.trim()) {
      setNameError(true);
      return;
    }
    const trimmedAge = age.value.trim();
    const parsedAge = trimmedAge ? Number.parseInt(trimmedAge, 10) : Number.NaN;
    const person = await addPerson({
      name: name.value,
      gender: (gender || undefined) as Gender | undefined,
      age: Number.isFinite(parsedAge) ? parsedAge : undefined,
      allergies: splitTags(allergies.value),
      underlyingConditions: splitTags(conditions.value),
    });
    // 清空表单，方便连续添加
    name.value = "";
    setNamePreview("");
    setGender("");
    age.value = "";
    allergies.value = "";
    conditions.value = "";
    await reload();
    router.push({
      pathname: "/(tabs)/profile/person-detail",
      params: { id: person.id },
    });
  };

  // 预览将要分配的头像底色：与 store.addPerson 同一套按姓名 hash 取色
  const previewColor = pickAvatarColor(namePreview);

  return (
    <>
      <Stack.Title large>{t("person.listTitle")}</Stack.Title>
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <Column
          modifiers={[nativeLayout({ fullWidth: true, fullHeight: true })]}
        >
          <FieldGroup>
            <FieldGroup.Section title={t("person.add")}>
              {/* 姓名：头像预览充当左侧锚点（不是文本标签），右侧输入填满剩余 */}
              <Row alignment="center" spacing={Spacing.three}>
                <NewMemberAvatar
                  color={previewColor}
                  name={namePreview}
                  size={44}
                />
                <TextInput
                  testID="person-name-input"
                  placeholder={t("person.nameInputPlaceholder")}
                  value={name}
                  onChangeText={(text) => {
                    setNamePreview(text);
                    setNameError(false);
                  }}
                  modifiers={[nativeLayout({ unconstrainedWidth: true })]}
                />
              </Row>
              {nameError ? (
                <Text textStyle={{ color: theme.danger }}>
                  {t("person.nameRequired")}
                </Text>
              ) : null}
              <LabeledRow label={t("person.gender")}>
                <Picker<string>
                  testID="person-gender-picker"
                  appearance="menu"
                  selectedValue={gender}
                  onValueChange={(value) => setGender(value)}
                >
                  <Picker.Item label={t("person.genderUnset")} value="" />
                  <Picker.Item label={t("person.genderMale")} value="male" />
                  <Picker.Item
                    label={t("person.genderFemale")}
                    value="female"
                  />
                  <Picker.Item label={t("person.genderOther")} value="other" />
                </Picker>
              </LabeledRow>
              <LabeledRow label={t("person.age")}>
                <TextInput
                  testID="person-age-input"
                  placeholder={t("person.agePlaceholder")}
                  keyboardType="number-pad"
                  value={age}
                  modifiers={[nativeLayout({ unconstrainedWidth: true })]}
                />
              </LabeledRow>
            </FieldGroup.Section>

            <FieldGroup.Section title={t("person.healthInfo")}>
              <LabeledRow label={t("person.allergies")}>
                <TextInput
                  testID="person-allergies-input"
                  placeholder={t("person.allergiesPlaceholder")}
                  value={allergies}
                  modifiers={[nativeLayout({ unconstrainedWidth: true })]}
                />
              </LabeledRow>
              <LabeledRow label={t("person.underlyingConditions")}>
                <TextInput
                  testID="person-conditions-input"
                  placeholder={t("person.conditionsPlaceholder")}
                  value={conditions}
                  modifiers={[nativeLayout({ unconstrainedWidth: true })]}
                />
              </LabeledRow>
            </FieldGroup.Section>

            <FieldGroup.Section
              modifiers={nativeFieldModifiers({ flush: true })}
            >
              <Button
                testID="person-add-button"
                label={t("person.addMemberButton")}
                onPress={() => {
                  add();
                }}
                modifiers={nativeButtonModifiers({ style: "glassProminent" })}
              >
                <Row modifiers={[nativeLayout({ fullWidth: true })]}>
                  <Spacer />
                  <Text>{t("person.addMemberButton")}</Text>
                  <Spacer />
                </Row>
              </Button>
            </FieldGroup.Section>
          </FieldGroup>
        </Column>
      </Host>
    </>
  );
}

/**
 * 一行「左标签 + 右控件」：标签靠左，右侧控件紧随其后（文本输入用
 * `unconstrainedWidth` 从标签后起填满剩余），**不把控件推到行尾右对齐**。
 */
function LabeledRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Row alignment="center" spacing={Spacing.three}>
      <Text textStyle={{ color: theme.text }}>{label}</Text>
      {children}
    </Row>
  );
}

/** 添加行里的头像预览：没输入时是图标占位，输入后显示姓名首字 + 按姓名 hash 的头像底色 */
function NewMemberAvatar({
  color,
  name,
  size,
}: {
  color: string;
  name: string;
  size: number;
}) {
  const theme = useTheme();
  const initial = name.trim().slice(0, 1);
  return (
    <Row
      alignment="center"
      style={{
        width: size,
        height: size,
        borderRadius: Radius.pill,
        backgroundColor: initial ? color : theme.primarySoft,
        borderWidth: initial ? 0 : 1,
        borderColor: theme.border,
      }}
    >
      {/* Row 只把内容压到纵轴中线，横轴中线靠这层 Column（同 RoundIconButton） */}
      <Column alignment="center" style={{ width: size }}>
        {initial ? (
          <Text
            textStyle={{
              fontSize: size * 0.44,
              fontWeight: "700",
              color: theme.onPrimary,
              textAlign: "center",
            }}
          >
            {initial}
          </Text>
        ) : (
          <Icon name="person" size={size * 0.5} color={theme.primary} />
        )}
      </Column>
    </Row>
  );
}
