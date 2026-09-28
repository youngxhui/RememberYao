import {
  Button,
  Column,
  FieldGroup,
  Host,
  List,
  ListItem,
  Row,
  ScrollView,
  Text,
  TextInput,
  useNativeState,
} from "@expo/ui";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";

import { nativeButtonModifiers } from "@/components/native-layout";
import { ProgressBar } from "@/components/progress-bar";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  deleteMedication,
  medicationTypeLabel,
  medicationUnitLabel,
  planStatusLabel,
  restockMedication,
  stockSummary,
  useAppData,
} from "@/lib/store";

export default function MedicationDetailScreen() {
  const router = useRouter();
  const t = useTranslation();
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { medications, persons, plans, reload } = useAppData();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [restockError, setRestockError] = useState(false);
  const restockAmount = useNativeState("");

  useFocusEffect(
    useCallback(() => {
      reload();
      setConfirmDelete(false);
    }, [reload]),
  );

  const medication = medications.find((m) => m.id === id);

  if (!medication) {
    return (
      <>
        <Stack.Screen.BackButton displayMode="minimal" />
        <Host style={{ flex: 1 }}>
          <Column alignment="center" style={{ paddingTop: 120 }}>
            <Text textStyle={{ color: theme.textSecondary }}>
              {t("medication.notFound")}
            </Text>
          </Column>
        </Host>
      </>
    );
  }

  const unit = medicationUnitLabel(medication.unit, t);
  const summary = stockSummary(medication, plans);
  const relatedPlans = plans.filter((p) => p.medicationId === medication.id);
  const percent =
    medication.totalQuantity > 0
      ? medication.remainingQuantity / medication.totalQuantity
      : 0;
  const stockColor =
    percent <= 0.2
      ? theme.danger
      : percent <= 0.5
        ? theme.warning
        : theme.success;

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await deleteMedication(medication.id);
    router.back();
  };

  const restock = async () => {
    const amount = Number.parseInt(restockAmount.value, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      setRestockError(true);
      return;
    }
    await restockMedication(medication.id, amount);
    restockAmount.value = "";
    setRestockError(false);
    await reload();
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
          <Stack.Toolbar.Label>{t("common.edit")}</Stack.Toolbar.Label>
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
              {t("medication.typeAndUnit", {
                type: medicationTypeLabel(medication.type, t),
                unit,
              })}
            </Text>
            <Row alignment="end" spacing={4}>
              <Text textStyle={{ fontSize: 32, fontWeight: "700" }}>
                {String(medication.remainingQuantity)}
              </Text>
              <Text textStyle={{ fontSize: 16, color: theme.textSecondary }}>
                {`/ ${medication.totalQuantity} ${unit}`}
              </Text>
            </Row>
            <ProgressBar
              percent={percent}
              color={stockColor}
              track={theme.backgroundSelected}
            />
            {summary.daysLeft !== null ? (
              <Text
                textStyle={{
                  fontSize: 13,
                  color: summary.low ? theme.danger : theme.textSecondary,
                }}
              >
                {summary.low
                  ? t("medication.daysLeftHintLow", {
                      days: summary.daysLeft,
                    })
                  : t("medication.daysLeftHint", { days: summary.daysLeft })}
              </Text>
            ) : null}
            {medication.notes ? (
              <Text textStyle={{ fontSize: 14, color: theme.textSecondary }}>
                {medication.notes}
              </Text>
            ) : null}
          </Column>

          <Text
            style={{ paddingTop: 20, paddingBottom: 8, paddingLeft: 4 }}
            textStyle={{ fontSize: 13, color: theme.textSecondary }}
          >
            {t("plan.title")}
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
                {t("medication.noTakers")}
              </Text>
            </Column>
          ) : (
            <List>
              {relatedPlans.map((plan) => {
                const person = persons.find((p) => p.id === plan.personId);
                return (
                  <ListItem
                    key={plan.id}
                    testID={`medication-plan-${plan.id}`}
                    onPress={() => {
                      router.push({
                        pathname: "/(tabs)/profile/person-detail",
                        params: { id: plan.personId },
                      });
                    }}
                    supportingText={[
                      t("medication.dosePerDose", {
                        name: person?.name ?? t("common.unknown"),
                        amount: plan.doseAmount,
                        unit,
                      }),
                      `${t("plan.perDay", { count: plan.times.length })} · ${plan.times.join(" / ")}`,
                    ].join("\n")}
                  >
                    {planStatusLabel(plan, t)}
                  </ListItem>
                );
              })}
            </List>
          )}

          <FieldGroup style={{ paddingTop: 20 }}>
            <FieldGroup.Section title={t("medication.sectionMore")}>
              <ListItem supportingText={t("medication.leafletHint")}>
                {t("medication.leaflet")}
              </ListItem>
            </FieldGroup.Section>
            <FieldGroup.Section title={t("medication.restock")}>
              <TextInput
                testID="restock-amount-input"
                placeholder={t("medication.restockPlaceholder")}
                keyboardType="number-pad"
                onChangeText={() => setRestockError(false)}
                value={restockAmount}
              />
              {restockError ? (
                <Text
                  style={{ paddingHorizontal: 16 }}
                  textStyle={{ color: "#ff3b30" }}
                >
                  {t("medication.restockInvalid")}
                </Text>
              ) : null}
              <Button
                testID="restock-submit-button"
                label={t("medication.restockSubmit")}
                onPress={() => {
                  void restock();
                }}
                modifiers={nativeButtonModifiers({ style: "glass" })}
              />
            </FieldGroup.Section>
          </FieldGroup>

          <Column spacing={12} style={{ paddingTop: 24 }}>
            <Button
              testID="medication-add-plan-button"
              label={t("plan.formTitle")}
              onPress={() => {
                router.push({
                  pathname: "/(tabs)/profile/plan-form",
                  params: { medicationId: medication.id },
                });
              }}
              modifiers={nativeButtonModifiers({
                style: "glass",
                fullWidth: true,
              })}
            />
            {/* 文案在「删除药品 / 再次点击确认删除」之间切换，靠 testID 稳定定位 */}
            <Button
              testID="medication-delete-button"
              label={
                confirmDelete
                  ? t("medication.deleteConfirmButton")
                  : t("medication.deleteButton")
              }
              onPress={() => {
                remove();
              }}
              modifiers={nativeButtonModifiers({
                style: "borderedProminent",
                fullWidth: true,
              })}
            />
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}
