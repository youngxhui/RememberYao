import { TrueSheet } from "@lodev09/react-native-true-sheet";
import Constants from "expo-constants";
import { Stack } from "expo-router";
import { useRef, useState } from "react";
import {
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from "react-native";

import { SectionCard, SectionTitle } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { BottomTabInset, Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useI18n } from "@/i18n";

import { RowDivider, SettingRow } from "./setting-row";

/**
 * 二级屏 · 关于：隐私政策（长文，收在 TrueSheet 里）+ 版本号 + 免责声明。
 *
 * 从原一屏平铺的设置页（`src/screens/profile/settings.tsx`，2026-10-17 拆分）搬来。
 * 免责声明放在分组卡片下方而不是塞进某一行 —— 它不是设置项，是常驻提示。
 */
export function SettingsAbout() {
  const theme = useTheme();
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
        <RNView>
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
                <RNText
                  style={{
                    fontSize: 13,
                    fontFamily: Fonts.mono,
                    color: theme.textSecondary,
                  }}
                >
                  {Constants.expoConfig?.version ?? "1.0.0"}
                </RNText>
              }
            />
          </SectionCard>
          <RNText
            style={{
              paddingTop: Spacing.three,
              paddingHorizontal: Spacing.two,
              fontSize: 13,
              lineHeight: 21,
              color: theme.textSecondary,
              textAlign: "center",
            }}
          >
            {t("settings.note")}
          </RNText>
        </RNView>
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
          <RNView
            style={{
              padding: 20,
              gap: 12,
            }}
          >
            <RNText
              style={{ fontSize: 17, fontWeight: "700", color: theme.text }}
            >
              {t("settings.privacyTitle")}
            </RNText>
            <RNText
              style={{
                fontSize: 14,
                color: theme.textSecondary,
                lineHeight: 20,
              }}
            >
              {t("settings.privacyBody")}
            </RNText>
            <RNPressable
              testID="settings-privacy-close-button"
              onPress={() => {
                void privacySheetRef.current?.dismiss();
              }}
              style={({ pressed }) => ({
                backgroundColor: pressed ? theme.primarySoft : theme.primary,
                borderRadius: Radius.card,
                borderCurve: "continuous",
                paddingVertical: Spacing.three,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
              })}
            >
              <RNText
                style={{
                  color: theme.onPrimary,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {t("common.done")}
              </RNText>
            </RNPressable>
          </RNView>
        ) : null}
      </TrueSheet>
    </>
  );
}
