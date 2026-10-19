import { Stack, useRouter } from "expo-router";
import { View as RNView } from "react-native";

import { HUGI_ICONS } from "@/components/huge-icon";
import { SectionCard } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { SettingRow } from "@/components/setting-row";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useI18n } from "@/i18n";

/**
 * 设置根屏：通用 / 通知 / 关于 三个入口，各推进一层二级屏。
 *
 * 2026-10-17 之前这里是一屏平铺四组（通用 / 提醒 / 数据 / 关于）全部控件，
 * 一屏 11 行滑不到底。按开发者要求改成两级：根屏只留三个分区入口，
 * 具体控件搬到 `general` / `notifications` / `about` 三个二级屏
 * （`src/app/(tabs)/profile/settings/*.tsx`）。
 *
 * 三个入口**各自一张白卡片**（同日开发者要求「一级菜单分组」）—— 之前三行挤在
 * 同一张卡片里，行间发丝线把它们读成一段而不是三个可点的入口。卡片间距
 * `Spacing.four`（24px）= design/settings.html 的 `.settings-group` 下外边距。
 * 每张卡片只有一行，所以没有 `RowDivider`。
 *
 * 入口行**不带描述副标题**（同日开发者要求）：一级只承担「这是什么分区」，
 * 描述写在二级屏里，一级越短越好认。行组件本身仍支持 `sub`。
 *
 * 四个屏在路由层是**平级**的（settings/ 目录没有 _layout.tsx）：Stack 里嵌 Stack 会出
 * 两层导航栏，所以设置这一族不走 `medica/` 那种「目录自带 _layout」的写法 —— medica 的
 * 嵌套 Stack 外面是 NativeTabs（只有 tab 栏没有导航栏），profile 外面是 Stack，会撞车。
 *
 * 视觉基准仍是 design/settings.html（灰底页面 + 白卡片 + 左图标 + 右箭头）。
 */
export function SettingsIndex() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title>{t("settings.title")}</Stack.Title>

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <RNView style={{ gap: Spacing.four }}>
          <SectionCard tone="outline">
            <SettingRow
              testID="settings-general-row"
              icon={HUGI_ICONS.settingsGeneral}
              label={t("settings.generalEntry")}
              onPress={() => {
                router.push("/profile/settings/general");
              }}
              showChevron
            />
          </SectionCard>

          <SectionCard tone="outline">
            <SettingRow
              testID="settings-notifications-row"
              icon={HUGI_ICONS.settingsNotification}
              label={t("settings.notificationsEntry")}
              onPress={() => {
                router.push("/profile/settings/notifications");
              }}
              showChevron
            />
          </SectionCard>

          <SectionCard tone="outline">
            <SettingRow
              testID="settings-about-row"
              icon={HUGI_ICONS.settingsVersion}
              label={t("settings.aboutEntry")}
              onPress={() => {
                router.push("/profile/settings/about");
              }}
              showChevron
            />
          </SectionCard>

          {/* RememberYao Pro：订阅状态 + 付费墙入口。独立一张卡 ——
              它不是设置项，是商业化入口，不该和三个设置分区读成一组 */}
          <SectionCard tone="outline">
            <SettingRow
              testID="settings-pro-row"
              icon={HUGI_ICONS.settingsPro}
              label={t("pro.title")}
              onPress={() => {
                router.push("/profile/pro");
              }}
              showChevron
            />
          </SectionCard>
        </RNView>
      </ScreenScaffold>
    </>
  );
}
