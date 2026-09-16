import { Column, Host, Icon, List, ListItem, Spacer, Text } from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";

import { useMedicines, type Medicine } from "@/lib/medicines";

function supportingText(medicine: Medicine): string {
  const parts = [medicine.dosage, medicine.frequency].filter(Boolean);
  if (medicine.quantity) parts.push(`剩余 ${medicine.quantity}`);
  return parts.join(" · ");
}

export default function Index() {
  const router = useRouter();
  const { medicines, loading, reload } = useMedicines();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const openDetail = (id: string) => {
    router.push({ pathname: "/(tabs)/medica/medica", params: { id } });
  };

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          onPress={() => {
            router.push("/(tabs)/medica/medica");
          }}
        >
          <Stack.Toolbar.Icon sf="plus" />
          <Stack.Toolbar.Label>Add</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Title large>药箱</Stack.Title>
      <Host seedColor="#40621a" style={{ flex: 1 }}>
        {medicines.length === 0 && !loading ? (
          <Column alignment="center">
            <Spacer />
            <Icon name="pills.fill" size={40} color="#8a8a8e" />
            <Text textStyle={{ color: "#8a8a8e" }}>
              药箱还是空的，点右上角添加药品
            </Text>
            <Spacer />
          </Column>
        ) : (
          <List>
            {medicines.map((medicine) => (
              <ListItem
                key={medicine.id}
                onPress={() => openDetail(medicine.id)}
                supportingText={supportingText(medicine)}
              >
                {medicine.name}
              </ListItem>
            ))}
          </List>
        )}
      </Host>
    </>
  );
}
