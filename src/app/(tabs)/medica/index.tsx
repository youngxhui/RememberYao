import {
  Column,
  Host,
  Icon,
  List,
  ListItem,
  Row,
  Spacer,
  Text,
} from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";

import {
  medicationTypeLabel,
  medicationUnitLabel,
  useAppData,
  type Medication,
} from "@/lib/store";

function supportingText(medication: Medication): string {
  const unit = medicationUnitLabel(medication.unit);
  return [
    medicationTypeLabel(medication.type),
    `剩余 ${medication.remainingQuantity}/${medication.totalQuantity} ${unit}`,
  ].join(" · ");
}

export default function MedicaScreen() {
  const router = useRouter();
  const { medications, loading, reload } = useAppData();

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const openDetail = (id: string) => {
    router.push({ pathname: "/(tabs)/medica/detail", params: { id } });
  };

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          onPress={() => {
            router.push("/(tabs)/medica/form");
          }}
        >
          <Stack.Toolbar.Icon sf="plus" />
          <Stack.Toolbar.Label>Add</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Title large>药箱</Stack.Title>
      <Host seedColor="#40621a" style={{ flex: 1 }}>
        {medications.length === 0 && !loading ? EmptyView() : medicaListView()}
      </Host>
    </>
  );

  function medicaListView(): import("react").ReactNode {
    return (
      <List>
        {medications.map((medication) => (
          <ListItem
            key={medication.id}
            onPress={() => openDetail(medication.id)}
            supportingText={supportingText(medication)}
          >
            {medication.name}
          </ListItem>
        ))}
      </List>
    );
  }

  function EmptyView(): import("react").ReactNode {
    return (
      <Column alignment="center">
        <Spacer />
        <Row>
          <Spacer />
          <Column alignment="center">
            <Icon name="pills.fill" size={40} color="#8a8a8e" />
            <Text textStyle={{ color: "#8a8a8e" }}>
              药箱还是空的，点右上角添加药品
            </Text>
          </Column>
          <Spacer />
        </Row>
        <Spacer />
      </Column>
    );
  }
}
