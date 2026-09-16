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
import { buttonStyle, controlSize, frame, listRowInsets } from "@expo/ui/swift-ui/modifiers";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import {
  MEDICATION_TYPES,
  MEDICATION_UNITS,
  addMedication,
  updateMedication,
  useAppData,
  type MedicationType,
  type MedicationUnit,
} from "@/lib/store";

export default function MedicationFormScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const { medications } = useAppData();

  const [loaded, setLoaded] = useState(!isEditing);
  const [type, setType] = useState<MedicationType>("bottle");
  const [unit, setUnit] = useState<MedicationUnit>("tablet");
  const [nameError, setNameError] = useState(false);
  const [quantityError, setQuantityError] = useState(false);

  const name = useNativeState("");
  const totalQuantity = useNativeState("");
  const remainingQuantity = useNativeState("");
  const notes = useNativeState("");

  useEffect(() => {
    if (!id) return;
    const existing = medications.find((m) => m.id === id);
    if (existing) {
      name.value = existing.name;
      setType(existing.type);
      setUnit(existing.unit);
      totalQuantity.value = String(existing.totalQuantity);
      remainingQuantity.value = String(existing.remainingQuantity);
      notes.value = existing.notes;
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, medications]);

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
      <Stack.Title large>{isEditing ? "编辑药品" : "添加药品"}</Stack.Title>
      <Host seedColor="#40621a" style={{ flex: 1 }}>
        <Column
          modifiers={[frame({ maxHeight: Infinity, maxWidth: Infinity })]}
        >
          <FieldGroup>
            <FieldGroup.Section title="基础信息">
              <TextInput
                placeholder="药品名称"
                autoFocus={!isEditing}
                onChangeText={() => setNameError(false)}
                value={name}
              />
              {nameError ? (
                <Text
                  style={{ paddingHorizontal: 16 }}
                  textStyle={{ color: "#ff3b30" }}
                >
                  请填写药品名称
                </Text>
              ) : null}
              <Picker
                selectedValue={type}
                onValueChange={(value) => setType(value as MedicationType)}
              >
                {MEDICATION_TYPES.map((t) => (
                  <Picker.Item key={t.value} label={t.label} value={t.value} />
                ))}
              </Picker>
              <Picker
                selectedValue={unit}
                onValueChange={(value) => setUnit(value as MedicationUnit)}
              >
                {MEDICATION_UNITS.map((u) => (
                  <Picker.Item key={u.value} label={u.label} value={u.value} />
                ))}
              </Picker>
            </FieldGroup.Section>
            <FieldGroup.Section title="库存">
              <TextInput
                placeholder="总数量"
                keyboardType="number-pad"
                onChangeText={() => setQuantityError(false)}
                value={totalQuantity}
              />
              <TextInput
                placeholder="当前剩余数量（留空则等于总数量）"
                keyboardType="number-pad"
                value={remainingQuantity}
              />
              {quantityError ? (
                <Text
                  style={{ paddingHorizontal: 16 }}
                  textStyle={{ color: "#ff3b30" }}
                >
                  请填写有效的总数量
                </Text>
              ) : null}
            </FieldGroup.Section>
            <FieldGroup.Section title="备注">
              <TextInput
                placeholder="备注"
                multiline
                numberOfLines={3}
                value={notes}
              />
            </FieldGroup.Section>
            <FieldGroup.Section
              modifiers={[
                listRowInsets({ leading: 0, trailing: 0, top: 0, bottom: 0 }),
              ]}
            >
              <Button
                label="保存"
                onPress={() => {
                  save();
                }}
                modifiers={[
                  buttonStyle("glassProminent"),
                  controlSize("large"),
                ]}
              >
                <Row modifiers={[frame({ maxWidth: Infinity })]}>
                  <Spacer />
                  <Text>保存</Text>
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
