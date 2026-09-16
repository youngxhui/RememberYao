import {
  Button,
  Column,
  Host,
  List,
  ListItem,
  ScrollView,
  Text,
  TextInput,
  useNativeState,
} from "@expo/ui";
import { frame } from "@expo/ui/swift-ui/modifiers";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { Avatar } from "@/components/avatar";
import { useTheme } from "@/hooks/use-theme";
import { addPerson, useAppData } from "@/lib/store";

export default function PersonsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { persons, plans, reload } = useAppData();
  const [nameError, setNameError] = useState(false);
  const name = useNativeState("");

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const add = async () => {
    if (!name.value.trim()) {
      setNameError(true);
      return;
    }
    const person = await addPerson(name.value);
    name.value = "";
    await reload();
    router.push({
      pathname: "/(tabs)/persons/detail",
      params: { id: person.id },
    });
  };

  const planCount = (personId: string) =>
    plans.filter((p) => p.personId === personId && p.enabled).length;

  return (
    <>

      <Stack.Title large>用药人</Stack.Title>
      <Host seedColor="#40621a" style={{ flex: 1 }}>
        <ScrollView
          style={{ padding: 16, paddingBottom: 32 }}
          showsIndicators={false}
        >
          <Column
            spacing={12}
            style={{
              backgroundColor: theme.backgroundElement,
              borderRadius: 14,
              padding: 16,
            }}
          >
            <TextInput
              placeholder="姓名，如：爷爷"
              value={name}
              onChangeText={() => setNameError(false)}
            />
            {nameError ? (
              <Text
                style={{ paddingVertical: 2 }}
                textStyle={{ color: "#ff3b30" }}
              >
                请填写姓名
              </Text>
            ) : null}
            <Button
              label="添加用药人"
              onPress={() => {
                add();
              }}
              modifiers={[frame({ maxWidth: Infinity })]}
            />
          </Column>

          <Text
            style={{ paddingTop: 20, paddingBottom: 8, paddingLeft: 4 }}
            textStyle={{ fontSize: 13, color: theme.textSecondary }}
          >
            家庭成员
          </Text>
          {persons.length === 0 ? (
            <Column alignment="center" style={{ paddingTop: 40 }}>
              <Text textStyle={{ color: theme.textSecondary }}>
                还没有用药人，先在上方添加
              </Text>
            </Column>
          ) : (
            <List>
              {persons.map((person) => (
                <ListItem
                  key={person.id}
                  onPress={() => {
                    router.push({
                      pathname: "/(tabs)/persons/detail",
                      params: { id: person.id },
                    });
                  }}
                  supportingText={`${planCount(person.id)} 个用药配置`}
                >
                  {person.name}
                </ListItem>
              ))}
            </List>
          )}
        </ScrollView>
      </Host>
    </>
  );
}
