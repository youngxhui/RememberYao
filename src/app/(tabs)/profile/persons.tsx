import {
  Button,
  Column,
  Host,
  ScrollView,
  TextInput,
  useNativeState,
} from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

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
import {
  nativeButtonModifiers,
  nativeLayout,
} from "@/components/native-layout";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  addPerson,
  pickAvatarColor,
  useAppData,
  type Gender,
} from "@/lib/store";

/** 年龄的合理区间：超出按填错处理，不进库（老人 100+ 也放得过，误敲的 0/999 拦掉） */
const AGE_MIN = 1;
const AGE_MAX = 150;

/** 逗号 / 顿号 / 分号 / 换行都当分隔符：把一段自由文本切成标签数组 */
function splitTags(raw: string): string[] {
  return raw
    .split(/[,，、;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 年龄选填：空 → `undefined`（不填），非 1~150 的整数 → `null`（填错，要报错）。
 * 拆成三态而不是「解析不了就丢」—— 静默丢弃会让用户以为填上了，详情页却不显示。
 */
function parseAge(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < AGE_MIN || parsed > AGE_MAX) {
    return null;
  }
  return parsed;
}

/**
 * 添加家庭成员：只负责「新建」—— 成员列表在「我的」首页的家庭区，这里不重复展示。
 *
 * 排版与添加药品（`src/app/(tabs)/medica/form.tsx`）共用 `@/components/form` 的
 * 基元：`ScrollView` + 分区卡片（label 在上、控件收在圆角描边盒子里）。原来这里
 * 用的是原生 `FieldGroup`（iOS = SwiftUI Form），满屏「左标签 + 整行分隔」的设置
 * 风，和自家表单对不上；且 `Picker` 性别要从菜单里选两步，三个取值直接铺 chip。
 *
 * ⚠️ 不要再把 `FieldGroup` / `List` 嵌进外层 `ScrollView`：它们在 iOS 上是
 * SwiftUI Form / List，本身就是滚动容器，嵌进去会塌成零高（项目已记录的真机
 * bug）。
 */
export default function PersonsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
  const { reload } = useAppData();
  const [nameError, setNameError] = useState(false);
  const [ageError, setAgeError] = useState(false);
  // 头像预览用的 React 镜像：useNativeState 在原生端不触发 React 重渲染，
  // 输入实时预览要在 onChangeText 里单独存一份
  const [namePreview, setNamePreview] = useState("");
  // 性别走 React state（chip 选择的取值），其余输入走 native state
  const [gender, setGender] = useState<Gender | "">("");
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
    const parsedAge = parseAge(age.value);
    if (parsedAge === null) {
      setAgeError(true);
      return;
    }
    const person = await addPerson({
      name: name.value,
      gender: gender || undefined,
      age: parsedAge,
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
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>{t("person.addMember")}</Stack.Title>
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
              // 否则「添加家庭成员」会被压在 tab 栏底下点不到
              paddingBottom: BottomTabInset + Spacing.four,
            }}
          >
            <Subtitle text={t("person.formSubtitle")} />

            <FormSection title={t("person.basicInfo")}>
              {/* 姓名是这一页的主字段：头像预览充当左侧锚点（不是文本标签），
                  右侧输入填满剩余 */}
              <Field label={t("person.name")}>
                <InputShell spacing={Spacing.rowGap}>
                  <MemberAvatar
                    color={previewColor}
                    name={namePreview}
                    size={36}
                  />
                  <TextInput
                    testID="person-name-input"
                    placeholder={t("person.nameInputPlaceholder")}
                    autoFocus
                    value={name}
                    onChangeText={(text) => {
                      setNamePreview(text);
                      setNameError(false);
                    }}
                    modifiers={[nativeLayout({ unconstrainedWidth: true })]}
                  />
                </InputShell>
              </Field>
              {nameError ? <ErrorText text={t("person.nameRequired")} /> : null}

              <ChipField
                label={t("person.gender")}
                testID="person-gender"
                value={gender}
                onChange={(value) => {
                  setGender(value as Gender);
                }}
                options={[
                  { value: "male", label: t("person.genderMale") },
                  { value: "female", label: t("person.genderFemale") },
                  { value: "other", label: t("person.genderOther") },
                ]}
              />

              <Field label={t("person.age")}>
                <InputShell>
                  <TextInput
                    testID="person-age-input"
                    placeholder={t("person.agePlaceholder")}
                    keyboardType="number-pad"
                    value={age}
                    onChangeText={() => {
                      setAgeError(false);
                    }}
                    modifiers={[nativeLayout({ unconstrainedWidth: true })]}
                  />
                </InputShell>
              </Field>
              {ageError ? <ErrorText text={t("person.ageInvalid")} /> : null}

              <HintText text={t("person.optionalHint")} />
            </FormSection>

            <FormSection title={t("person.healthInfo")}>
              <Field label={t("person.allergies")}>
                <InputShell>
                  <TextInput
                    testID="person-allergies-input"
                    placeholder={t("person.allergiesPlaceholder")}
                    multiline
                    numberOfLines={2}
                    value={allergies}
                    modifiers={[nativeLayout({ unconstrainedWidth: true })]}
                  />
                </InputShell>
              </Field>
              <Field label={t("person.underlyingConditions")}>
                <InputShell>
                  <TextInput
                    testID="person-conditions-input"
                    placeholder={t("person.conditionsPlaceholder")}
                    multiline
                    numberOfLines={2}
                    value={conditions}
                    modifiers={[nativeLayout({ unconstrainedWidth: true })]}
                  />
                </InputShell>
              </Field>
              <HintText text={t("person.multiValueHint")} />
            </FormSection>

            <Button
              testID="person-add-button"
              label={t("person.addMemberButton")}
              onPress={() => {
                void add();
              }}
              modifiers={nativeButtonModifiers({ fullWidth: true })}
            />
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}
