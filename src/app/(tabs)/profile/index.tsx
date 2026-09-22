import { FieldGroup, Host, ListItem, ScrollView } from "@expo/ui";
import { Stack, useRouter } from "expo-router";

import { useTheme } from "@/hooks/use-theme";

type SettingRow = {
  label: string;
  hint?: string;
  onPress?: () => void;
};

type SettingSection = {
  title: string;
  rows: SettingRow[];
};

export default function ProfileScreen() {
  const router = useRouter();
  const theme = useTheme();

  const sections: SettingSection[] = [
    {
      title: "账户与家庭",
      rows: [
        {
          label: "家庭成员管理",
          hint: "添加与管理用药人",
          onPress: () => {
            router.push("/(tabs)/profile/persons");
          },
        },
        { label: "我的信息", hint: "即将推出" },
      ],
    },
    {
      title: "提醒与通知",
      rows: [
        { label: "用药提醒", hint: "管理到点提醒" },
        { label: "补药提醒", hint: "库存不足时提醒" },
      ],
    },
    {
      title: "数据与隐私",
      rows: [
        { label: "数据备份", hint: "即将推出" },
        { label: "隐私设置", hint: "即将推出" },
      ],
    },
    {
      title: "更多",
      rows: [{ label: "关于我们", hint: "即将推出" }],
    },
  ];

  return (
    <>
      <Stack.Title large>设置</Stack.Title>
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <ScrollView
          style={{ padding: 16, paddingBottom: 32 }}
          showsIndicators={false}
        >
          <FieldGroup>
            {sections.map((section) => (
              <FieldGroup.Section key={section.title} title={section.title}>
                {section.rows.map((row) => (
                  <ListItem
                    key={row.label}
                    onPress={row.onPress}
                    supportingText={row.hint}
                  >
                    {row.label}
                  </ListItem>
                ))}
              </FieldGroup.Section>
            ))}
          </FieldGroup>
        </ScrollView>
      </Host>
    </>
  );
}
