import { NativeTabs } from "expo-router/native-tabs";
import { useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === null ? "light" : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      tintColor={colors.primary}
      indicatorColor={colors.primarySoft}
    >
      <NativeTabs.Trigger name="(tabs)/home">
        <NativeTabs.Trigger.Label>今日</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="today" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(tabs)/medica">
        <NativeTabs.Trigger.Label>药箱</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "pills", selected: "pills.fill" }}
          md="medication"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="(tabs)/developer">
        <NativeTabs.Trigger.Label>开发者</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "pills", selected: "pills.fill" }}
          md="medication"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
