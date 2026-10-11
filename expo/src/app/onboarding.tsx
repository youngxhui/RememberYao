import { Button, Column, Host, Icon, Row, Spacer, Text } from "@expo/ui";
import { useRouter } from "expo-router";
import { useState } from "react";

import {
  NativeOnboardingPager,
  nativeButtonModifiers,
  nativeLayout,
} from "@/components/native-layout";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation, type Path } from "@/i18n";
import { markOnboardingSeen } from "@/lib/onboarding";

// 标题/副标题存翻译键而不是文案本身：PAGES 在模块级，拿不到 hook 里的 t()
// （规范 28：屏幕/组件不直接 import 词典），所以推迟到组件内再 t()
const PAGES = [
  {
    value: "brand",
    icon: "capsule.fill",
    titleKey: "onboarding.page1Title",
    subtitleKey: "onboarding.page1Subtitle",
  },
  {
    value: "intro",
    icon: "cross.case.fill",
    titleKey: "onboarding.page2Title",
    subtitleKey: "onboarding.page2Subtitle",
  },
] as const satisfies ReadonlyArray<{
  value: string;
  icon: string;
  titleKey: Path;
  subtitleKey: Path;
}>;

export default function OnboardingScreen() {
  const theme = useTheme();
  const t = useTranslation();
  const router = useRouter();
  const [page, setPage] = useState<string>(PAGES[0].value);
  const isFirst = page === PAGES[0].value;
  const isLast = page === PAGES[PAGES.length - 1].value;

  const finish = async () => {
    await markOnboardingSeen();
    router.replace("/(tabs)/home");
  };

  const next = () => {
    if (isLast) {
      void finish();
    } else {
      setPage(PAGES[1].value);
    }
  };

  return (
    // 引导页在 tab 组之外，没有 tab 栏给的 tint，seedColor 让原生控件继续跟随品牌色
    <Host seedColor={theme.primary} style={{ flex: 1 }}>
      <Column modifiers={[nativeLayout({ fullWidth: true, fullHeight: true })]}>
        <Row style={{ padding: 16 }}>
          <Spacer />
          {/* @expo/ui 的 Text 在 iOS 上不落 accessibilityIdentifier（TextView.swift
              漏调 applyAccessibilityIdentifier），所以「跳过」给不了 testID，
              Maestro 只能按文案定位 */}
          {!isFirst ? (
            <Text
              textStyle={{ fontSize: 14, color: theme.textSecondary }}
              onPress={() => void finish()}
            >
              {t("onboarding.skip")}
            </Text>
          ) : null}
        </Row>

        <NativeOnboardingPager selection={page} onSelectionChange={setPage}>
          {PAGES.map((item) => (
            <NativeOnboardingPager.Tab key={item.value} value={item.value}>
              <Column
                alignment="center"
                spacing={20}
                modifiers={[
                  nativeLayout({ fullWidth: true, fullHeight: true }),
                ]}
              >
                <Spacer />
                <Column
                  alignment="center"
                  style={{
                    width: 128,
                    height: 128,
                    borderRadius: 32,
                    backgroundColor: theme.primarySoft,
                  }}
                >
                  <Spacer />
                  <Icon name={item.icon} size={60} color={theme.primary} />
                  <Spacer />
                </Column>
                <Text textStyle={{ fontSize: 26, fontWeight: "700" }}>
                  {t(item.titleKey)}
                </Text>
                <Text textStyle={{ fontSize: 14, color: theme.textSecondary }}>
                  {t(item.subtitleKey)}
                </Text>
                <Spacer />
              </Column>
            </NativeOnboardingPager.Tab>
          ))}
        </NativeOnboardingPager>

        <Column style={{ padding: 24 }}>
          {/* 文案在「下一步 / 开始使用」之间切换，测试靠 testID 稳定定位 */}
          <Button
            testID="onboarding-next-button"
            label={isLast ? t("onboarding.start") : t("onboarding.next")}
            onPress={next}
            modifiers={nativeButtonModifiers({
              style: "glassProminent",
              fullWidth: true,
            })}
          />
        </Column>
      </Column>
    </Host>
  );
}
