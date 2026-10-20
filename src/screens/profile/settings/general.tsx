import { Stack } from "expo-router";
import { View } from "tamagui";

import { RnPicker } from "@/components/rn-picker";
import { SectionCard, SectionTitle } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { SettingRow } from "@/components/setting-row";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useMedicationExport } from "@/hooks/use-medication-export";
import { LANGUAGE_LABELS, LANGUAGES, useI18n } from "@/i18n";

/**
 * 二级屏 · 通用：语言 + 导出报告。
 *
 * 从原一屏平铺的设置页（`src/screens/profile/settings.tsx`，2026-10-17 拆分）搬来。
 * 「语言」用行内单选（`RnPicker`：灰底胶囊触发器 + 原生菜单）—— 早年用 `@expo/ui` 的
 * universal `Picker`，它的 `appearance` 默认就是 `menu`，iOS 落成原生 Menu 胶囊：
 * 不吃 RN `style`，还必须住在 `Host` 里，内容树迁纯 RN 后每颗都要额外背一座岛。
 * 选项只有两三个，单独一屏反而是绕路。
 */
export function SettingsGeneral() {
  const { t, language, setLanguage } = useI18n();
  const exportReport = useMedicationExport();

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title>{t("settings.generalEntry")}</Stack.Title>

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <View gap="three">
          <View>
            <SectionTitle>{t("settings.sectionGeneral")}</SectionTitle>
            <SectionCard tone="outline">
              <SettingRow
                label={t("settings.language")}
                sub={t("settings.languageSub")}
                trailing={
                  <RnPicker
                    testID="settings-language-picker"
                    value={language}
                    options={LANGUAGES.map((lang) => ({
                      label: LANGUAGE_LABELS[lang],
                      value: lang,
                    }))}
                    onValueChange={(value) => {
                      setLanguage(value);
                    }}
                    menuTitle={t("settings.language")}
                  />
                }
              />
            </SectionCard>
          </View>

          <View>
            <SectionTitle>{t("settings.sectionData")}</SectionTitle>
            <SectionCard tone="outline">
              <SettingRow
                testID="settings-export-row"
                label={t("settings.exportTitle")}
                sub={t("settings.exportSubtitle")}
                onPress={() => {
                  void exportReport();
                }}
                showChevron
              />
            </SectionCard>
          </View>
        </View>
      </ScreenScaffold>
    </>
  );
}
