import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { TextInput } from "react-native";
import { Button, Text, View, XStack, YStack } from "tamagui";

import { AvatarMark } from "@/components/avatar";
import {
  ChipField,
  ErrorText,
  Field,
  FormSection,
  HintText,
  Subtitle,
} from "@/components/rn-form";
import { InputShell } from "@/components/rn-input-shell";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  addPerson,
  pickAvatarColor,
  updatePerson,
  usePerson,
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
 * 用药人表单：新建（从「我的」的家庭区块进入）与编辑基本信息（从用药人详情进入）
 * 同一个屏，路由参数 `id` 区分 —— 与 plan-form / medica-form 的「新建/编辑同屏」
 * 同一套模式。编辑覆盖全部家庭成员与默认用户「自己」（改名也走这里）。
 *
 * 排版与添加药品共用 rn-form 基元：ScrollView + 分区卡片（label 在上、控件收在
 * 圆角描边盒子里）。容器与按钮走 Tamagui 原语 + token 名，
 * `TextInput` 仍是 RN 的（不吃 token 名，文字色继续走 `useTheme()`）。
 */
export default function PersonsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
  const params = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(params.id);
  const { data: editingPerson, loading: personLoading } = usePerson(params.id);
  const loading = isEditing && personLoading;
  const [nameError, setNameError] = useState(false);
  const [ageError, setAgeError] = useState(false);
  const [namePreview, setNamePreview] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [photoTouched, setPhotoTouched] = useState(false);
  const [photoDenied, setPhotoDenied] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [allergies, setAllergies] = useState("");
  const [conditions, setConditions] = useState("");

  const filledRef = useRef(false);
  useEffect(() => {
    if (filledRef.current || !isEditing || loading || !editingPerson) return;
    filledRef.current = true;
    setName(editingPerson.name);
    setNamePreview(editingPerson.name);
    setGender(editingPerson.gender ?? "");
    setPhotoUri(editingPerson.avatarUri);
    if (editingPerson.age != null) setAge(String(editingPerson.age));
    setAllergies(editingPerson.allergies.join("、"));
    setConditions(editingPerson.underlyingConditions.join("、"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, loading, editingPerson]);

  const choosePhoto = async () => {
    let result: Awaited<
      ReturnType<typeof import("@/lib/avatar-photo").pickAvatarPhoto>
    >;
    try {
      const { pickAvatarPhoto } = await import("@/lib/avatar-photo");
      result = await pickAvatarPhoto();
    } catch {
      setPhotoFailed(true);
      return;
    }
    if (result.status === "cancelled") return;
    if (result.status === "denied") {
      setPhotoDenied(true);
      return;
    }
    setPhotoDenied(false);
    setPhotoFailed(false);
    setPhotoUri(result.uri);
    setPhotoTouched(true);
  };

  const save = async () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    const parsedAge = parseAge(age);
    if (parsedAge === null) {
      setAgeError(true);
      return;
    }
    const values = {
      name,
      gender: gender || undefined,
      age: parsedAge,
      allergies: splitTags(allergies),
      underlyingConditions: splitTags(conditions),
    };
    if (isEditing && params.id) {
      await updatePerson(params.id, {
        ...values,
        ...(photoTouched ? { avatarUri: photoUri ?? null } : {}),
      });
      if (photoTouched && editingPerson?.avatarUri) {
        try {
          const { deleteAvatarPhoto } = await import("@/lib/avatar-photo");
          await deleteAvatarPhoto(editingPerson.avatarUri);
        } catch {
          // 删不掉旧文件不该让保存失败：库里已经指向新图了
        }
      }
      router.back();
      return;
    }
    const person = await addPerson({ ...values, avatarUri: photoUri });
    setName("");
    setNamePreview("");
    setGender("");
    setPhotoUri(undefined);
    setPhotoTouched(false);
    setAge("");
    setAllergies("");
    setConditions("");
    router.push({
      pathname: "/(tabs)/profile/person-detail",
      params: { id: person.id },
    });
  };

  // 预览将要分配的头像底色：与 store.addPerson 同一套按姓名 hash 取色
  const previewColor = pickAvatarColor(namePreview);

  if (loading) {
    return (
      <View flex={1} backgroundColor="$canvas">
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>
          {isEditing ? t("person.editTitle") : t("person.addMember")}
        </Stack.Title>
      </View>
    );
  }

  if (isEditing && !editingPerson) {
    return (
      <View flex={1} backgroundColor="$canvas">
        <Stack.Screen.BackButton displayMode="minimal" />
        <Stack.Title large>
          {isEditing ? t("person.editTitle") : t("person.addMember")}
        </Stack.Title>
        <View
          flex={1}
          alignItems="center"
          justifyContent="center"
          paddingTop={120}
        >
          <Text color="$textSecondary" fontSize={15}>
            {t("person.notFound")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>
        {isEditing ? t("person.editTitle") : t("person.addMember")}
      </Stack.Title>

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <YStack gap="four">
          <Subtitle
            text={t(isEditing ? "person.editSubtitle" : "person.formSubtitle")}
          />

          <FormSection title={t("person.basicInfo")}>
            <Field label={t("person.name")}>
              <InputShell>
                <TextInput
                  testID="person-name-input"
                  placeholder={t("person.nameInputPlaceholder")}
                  autoFocus
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    setNamePreview(text);
                    setNameError(false);
                  }}
                  style={{ fontSize: 17, color: theme.text, padding: 0 }}
                />
              </InputShell>
            </Field>
            {nameError ? <ErrorText text={t("person.nameRequired")} /> : null}

            <Field label={t("person.avatar")}>
              <XStack alignItems="center" gap="rowGap">
                <AvatarMark
                  color={previewColor}
                  name={namePreview || t("person.defaultName")}
                  uri={photoUri}
                  size={48}
                />
                <YStack gap="two">
                  <Button
                    testID="person-avatar-picker-button"
                    onPress={() => {
                      void choosePhoto();
                    }}
                    size={false}
                    backgroundColor="$surface press:$backgroundSelected"
                    borderWidth={1}
                    borderColor="$border"
                    borderRadius="card"
                    borderCurve="continuous"
                    paddingInline="three"
                    paddingBlock="two"
                    minHeight={44}
                    color="$text"
                    fontSize={15}
                    fontWeight="600"
                  >
                    {photoUri
                      ? t("person.avatarChange")
                      : t("person.avatarChoose")}
                  </Button>
                  {photoUri ? (
                    <Button
                      testID="person-avatar-remove-button"
                      onPress={() => {
                        setPhotoUri(undefined);
                        setPhotoTouched(true);
                      }}
                      size={false}
                      alignSelf="stretch"
                      padding={0}
                      borderWidth={0}
                      backgroundColor="transparent"
                      color="$danger"
                      fontSize={14}
                      fontWeight="600"
                    >
                      {t("person.avatarRemove")}
                    </Button>
                  ) : null}
                </YStack>
              </XStack>
            </Field>
            {photoDenied ? (
              <ErrorText text={t("person.avatarPermission")} />
            ) : photoFailed ? (
              <ErrorText text={t("person.avatarFailed")} />
            ) : (
              <HintText text={t("person.avatarHint")} />
            )}

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
                  onChangeText={(text) => {
                    setAge(text);
                    setAgeError(false);
                  }}
                  style={{ fontSize: 15, color: theme.text, padding: 0 }}
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
                  onChangeText={setAllergies}
                  style={{ fontSize: 15, color: theme.text, padding: 0 }}
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
                  onChangeText={setConditions}
                  style={{ fontSize: 15, color: theme.text, padding: 0 }}
                />
              </InputShell>
            </Field>
            <HintText text={t("person.multiValueHint")} />
          </FormSection>

          <Button
            testID={isEditing ? "person-save-button" : "person-add-button"}
            onPress={() => {
              void save();
            }}
            size={false}
            borderWidth={0}
            backgroundColor="$primary press:$primarySoft"
            color="$onPrimary"
            borderRadius="card"
            borderCurve="continuous"
            paddingBlock="three"
            minHeight={44}
            fontSize={15}
            fontWeight="600"
          >
            {isEditing ? t("person.saveButton") : t("person.addMemberButton")}
          </Button>
        </YStack>
      </ScreenScaffold>
    </>
  );
}
