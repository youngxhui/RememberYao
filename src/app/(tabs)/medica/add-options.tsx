import { Column, Host, Icon, Row, ScrollView, Spacer, Text } from "@expo/ui";
import { Stack, useRouter } from "expo-router";

import { nativeLayout } from "@/components/native-layout";
import { useTheme } from "@/hooks/use-theme";

export default function AddOptionsScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title large>添加药品</Stack.Title>
      <Host seedColor="#0F766E" style={{ flex: 1 }}>
        <ScrollView
          style={{ padding: 16, paddingBottom: 32 }}
          showsIndicators={false}
        >
          <Column spacing={12}>
            <OptionRow
              icon="camera.fill"
              title="拍照识别药品"
              subtitle="识别药品名称、规格等信息"
              hint="即将推出"
            />
            <OptionRow
              icon="square.and.pencil"
              title="手动输入"
              subtitle="填写药品名称、库存等信息"
              onPress={() => {
                router.push("/(tabs)/medica/form");
              }}
            />
            <OptionRow
              icon="barcode.viewfinder"
              title="扫描条形码"
              subtitle="扫描药品条码自动填写"
              hint="即将推出"
            />
            <Text
              style={{ paddingTop: 8 }}
              textStyle={{ fontSize: 12, color: theme.textSecondary }}
            >
              拍照识别与扫码功能开发中，可先通过手动输入添加药品
            </Text>
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}

type OptionIcon = "camera.fill" | "square.and.pencil" | "barcode.viewfinder";

function OptionRow({
  icon,
  title,
  subtitle,
  hint,
  onPress,
}: {
  icon: OptionIcon;
  title: string;
  subtitle: string;
  hint?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Row
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
