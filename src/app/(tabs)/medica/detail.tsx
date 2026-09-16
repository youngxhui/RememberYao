import {
  Button,
  Column,
  Host,
  List,
  ListItem,
  RNHostView,
  Row,
  ScrollView,
  Text,
} from "@expo/ui";
import {
  buttonStyle,
  controlSize,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";
import { View as RNView } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import {
  deleteMedication,
  medicationTypeLabel,
  medicationUnitLabel,
  useAppData,
} from "@/lib/store";

export default function MedicationDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { medications, persons, plans, reload } = useAppData();
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reload();
      setConfirmDelete(false);
    }, [reload])
  );

  const medication = medications.find((m) => m.id === id);

  if (!medication) {
    return (
      <>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Host style={{ flex: 1 }}>
          <Column
            alignment="center"
            style={{ paddingTop: 120 }}
          >
            <Text textStyle={{ color: theme.textSecondary }}>
              药品不存在或已删除
            </Text>
          </Column>
        </Host>
      </>
    );
  }

  const unit = medicationUnitLabel(medication.unit);
  const relatedPlans = plans.filter((p) => p.medicationId === medication.id);
  const percent =
    medication.totalQuantity > 0
      ? medication.remainingQuantity / medication.totalQuantity
      : 0;
  const stockColor =
    percent <= 0.2 ? theme.danger : percent <= 0.5 ? theme.warning : theme.success;

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteMedication(medication.id);
    router.back();
  };

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          onPress={() => {
            router.push({ pathname: "/(tabs)/medica/form", params: { id } });
          }}
        >
          <Stack.Toolbar.Icon sf="square.and.pencil" />
          <Stack.Toolbar.Label>编辑</Stack.Toolbar.Label>
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Title large>{medication.name}</Stack.Title>
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
            <Text textStyle={{ fontSize: 15, color: theme.textSecondary }}>
              {`${medicationTypeLabel(medication.type)} · 按${unit}计量`}
            </Text>
            <Row alignment="end" spacing={4}>
              <Text textStyle={{ fontSize: 32, fontWeight: "700" }}>
                {String(medication.remainingQuantity)}
              </Text>
              <Text
                textStyle={{ fontSize: 16, color: theme.textSecondary }}
              >
                {`/ ${medication.totalQuantity} ${unit}`}
              </Text>
            </Row>
            <StockBar percent={percent} color={stockColor} track={theme.backgroundSelected} />
            {medication.notes ? (
              <Text
                textStyle={{ fontSize: 14, color: theme.textSecondary }}
              >
                {medication.notes}
              </Text>
            ) : null}
          </Column>

          <Text
            style={{ paddingTop: 20, paddingBottom: 8, paddingLeft: 4 }}
            textStyle={{ fontSize: 13, color: theme.textSecondary }}
          >
            用药配置
          </Text>
          {relatedPlans.length === 0 ? (
            <Column
              style={{
                backgroundColor: theme.backgroundElement,
                borderRadius: 14,
                padding: 16,
              }}
            >
              <Text textStyle={{ color: theme.textSecondary }}>
                还没有人服用这款药品
              </Text>
            </Column>
          ) : (
            <List>
              {relatedPlans.map((plan) => {
                const person = persons.find((p) => p.id === plan.personId);
                return (
                  <ListItem
                    key={plan.id}
                    onPress={() => {
                      router.push({
                        pathname: "/(tabs)/persons/detail",
                        params: { id: plan.personId },
                      });
                    }}
                    supportingText={[
                      `${person?.name ?? "未知"} · 每次 ${plan.doseAmount} ${unit}`,
                      `每日 ${plan.times.length} 次 · ${plan.times.join(" / ")}`,
                    ].join("\n")}
                  >
                    {plan.enabled ? "服用中" : "已停用"}
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
                  pathname: "/(tabs)/persons/plan-form",
                  params: { medicationId: medication.id },
                });
              }}
              modifiers={[
                buttonStyle("glass"),
                controlSize("large"),
                frame({ maxWidth: Infinity }),
              ]}
            />
            <Button
              label={confirmDelete ? "再次点击确认删除" : "删除药品"}
              onPress={() => {
                remove();
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

function StockBar({
  percent,
  color,
  track,
}: {
  percent: number;
  color: string;
  track: string;
}) {
  return (
    <RNHostView style={{ width: "100%", height: 6 }}>
      <RNView
        style={{
          flex: 1,
          borderRadius: 3,
          backgroundColor: track,
          overflow: "hidden",
        }}
      >
        <RNView
          style={{
            width: `${Math.max(0, Math.min(1, percent)) * 100}%`,
            height: 6,
            borderRadius: 3,
            backgroundColor: color,
          }}
        />
      </RNView>
    </RNHostView>
  );
}
