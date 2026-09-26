import { Button, Column, Host, Icon, Row, Spacer, Text } from "@expo/ui";
import { useRouter } from "expo-router";
import { useState } from "react";

import {
  NativeOnboardingPager,
  nativeButtonModifiers,
  nativeLayout,
} from "@/components/native-layout";
import { useTheme } from "@/hooks/use-theme";
import { markOnboardingSeen } from "@/lib/onboarding";

const PAGES = [
  {
    value: "brand",
    icon: "capsule.fill",
    title: "用药提醒",
    subtitle: "按时吃药 · 守护健康",
  },
  {
    value: "intro",
    icon: "cross.case.fill",
    title: "轻松管理家庭用药",
    subtitle: "支持多成员、多药品、智能提醒，让家人用药更安心",
  },
] as const;

export default function OnboardingScreen() {
  const theme = useTheme();
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
    <Host style={{ flex: 1 }}>
      <Column modifiers={[nativeLayout({ fullWidth: true, fullHeight: true })]}>
        <Row style={{ padding: 16 }}>
          <Spacer />
          {!isFirst ? (
            <Text
              textStyle={{ fontSize: 14, color: theme.textSecondary }}
              onPress={() => void finish()}
            >
              跳过
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
                  {item.title}
                </Text>
                <Text textStyle={{ fontSize: 14, color: theme.textSecondary }}>
                  {item.subtitle}
                </Text>
                <Spacer />
              </Column>
            </NativeOnboardingPager.Tab>
          ))}
        </NativeOnboardingPager>

        <Column style={{ padding: 24 }}>
          <Button
            label={isLast ? "开始使用" : "下一步"}
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
