import { Button, Column, Host, ListItem, ScrollView, Text } from "@expo/ui";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useState } from "react";

import { Avatar } from "@/components/avatar";
import { nativeButtonModifiers } from "@/components/native-layout";
import { HairLine, SectionCard, SectionTitle } from "@/components/section-card";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import {
  deletePerson,
  medicationUnitLabel,
  planStatusLabel,
  useAppData,
} from "@/lib/store";

export default function PersonDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
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
              {t("person.notFound")}
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

          <SectionTitle>{t("person.plans")}</SectionTitle>
          {personPlans.length === 0 ? (
            <Column
              style={{
                backgroundColor: theme.backgroundElement,
                borderRadius: 14,
                padding: 16,
              }}
            >
              <Text textStyle={{ color: theme.textSecondary }}>
                {t("plan.emptyAddHint")}
              </Text>
            </Column>
          ) : (
            // @expo/ui 的 List 在 iOS 上是 SwiftUI List，本身是滚动容器，嵌进外层
            // ScrollView 会塌（与药品详情页同源的 bug），用药配置行不多，用普通行拼卡片
            <SectionCard>
              {personPlans.map((plan, index) => {
                const medication = medications.find(
                  (m) => m.id === plan.medicationId,
                );
                const unit = medication
                  ? medicationUnitLabel(medication.unit, t)
                  : "";
                return (
                  <Column key={plan.id}>
                    {index > 0 ? <HairLine /> : null}
                    <Column style={{ padding: Spacing.three }}>
                      <ListItem
                        testID={`plan-item-${plan.id}`}
                        onPress={() => {
                          router.push({
                            pathname: "/(tabs)/profile/plan-form",
                            params: { id: plan.id },
                          });
                        }}
                        supportingText={[
                          t("person.summaryLine", {
                            name:
                              medication?.name ?? t("home.unknownMedication"),
                            amount: plan.doseAmount,
                            unit,
                          }),
                          t("person.timesLine", {
                            count: plan.times.length,
                            times: plan.times.join(" / "),
                          }),
                          [
                            t("person.startFrom", { start: plan.startDate }),
                            plan.endDate
                              ? t("person.rangeTo", { end: plan.endDate })
                              : t("person.rangeOngoing"),
                          ].join(""),
                        ].join("\n")}
                      >
                        {planStatusLabel(plan, t)}
                      </ListItem>
                    </Column>
                  </Column>
                );
              })}
            </SectionCard>
          )}

          <Column spacing={12} style={{ paddingTop: 24 }}>
            <Button
              testID="plan-add-button"
              label={t("plan.formTitle")}
              onPress={() => {
                router.push({
                  pathname: "/(tabs)/profile/plan-form",
                  params: { personId: person.id },
                });
              }}
              modifiers={nativeButtonModifiers({
                style: "glass",
                fullWidth: true,
              })}
            />
            {/* 文案在「删除用药人 / 再次点击确认删除」之间切换，靠 testID 稳定定位 */}
            <Button
              testID="person-delete-button"
              label={
                confirmDeletePerson
                  ? t("common.confirmDelete")
                  : t("person.deleteButtonAlt")
              }
              onPress={() => {
                removePerson();
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
