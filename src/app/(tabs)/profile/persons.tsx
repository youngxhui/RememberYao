import {
  Button,
  Column,
  Host,
  ListItem,
  ScrollView,
  Text,
  TextInput,
  useNativeState,
} from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import { nativeLayout } from "@/components/native-layout";
import { HairLine, SectionCard } from "@/components/section-card";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
import { addPerson, useAppData } from "@/lib/store";

export default function PersonsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const t = useTranslation();
  const { persons, plans, reload } = useAppData();
  const [nameError, setNameError] = useState(false);
  const name = useNativeState("");

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
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
      pathname: "/(tabs)/profile/person-detail",
      params: { id: person.id },
    });
  };

  const planCount = (personId: string) =>
    plans.filter((p) => p.personId === personId && p.enabled).length;

  return (
    <>
      <Stack.Title large>{t("person.listTitle")}</Stack.Title>
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
              testID="person-name-input"
              placeholder={t("person.nameInputPlaceholder")}
              value={name}
              onChangeText={() => setNameError(false)}
            />
            {nameError ? (
              <Text
                style={{ paddingVertical: 2 }}
                textStyle={{ color: "#ff3b30" }}
              >
                {t("person.nameRequired")}
              </Text>
            ) : null}
            <Button
              testID="person-add-button"
              label={t("person.addMemberButton")}
              onPress={() => {
                add();
              }}
              modifiers={[nativeLayout({ fullWidth: true })]}
            />
          </Column>

          <Text
            style={{ paddingTop: 20, paddingBottom: 8, paddingLeft: 4 }}
            textStyle={{ fontSize: 13, color: theme.textSecondary }}
          >
            {t("person.listTitle")}
          </Text>
          {persons.length === 0 ? (
            <Column alignment="center" style={{ paddingTop: 40 }}>
              <Text textStyle={{ color: theme.textSecondary }}>
                {t("person.empty")}
              </Text>
            </Column>
          ) : (
            // @expo/ui 的 List 在 iOS 上是 SwiftUI List，本身是滚动容器，嵌进外层
            // ScrollView 会塌（与药品详情页同源的 bug），用药人不多，用普通行拼卡片
            <SectionCard>
              {persons.map((person, index) => (
                <Column key={person.id}>
                  {index > 0 ? <HairLine /> : null}
                  <Column style={{ padding: Spacing.three }}>
                    <ListItem
                      testID={`person-item-${person.id}`}
                      onPress={() => {
                        router.push({
                          pathname: "/(tabs)/profile/person-detail",
                          params: { id: person.id },
                        });
                      }}
                      supportingText={t("person.planCount", {
                        count: planCount(person.id),
                      })}
                    >
                      {person.name}
                    </ListItem>
                  </Column>
                </Column>
              ))}
            </SectionCard>
          )}
        </ScrollView>
      </Host>
    </>
  );
}
