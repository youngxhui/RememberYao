import {
  Button,
  Column,
  FieldGroup,
  Host,
  Picker,
  Row,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from "@expo/ui";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import {
  nativeButtonModifiers,
  nativeFieldModifiers,
  nativeLayout,
} from "@/components/native-layout";
import { useTranslation } from "@/i18n";
import {
  DEFAULT_MEDICATION_CATEGORY,
  MEDICATION_CATEGORIES,
  MEDICATION_TYPES,
  MEDICATION_UNITS,
  addMedication,
  medicationCategoryLabel,
  medicationTypeLabel,
  medicationUnitLabel,
  updateMedication,
  useAppData,
  type MedicationCategory,
  type MedicationType,
  type MedicationUnit,
} from "@/lib/store";

export default function MedicationFormScreen() {
  const router = useRouter();
  const t = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const { medications, loading } = useAppData();

  const [loaded, setLoaded] = useState(!isEditing);
  const [type, setType] = useState<MedicationType>("bottle");
  const [category, setCategory] = useState<MedicationCategory>(
    DEFAULT_MEDICATION_CATEGORY,
  );
  const [unit, setUnit] = useState<MedicationUnit>("tablet");
  const [nameError, setNameError] = useState(false);
  const [quantityError, setQuantityError] = useState(false);

  const name = useNativeState("");
  const totalQuantity = useNativeState("");
  const remainingQuantity = useNativeState("");
  const notes = useNativeState("");

  // 编辑模式下只填充一次：等数据加载完再填，避免把用户已输入的内容覆盖掉
  const filledRef = useRef(false);
  useEffect(() => {
    if (!id) return;
    if (filledRef.current || loading) return;
    filledRef.current = true;
    const existing = medications.find((m) => m.id === id);
    if (existing) {
      name.value = existing.name;
      setType(existing.type);
      setCategory(existing.category);
      setUnit(existing.unit);
      totalQuantity.value = String(existing.totalQuantity);
      remainingQuantity.value = String(existing.remainingQuantity);
      notes.value = existing.notes;
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, medications, loading]);

  const save = async () => {
    if (!name.value.trim()) {
      setNameError(true);
      return;
    }
    const total = Number.parseInt(totalQuantity.value, 10);
    if (!Number.isFinite(total) || total < 0) {
      setQuantityError(true);
      return;
    }
    const remainingRaw = Number.parseInt(remainingQuantity.value, 10);
    const remaining = Number.isFinite(remainingRaw)
      ? Math.min(Math.max(remainingRaw, 0), total)
      : total;

    const input = {
      name: name.value.trim(),
      type,
      category,
      unit,
      totalQuantity: total,
      remainingQuantity: remaining,
      notes: notes.value.trim(),
    };
    if (id) {
      await updateMedication(id, input);
    } else {
      await addMedication(input);
    }
    router.back();
  };

  if (!loaded) return null;

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>
        {isEditing ? t("medication.editTitle") : t("medication.formTitle")}
      </Stack.Title>
      <Host seedColor="#40621a" style={{ flex: 1 }}>
        <Column
          modifiers={[nativeLayout({ fullWidth: true, fullHeight: true })]}
        >
          <FieldGroup>
            <FieldGroup.Section title={t("medication.sectionBasic")}>
              <TextInput
                testID="medication-name-input"
                placeholder={t("medication.name")}
                autoFocus={!isEditing}
                onChangeText={() => setNameError(false)}
                value={name}
              />
              {nameError ? (
                <Text
                  style={{ paddingHorizontal: 16 }}
                  textStyle={{ color: "#ff3b30" }}
                >
                  {t("medication.nameRequired")}
                </Text>
              ) : null}
              <Picker
                testID="medication-type-picker"
                selectedValue={type}
                onValueChange={(value) => setType(value as MedicationType)}
              >
                {MEDICATION_TYPES.map((tp) => (
                  <Picker.Item
                    key={tp}
                    label={medicationTypeLabel(tp, t)}
                    value={tp}
                  />
                ))}
              </Picker>
              <Picker
                testID="medication-category-picker"
                selectedValue={category}
                onValueChange={(value) =>
                  setCategory(value as MedicationCategory)
                }
              >
                {MEDICATION_CATEGORIES.map((c) => (
                  <Picker.Item
                    key={c}
                    label={medicationCategoryLabel(c, t)}
                    value={c}
                  />
                ))}
              </Picker>
              <Picker
                testID="medication-unit-picker"
                selectedValue={unit}
                onValueChange={(value) => setUnit(value as MedicationUnit)}
              >
                {MEDICATION_UNITS.map((u) => (
                  <Picker.Item
                    key={u}
                    label={medicationUnitLabel(u, t)}
                    value={u}
                  />
                ))}
              </Picker>
            </FieldGroup.Section>
            <FieldGroup.Section title={t("medication.sectionStock")}>
              <TextInput
                testID="medication-total-input"
                placeholder={t("medication.totalQuantity")}
                keyboardType="number-pad"
                onChangeText={() => setQuantityError(false)}
                value={totalQuantity}
              />
              <TextInput
                testID="medication-remaining-input"
                placeholder={t("medication.remainingPlaceholder")}
                keyboardType="number-pad"
                value={remainingQuantity}
              />
              {quantityError ? (
                <Text
                  style={{ paddingHorizontal: 16 }}
                  textStyle={{ color: "#ff3b30" }}
                >
                  {t("medication.quantityInvalid")}
                </Text>
              ) : null}
            </FieldGroup.Section>
            <FieldGroup.Section title={t("medication.notes")}>
              <TextInput
                testID="medication-notes-input"
                placeholder={t("medication.notesPlaceholder")}
                multiline
                numberOfLines={3}
                value={notes}
              />
            </FieldGroup.Section>
            <FieldGroup.Section
              modifiers={nativeFieldModifiers({ flush: true })}
            >
              <Button
                testID="medication-save-button"
                label={t("common.save")}
                onPress={() => {
                  save();
                }}
                modifiers={nativeButtonModifiers({
                  style: "glassProminent",
                })}
              >
                <Row modifiers={[nativeLayout({ fullWidth: true })]}>
                  <Spacer />
                  <Text>{t("common.save")}</Text>
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
