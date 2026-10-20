import { TrueSheet } from "@lodev09/react-native-true-sheet";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { useRef, useState } from "react";
import { Text, View } from "tamagui";

import { SectionCard, SectionTitle } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { RowDivider, SettingRow } from "@/components/setting-row";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useI18n } from "@/i18n";

/**
 * 二级屏 · 关于：隐私政策（长文，收在 TrueSheet 里）+ 版本号 + 免责声明。
 *
 * 从原一屏平铺的设置页（`src/screens/profile/settings.tsx`，2026-10-17 拆分）搬来。
 * 免责声明放在分组卡片下方而不是塞进某一行 —— 它不是设置项，是常驻提示。
 */
export function SettingsAbout() {
  const { t } = useI18n();
  const [showPrivacy, setShowPrivacy] = useState(false);
  const privacySheetRef = useRef<TrueSheet>(null);

  const openPrivacySheet = () => {
    setShowPrivacy(true);
    void privacySheetRef.current?.present(0);
  };

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title>{t("settings.aboutEntry")}</Stack.Title>

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <View>
          <SectionTitle>{t("settings.sectionAbout")}</SectionTitle>
          <SectionCard tone="outline">
            <SettingRow
              testID="settings-privacy-row"
              label={t("settings.privacyTitle")}
              sub={t("settings.privacySub")}
              onPress={() => {
                openPrivacySheet();
              }}
              showChevron
            />
            <RowDivider />
            <SettingRow
              label={t("settings.version")}
              trailing={
                <Text fontSize={13} fontFamily="mono" color="textSecondary">
                  {Constants.expoConfig?.version ?? "1.0.0"}
                </Text>
              }
            />
          </SectionCard>
          <Text
            paddingTop="three"
            paddingInline="two"
            fontSize={13}
            lineHeight="21px"
            color="textSecondary"
            textAlign="center"
          >
            {t("settings.note")}
          </Text>
        </View>
      </ScreenScaffold>

      {/* 隐私说明：内容较长，用原生 sheet 而不是塞进分组行里展开 */}
      <TrueSheet
        ref={privacySheetRef}
        detents={["auto", 0.6]}
        initialDetentIndex={-1}
        onDidDismiss={() => {
          setShowPrivacy(false);
        }}
      >
        {showPrivacy ? (
          <View padding={20} gap={12}>
            <Text fontSize={17} fontWeight="700" color="text">
              {t("settings.privacyTitle")}
            </Text>
            <Text fontSize={14} color="textSecondary" lineHeight="20px">
              {t("settings.privacyBody")}
            </Text>
            <View
              testID="settings-privacy-close-button"
              onPress={() => {
                void privacySheetRef.current?.dismiss();
              }}
              accessibilityRole="button"
              backgroundColor="primary press:primarySoft"
              borderRadius="card"
              borderCurve="continuous"
              paddingBlock="three"
              alignItems="center"
              justifyContent="center"
              minHeight={44}
            >
              <Text color="onPrimary" fontSize={15} fontWeight="600">
                {t("common.done")}
              </Text>
            </View>
          </View>
        ) : null}
      </TrueSheet>
    </>
  );
}
