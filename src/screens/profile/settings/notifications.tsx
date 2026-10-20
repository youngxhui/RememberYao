import { TrueSheet } from "@lodev09/react-native-true-sheet";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
// oxlint-disable-next-line no-restricted-imports -- 系统 Switch 自带设计语言，不套 Tamagui 外壳（原生控件不二次包装）
import { Switch as RNSwitch } from "react-native";
import { Text, View } from "tamagui";

import { RnDateTimePicker } from "@/components/rn-datetime-picker";
import { RnPicker } from "@/components/rn-picker";
import { SectionCard, SectionTitle } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import {
  RowDivider,
  ROW_PADDING,
  SettingRow,
  ValueAndChevron,
} from "@/components/setting-row";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { pickerFormat, useI18n } from "@/i18n";
import {
  isNotificationEnabled,
  requestNotificationPermission,
} from "@/lib/notifications";
import {
  DEFAULT_SETTINGS,
  SNOOZE_OPTIONS,
  dateToTime,
  setQuietHours,
  timeToDate,
  updateSettings,
  useSettings,
} from "@/lib/store";

/** 免打扰的默认区间：22:00–07:00（跨零点） */
const DEFAULT_QUIET_START = "22:00";
const DEFAULT_QUIET_END = "07:00";

/**
 * 二级屏 · 通知：总开关、稍后提醒间隔、免打扰时段、声音与震动、连续漏服提醒。
 *
 * 从原一屏平铺的设置页（`src/screens/profile/settings.tsx`，2026-10-17 拆分）搬来，
 * 免打扰的时段编辑收在 TrueSheet 里（主行因此不用跟着开关长出第二行，列表不会错位）。
 *
 * 权限是运行时才知道的：进屏拉一次 `isNotificationEnabled()`，开总闸前再确认一次
 * 系统权限 —— 否则用户会以为开关没生效。关总闸时下面四行一并置灰。
 */
export function SettingsNotifications() {
  const theme = useTheme();
  const { t, language } = useI18n();
  const picker = pickerFormat(language);
  // 设置是单行表：这一屏只读这一份偏好
  const { data: settings, reload } = useSettings();
  const [permissionGranted, setPermissionGranted] = useState(true);
  const [showQuietHours, setShowQuietHours] = useState(false);
  // 用 @lodev09/react-native-true-sheet（真原生 sheet：
  // iOS UISheetPresentationController / Android ModalBottomSheet）。
  // 命令式 present/dismiss，index={-1} 初始关闭。放在屏幕根，
  // 不再是 FieldGroup 的子节点
  const quietSheetRef = useRef<TrueSheet>(null);

  const openQuietSheet = () => {
    setShowQuietHours(true);
    void quietSheetRef.current?.present(0);
  };

  useFocusEffect(
    useCallback(() => {
      reload();
      void isNotificationEnabled().then(setPermissionGranted);
    }, [reload]),
  );

  /** 开总闸前先确保系统权限已授予，否则用户会以为开关没生效 */
  const toggleNotifications = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setPermissionGranted(false);
        await reload();
        return;
      }
    }
    await updateSettings({ notificationsEnabled: value });
    await reload();
  };

  const quietOn = settings.quietStart !== null && settings.quietEnd !== null;

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title>{t("settings.notificationsEntry")}</Stack.Title>

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <View>
          <SectionTitle>{t("settings.sectionReminder")}</SectionTitle>
          <SectionCard tone="outline">
            <SettingRow
              label={t("settings.notificationsTitle")}
              sub={t("settings.notificationsSub")}
              trailing={
                <RNSwitch
                  testID="settings-notifications-switch"
                  value={settings.notificationsEnabled}
                  trackColor={{
                    false: theme.border,
                    true: theme.primary,
                  }}
                  thumbColor={theme.surface}
                  onValueChange={(value) => {
                    void toggleNotifications(value);
                  }}
                />
              }
            />
            {!permissionGranted ? (
              <Text
                paddingInline={ROW_PADDING}
                paddingBottom={ROW_PADDING}
                fontSize={12}
                color="danger"
              >
                {t("settings.permissionDenied")}
              </Text>
            ) : null}
            <RowDivider />
            <SettingRow
              label={t("settings.snoozeTitle")}
              sub={t("settings.snoozeSub")}
              disabled={!settings.notificationsEnabled}
              trailing={
                <RnPicker
                  testID="settings-snooze-picker"
                  value={settings.snoozeMinutes}
                  options={SNOOZE_OPTIONS.map((minutes) => ({
                    label: t("settings.minutesValue", { count: minutes }),
                    value: minutes,
                  }))}
                  onValueChange={(value) => {
                    void updateSettings({ snoozeMinutes: Number(value) });
                  }}
                  disabled={!settings.notificationsEnabled}
                  menuTitle={t("settings.snoozeTitle")}
                />
              }
            />
            <RowDivider />
            <SettingRow
              testID="settings-quiet-row"
              label={t("settings.quietTitle")}
              sub={t("settings.quietSub")}
              disabled={!settings.notificationsEnabled}
              onPress={() => {
                openQuietSheet();
              }}
              trailing={
                <ValueAndChevron
                  text={
                    quietOn
                      ? `${settings.quietStart}–${settings.quietEnd}`
                      : t("settings.quietOff")
                  }
                />
              }
            />
            <RowDivider />
            <SettingRow
              label={t("settings.soundTitle")}
              sub={t("settings.soundSub")}
              disabled={!settings.notificationsEnabled}
              trailing={
                <RNSwitch
                  testID="settings-sound-switch"
                  value={settings.soundEnabled}
                  disabled={!settings.notificationsEnabled}
                  trackColor={{
                    false: theme.border,
                    true: theme.primary,
                  }}
                  thumbColor={theme.surface}
                  onValueChange={(value) => {
                    void updateSettings({ soundEnabled: value });
                  }}
                />
              }
            />
            <RowDivider />
            <SettingRow
              label={t("settings.notifyMissedTitle")}
              sub={t("settings.notifyMissedSub", {
                count: DEFAULT_SETTINGS.missedAlertStreak,
              })}
              trailing={
                <RNSwitch
                  testID="settings-missed-streak-switch"
                  value={settings.missedAlertStreak > 0}
                  trackColor={{
                    false: theme.border,
                    true: theme.primary,
                  }}
                  thumbColor={theme.surface}
                  onValueChange={(value) => {
                    void updateSettings({
                      missedAlertStreak: value
                        ? DEFAULT_SETTINGS.missedAlertStreak
                        : 0,
                    });
                  }}
                />
              }
            />
          </SectionCard>
        </View>
      </ScreenScaffold>

      {/* 免打扰时段：时间选择器收在 sheet 里，主行因此不用跟着开关长出第二行。
          TrueSheet 是真原生 sheet，放屏幕根；内容是 Tamagui 子树 */}
      <TrueSheet
        ref={quietSheetRef}
        detents={["auto", 0.6]}
        initialDetentIndex={-1}
        onDidDismiss={() => {
          setShowQuietHours(false);
        }}
      >
        {showQuietHours ? (
          <View padding={20} gap={16}>
            <Text fontSize={17} fontWeight="700" color="text">
              {t("settings.quietTitle")}
            </Text>
            <View
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Text fontSize={15} color="text">
                {t("settings.quietEnable")}
              </Text>
              <RNSwitch
                testID="settings-quiet-switch"
                value={quietOn}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor={theme.surface}
                onValueChange={(value) => {
                  void setQuietHours(
                    value ? DEFAULT_QUIET_START : null,
                    value ? DEFAULT_QUIET_END : null,
                  );
                }}
              />
            </View>
            {quietOn ? (
              <>
                <Text fontSize={13} color="textSecondary">
                  {t("settings.quietSub")}
                </Text>
                <View flexDirection="row" alignItems="center" gap="two">
                  <Text fontSize={15} color="text">
                    {t("settings.quietRange")}
                  </Text>
                  <View flex={1} />
                  <RnDateTimePicker
                    testID="settings-quiet-start"
                    value={timeToDate(
                      settings.quietStart ?? DEFAULT_QUIET_START,
                    )}
                    mode="time"
                    accentColor={theme.primary}
                    locale={picker.locale}
                    is24Hour={picker.is24Hour}
                    onValueChange={(date) => {
                      void setQuietHours(
                        dateToTime(date),
                        settings.quietEnd ?? DEFAULT_QUIET_END,
                      );
                    }}
                  />
                  <Text color="textSecondary">–</Text>
                  <RnDateTimePicker
                    testID="settings-quiet-end"
                    value={timeToDate(settings.quietEnd ?? DEFAULT_QUIET_END)}
                    mode="time"
                    accentColor={theme.primary}
                    locale={picker.locale}
                    is24Hour={picker.is24Hour}
                    onValueChange={(date) => {
                      void setQuietHours(
                        settings.quietStart ?? DEFAULT_QUIET_START,
                        dateToTime(date),
                      );
                    }}
                  />
                </View>
              </>
            ) : null}
            <View
              testID="settings-quiet-close-button"
              onPress={() => {
                void quietSheetRef.current?.dismiss();
              }}
              accessibilityRole="button"
              backgroundColor="primary press:primarySoft"
              borderRadius="card"
              borderCurve="continuous"
              paddingBlock="three"
              alignItems="center"
              justifyContent="center"
              minHeight={44}
            >
              <Text color="onPrimary" fontSize={15} fontWeight="600">
                {t("common.done")}
              </Text>
            </View>
          </View>
        ) : null}
      </TrueSheet>
    </>
  );
}
