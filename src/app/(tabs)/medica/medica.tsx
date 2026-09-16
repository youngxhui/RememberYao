import {
  BottomSheet,
  Button,
  Column,
  FieldGroup,
  Host,
  Picker,
  Spacer,
  Text,
  TextInput,
  useNativeState,
} from "@expo/ui";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import {
  MEDICINE_FREQUENCIES,
  addMedicine,
  deleteMedicine,
  getMedicine,
  updateMedicine,
  type Medicine,
} from "@/lib/medicines";
import { HStack } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  controlSize,
  frame,
  listRowInsets,
} from "@expo/ui/swift-ui/modifiers";

export default function MedicaScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = Boolean(id);

  const [existing, setExisting] = useState<Medicine | null>(null);
  const [loaded, setLoaded] = useState(!isEditing);
  const [frequency, setFrequency] = useState<string>(MEDICINE_FREQUENCIES[0]);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [debugPressed, setDebugPressed] = useState(false); // TEMP debug: remove after verification

  const name = useNativeState("");
  const dosage = useNativeState("");
  const quantity = useNativeState("");
  const notes = useNativeState("");

  useEffect(() => {
    if (!id) return;
    getMedicine(id).then((medicine) => {
      if (medicine) {
        setExisting(medicine);
        name.value = medicine.name;
        dosage.value = medicine.dosage;
        quantity.value = medicine.quantity;
        notes.value = medicine.notes;
        setFrequency(medicine.frequency || MEDICINE_FREQUENCIES[0]);
      }
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = async () => {
    if (!name.value.trim()) {
      setNameError(true);
      return;
    }
    setSaving(true);
    const input = {
      name: name.value.trim(),
      dosage: dosage.value.trim(),
      frequency,
      quantity: quantity.value.trim(),
      notes: notes.value.trim(),
    };
    if (id) {
      await updateMedicine(id, input);
    } else {
      await addMedicine(input);
    }
    router.back();
  };

  const remove = async () => {
    if (!id) return;
    await deleteMedicine(id);
    setConfirmDelete(false);
    router.back();
  };

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Toolbar placement="right">
        {isEditing ? (
          <Stack.Toolbar.Button
            onPress={() => {
              setConfirmDelete(true);
            }}
          >
            <Stack.Toolbar.Icon sf="xmark" />
            <Stack.Toolbar.Label>删除</Stack.Toolbar.Label>
          </Stack.Toolbar.Button>
        ) : null}
      </Stack.Toolbar>
      <Stack.Title large>{isEditing ? "编辑药品" : "添加药品"}</Stack.Title>
      <Host seedColor="#40621a" style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section title="基础信息">
            <TextInput
              placeholder="药物名称"
              autoFocus={!isEditing}
              onChangeText={() => setNameError(false)}
              value={name}
            />
            {nameError ? (
              <Text
                style={{ paddingHorizontal: 16 }}
                textStyle={{ color: "#ff3b30" }}
              >
                请填写药物名称
              </Text>
            ) : null}
            <TextInput placeholder="剂量，如 500mg" value={dosage} />
            <Picker
              selectedValue={frequency}
              onValueChange={(value) => setFrequency(value)}
            >
              {MEDICINE_FREQUENCIES.map((f) => (
                <Picker.Item key={f} label={f} value={f} />
              ))}
            </Picker>
          </FieldGroup.Section>
          <FieldGroup.Section title="库存与备注">
            <TextInput
              placeholder="剩余数量"
              keyboardType="number-pad"
              value={quantity}
            />
            <TextInput
              placeholder="备注"
              multiline
              numberOfLines={3}
              value={notes}
            />
          </FieldGroup.Section>
          <FieldGroup.Section
            modifiers={[
              listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 }),
            ]}
          >
            <Button
              onPress={save}
              style={{ width: "100%" }}
              modifiers={[
                buttonStyle("glassProminent"),
                controlSize("large"),
                frame({ maxWidth: Infinity }),
              ]}
            >
              <HStack modifiers={[frame({ maxWidth: Infinity })]}>
                <Spacer />
                <Text>保存</Text>
                <Spacer />
              </HStack>
            </Button>
          </FieldGroup.Section>
        </FieldGroup>

        <BottomSheet
          isPresented={confirmDelete}
          onDismiss={() => setConfirmDelete(false)}
        >
          <Column style={{ padding: 24 }} spacing={16}>
            <Text textStyle={{ fontSize: 18, fontWeight: "600" }}>
              {`删除「${existing?.name ?? ""}」？`}
            </Text>
            <Text textStyle={{ color: "#8a8a8e" }}>
              删除后无法恢复，确定要删除这味药吗？
            </Text>
            <Button label="确认删除" onPress={remove} />
            <Button
              label="取消"
              variant="outlined"
              onPress={() => setConfirmDelete(false)}
            />
          </Column>
        </BottomSheet>
      </Host>
    </>
  );
}
