import { Column, Host, ListItem, Row, Spacer, Text } from "@expo/ui";
import { Stack } from "expo-router";

import { SymbolIcon } from "@/components/symbol-icon";
import { useTheme } from "@/hooks/use-theme";
import { LANGUAGES, LANGUAGE_LABELS, useI18n } from "@/i18n";

/** 语言选择：单独一个页面而不是折叠在设置行里，切换后能立刻看到效果 */
export default function LanguageScreen() {
  const theme = useTheme();
  const { t, language, setLanguage } = useI18n();

  return (
    <>
      <Stack.Title large>{t("settings.language")}</Stack.Title>
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <Column spacing={12} style={{ padding: 16 }}>
          <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>
            {t("settings.languageHint")}
          </Text>
          <Column
            style={{
              backgroundColor: theme.backgroundElement,
              borderRadius: 14,
            }}
          >
            {LANGUAGES.map((lang, index) => (
              <Column key={lang}>
                {index > 0 ? (
                  <Column
                    style={{ height: 1, backgroundColor: theme.background }}
                  />
                ) : null}
                <ListItem
                  testID={`language-option-${lang}`}
                  onPress={() => {
                    setLanguage(lang);
                  }}
                >
                  <Text textStyle={{ fontSize: 16, color: theme.text }}>
                    {LANGUAGE_LABELS[lang]}
                  </Text>
                  <ListItem.Supporting>
                    <Text
                      textStyle={{ fontSize: 13, color: theme.textSecondary }}
                    >
                      {lang === "zh"
                        ? t("settings.zhHint")
                        : t("settings.enHint")}
                    </Text>
                  </ListItem.Supporting>
                  {language === lang ? (
                    <Row alignment="center">
                      <Spacer />
                      <SymbolIcon
                        name="checkmark"
                        size={18}
                        color={theme.primary}
                      />
                      <Spacer />
                    </Row>
                  ) : null}
                </ListItem>
              </Column>
            ))}
          </Column>
        </Column>
      </Host>
    </>
  );
}
