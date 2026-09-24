import { Column, Host, ListItem, Row, ScrollView, Text } from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { type LayoutChangeEvent } from "react-native";

import {
  MiniArchiveSwiftUI,
  archiveEntryFromMedication,
} from "@/components/mini-archive";
import { useTheme } from "@/hooks/use-theme";
import { useAppData } from "@/lib/store";

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
  const { medications, reload } = useAppData();
  // Host 的 RN frame 会跟随窗口/折叠状态变化；onLayoutContent 则提供
  // SwiftUI 内容区的精确宽度。折叠时后者可能晚一帧，先取两者的较小值，
  // 避免旧的展开宽度把 Column 撑开，再等精确回调到达后恢复。
  const [hostFrameWidth, setHostFrameWidth] = useState(0);
  const [hostContentWidth, setHostContentWidth] = useState(0);
  const handleHostLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) {
      setHostFrameWidth((prev) => (prev === next ? prev : next));
    }
  }, []);
  const handleLayoutContent = useCallback(
    (event: { nativeEvent: { width: number } }) => {
      const next = Math.round(event.nativeEvent.width);
      if (next > 0) {
        setHostContentWidth((prev) => (prev === next ? prev : next));
      }
    },
    [],
  );
  const contentWidth =
    hostFrameWidth > 0 && hostContentWidth > 0
      ? Math.min(hostFrameWidth, hostContentWidth)
      : hostFrameWidth > 0
        ? hostFrameWidth
        : hostContentWidth;

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
      <Stack.Title large>设置</Stack.Title>
      <Host
        seedColor={theme.primary}
        style={{ flex: 1 }}
        onLayout={handleHostLayout}
        onLayoutContent={handleLayoutContent}
      >
        <ScrollView
          showsIndicators={false}
          style={{ paddingTop: 8, paddingBottom: 24 }}
        >
          <Column spacing={20}>
            <MiniArchiveSwiftUI
              containerWidth={contentWidth > 0 ? contentWidth : undefined}
              entries={medications.map(archiveEntryFromMedication)}
              onSelectEntry={(entry) => {
                router.push({
                  pathname: "/(tabs)/medica/detail",
                  params: { id: entry.id },
                });
              }}
            />
            {sections.map((section) => (
              <SettingSectionBlock key={section.title} section={section} />
            ))}
          </Column>
        </ScrollView>
      </Host>
    </>
  );
}

/** 设置分组：左侧强调条标题 + 圆角卡片行列表，对齐 design/settings.html */
function SettingSectionBlock({ section }: { section: SettingSection }) {
  const theme = useTheme();
  return (
    <Column spacing={8} style={{ paddingHorizontal: 16 }}>
      <Row alignment="center" spacing={8}>
        {/* SwiftUI 没有左 border，用带 frame 的空 Column 画 4×16 强调条 */}
        <Column
          style={{
            width: 4,
            height: 16,
            borderRadius: 2,
            backgroundColor: theme.primary,
          }}
        />
        <Text
          textStyle={{ fontSize: 17, fontWeight: "700", color: theme.text }}
        >
          {section.title}
        </Text>
      </Row>
      <Column
        style={{
          backgroundColor: theme.backgroundElement,
          borderRadius: 14,
        }}
      >
        {section.rows.map((row, index) => (
          <Column key={row.label}>
            {index > 0 ? (
              <Column
                style={{ height: 1, backgroundColor: theme.background }}
              />
            ) : null}
            <Column style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <SettingListItem row={row} />
            </Column>
          </Column>
        ))}
      </Column>
    </Column>
  );
}

function SettingListItem({ row }: { row: SettingRow }) {
  const theme = useTheme();
  return (
    <ListItem onPress={row.onPress}>
      <Text textStyle={{ fontSize: 16, color: theme.text }}>{row.label}</Text>
      {row.hint ? (
        <ListItem.Supporting>
          <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>
            {row.hint}
          </Text>
        </ListItem.Supporting>
      ) : null}
    </ListItem>
  );
}
