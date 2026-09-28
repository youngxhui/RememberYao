import { Column, Host, Icon, Row, ScrollView, Spacer, Text } from "@expo/ui";
import { Stack, useRouter } from "expo-router";

import { nativeLayout } from "@/components/native-layout";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";

export default function AddOptionsScreen() {
  const router = useRouter();
  const t = useTranslation();
  const theme = useTheme();

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>{t("medication.formTitle")}</Stack.Title>
      <Host seedColor="#0F766E" style={{ flex: 1 }}>
        <ScrollView
          style={{ padding: 16, paddingBottom: 32 }}
          showsIndicators={false}
        >
          <Column spacing={12}>
            <OptionRow
              icon="camera.fill"
              title={t("medication.scanPhoto")}
              subtitle={t("medication.scanPhotoSubtitle")}
              hint={t("medication.comingSoon")}
            />
            <OptionRow
              testID="add-option-manual"
              icon="square.and.pencil"
              title={t("medication.manualInput")}
              subtitle={t("medication.manualInputSubtitle")}
              onPress={() => {
                router.push("/(tabs)/medica/form");
              }}
            />
            <OptionRow
              icon="barcode.viewfinder"
              title={t("medication.scanBarcode")}
              subtitle={t("medication.scanBarcodeSubtitle")}
              hint={t("medication.comingSoon")}
            />
            <Text
              style={{ paddingTop: 8 }}
              textStyle={{ fontSize: 12, color: theme.textSecondary }}
            >
              {t("medication.addOptionsFootnote")}
            </Text>
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}

type OptionIcon = "camera.fill" | "square.and.pencil" | "barcode.viewfinder";

function OptionRow({
  testID,
  icon,
  title,
  subtitle,
  hint,
  onPress,
}: {
  /** 仅可点选的选项需要，禁用项（即将推出）留空 */
  testID?: string;
  icon: OptionIcon;
  title: string;
  subtitle: string;
  hint?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Row
      testID={testID}
      alignment="center"
      spacing={12}
      onPress={onPress}
      style={{
        backgroundColor: theme.backgroundElement,
        borderRadius: 14,
        padding: 16,
        opacity: onPress ? 1 : 0.6,
      }}
    >
      <Row
        alignment="center"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          backgroundColor: theme.primarySoft,
        }}
      >
        <Spacer />
        <Icon name={icon} size={22} color={theme.primary} />
        <Spacer />
      </Row>
      <Column
        spacing={2}
        modifiers={[nativeLayout({ unconstrainedWidth: true })]}
      >
        <Text textStyle={{ fontSize: 15, fontWeight: "600" }}>{title}</Text>
        <Text textStyle={{ fontSize: 12, color: theme.textSecondary }}>
          {subtitle}
        </Text>
      </Column>
      {hint ? (
        <Text textStyle={{ fontSize: 12, color: theme.textSecondary }}>
          {hint}
        </Text>
      ) : null}
    </Row>
  );
}
