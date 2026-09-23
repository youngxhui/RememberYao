import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import {
  Pressable,
  ScrollView as RNScrollView,
  Text as RNText,
  useWindowDimensions,
  View as RNView,
  View,
} from "react-native";

import {
  MiniArchive,
  archiveEntryFromMedication,
} from "@/components/mini-archive";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useAppData } from "@/lib/store";
import { SafeAreaView } from "react-native-safe-area-context";

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
  const { width } = useWindowDimensions();
  const { medications, loading, reload } = useAppData();
  // iPhone Duo 内屏宽 669pt，横向是 regular。这种宽度下大标题不会收进导航栏，会跟着滚走。
  const largeTitle = width < 600;

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

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
      <RNScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          {!loading ? (
            <MiniArchive
              entries={medications.map(archiveEntryFromMedication)}
              onSelectEntry={(entry) => {
                router.push({
                  pathname: "/(tabs)/medica/detail",
                  params: { id: entry.id },
                });
              }}
            />
          ) : null}
          <SafeAreaView edges={["left", "right", "bottom"]}>

          <View style={{ padding: 16 }}>


            {sections.map((section) => (
              <RNView key={section.title}>
                <RNText
                  style={{
                    marginBottom: Spacing.two,
                    paddingLeft: Spacing.two,
                    borderLeftWidth: 4,
                    borderLeftColor: theme.primary,
                    color: theme.text,
                    fontSize: 17,
                    fontWeight: "700",
                  }}
                >
                  {section.title}
                </RNText>
                <RNView
                  style={{
                    backgroundColor: theme.backgroundElement,
                    borderRadius: 14,
                    borderCurve: "continuous",
                    overflow: "hidden",
                  }}
                >
                  {section.rows.map((row, index) => (
                    <Pressable
                      key={row.label}
                      disabled={!row.onPress}
                      onPress={row.onPress}
                      style={{
                        padding: Spacing.three,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: theme.background,
                      }}
                    >
                      <RNText style={{ color: theme.text, fontSize: 16 }}>
                        {row.label}
                      </RNText>
                      {row.hint ? (
                        <RNText
                          style={{
                            marginTop: Spacing.half,
                            color: theme.textSecondary,
                            fontSize: 13,
                          }}
                        >
                          {row.hint}
                        </RNText>
                      ) : null}
                    </Pressable>
                  ))}
                </RNView>
              </RNView>
            ))}
          </View>
        </SafeAreaView>
      </RNScrollView>
      <Stack.Title large={largeTitle}>设置</Stack.Title>
    </>
  );
}
