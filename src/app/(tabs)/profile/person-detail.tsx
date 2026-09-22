import {
  Button,
  Column,
  Host,
  List,
  ListItem,
  ScrollView,
  Text,
} from "@expo/ui";
import { buttonStyle, controlSize, frame } from "@expo/ui/swift-ui/modifiers";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";

import { Avatar } from "@/components/avatar";
import { useTheme } from "@/hooks/use-theme";
import {
  deletePerson,
  medicationUnitLabel,
  planStatusLabel,
  useAppData,
} from "@/lib/store";

export default function PersonDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { persons, medications, plans, reload } = useAppData();
  const [confirmDeletePerson, setConfirmDeletePerson] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reload();
      setConfirmDeletePerson(false);
    }, [reload]),
  );

  const person = persons.find((p) => p.id === id);

  if (!person) {
    return (
      <>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Host style={{ flex: 1 }}>
          <Column alignment="center" style={{ paddingTop: 120 }}>
            <Text textStyle={{ color: theme.textSecondary }}>
              用药人不存在或已删除
            </Text>
          </Column>
        </Host>
      </>
    );
  }

  const personPlans = plans.filter((p) => p.personId === person.id);

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
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>{person.name}</Stack.Title>
      <Host seedColor="#40621a" style={{ flex: 1 }}>
        <ScrollView
          style={{ padding: 16, paddingBottom: 32 }}
          showsIndicators={false}
        >
          <Column alignment="center" style={{ paddingVertical: 12 }}>
            <Avatar color={person.avatarColor} name={person.name} size={64} />
          </Column>

          <Text
            style={{ paddingTop: 8, paddingBottom: 8, paddingLeft: 4 }}
            textStyle={{ fontSize: 13, color: theme.textSecondary }}
          >
            用药配置
          </Text>
          {personPlans.length === 0 ? (
            <Column
              style={{
                backgroundColor: theme.backgroundElement,
                borderRadius: 14,
                padding: 16,
              }}
            >
              <Text textStyle={{ color: theme.textSecondary }}>
                还没有用药配置，点击下方按钮添加
              </Text>
            </Column>
          ) : (
            <List>
              {personPlans.map((plan) => {
                const medication = medications.find(
                  (m) => m.id === plan.medicationId,
                );
                const unit = medication
                  ? medicationUnitLabel(medication.unit)
                  : "";
                return (
                  <ListItem
                    key={plan.id}
                    onPress={() => {
                      router.push({
                        pathname: "/(tabs)/profile/plan-form",
                        params: { id: plan.id },
                      });
                    }}
                    supportingText={[
                      `${medication?.name ?? "未知药品"} · 每次 ${plan.doseAmount} ${unit}`,
                      `每日 ${plan.times.length} 次 · ${plan.times.join(" / ")}`,
                      `${plan.startDate} 起${plan.endDate ? ` · 至 ${plan.endDate}` : " · 长期"}`,
                    ].join("\n")}
                  >
                    {planStatusLabel(plan)}
                  </ListItem>
                );
              })}
            </List>
          )}

          <Column spacing={12} style={{ paddingTop: 24 }}>
            <Button
              label="添加用药配置"
              onPress={() => {
                router.push({
                  pathname: "/(tabs)/profile/plan-form",
                  params: { personId: person.id },
                });
              }}
              modifiers={[
                buttonStyle("glass"),
                controlSize("large"),
                frame({ maxWidth: Infinity }),
              ]}
            />
            <Button
              label={confirmDeletePerson ? "再次点击确认删除" : "删除用药人"}
              onPress={() => {
                removePerson();
              }}
              modifiers={[
                buttonStyle("borderedProminent"),
                controlSize("large"),
                frame({ maxWidth: Infinity }),
              ]}
            />
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}
