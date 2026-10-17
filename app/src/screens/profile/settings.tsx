import { TrueSheet } from "@lodev09/react-native-true-sheet";
import Constants from "expo-constants";
import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from "react-native";
// oxlint-disable-next-line no-restricted-imports -- 设置页已是纯 RN 屏（没有 Host）：Expo UI 的 Switch 离开 Host 会丢 view config，只能用 RN Switch
import { Switch as RNSwitch } from "react-native";

import { SYMBOL_ICONS } from "@/components/icons";
import { RnDateTimePicker } from "@/components/rn-datetime-picker";
import { RnPicker } from "@/components/rn-picker";
import { SectionCard, SectionTitle } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { SymbolIcon, type SymbolIconName } from "@/components/symbol-icon";
import { BottomTabInset, Fonts, Radius, Spacing } from "@/constants/theme";
import { useMedicationExport } from "@/hooks/use-medication-export";
import { useTheme } from "@/hooks/use-theme";
import { LANGUAGE_LABELS, LANGUAGES, pickerFormat, useI18n } from "@/i18n";
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

/** 分组行内边距（design/settings.html 的 .setting-item padding 16px） */
const ROW_PADDING = Spacing.three;
/** 行首图标底块边长（.setting-icon 36px） */
const ICON_TILE = 36;
/** 行首图标字号（.setting-icon i 18px） */
const ICON_SIZE = 18;
/** 发丝线左缩进：让分隔线与文本列左缘对齐，不穿过图标底块 */
const DIVIDER_INSET = ROW_PADDING + ICON_TILE + Spacing.rowGap;

/**
 * 设置页：通用 / 提醒 / 数据 / 关于 四组。
 * 视觉基准 = design/settings.html（灰底页面 + 白卡片 + 左图标 + 右值/箭头）。
 *
 * 原实现用 `@expo/ui` 的 `FieldGroup`（iOS = SwiftUI Form）当整屏滚动容器，
 * 现改为纯 RN：`ScreenScaffold` + `SectionCard tone="outline"`。
 * `FieldGroup` / `List` 这类原生容器自身就是滚动容器，嵌进外层 `ScrollView`
 * 会塌成零高，迁成 RN 后这个坑自然消失。
 *
 * 行首图标保留品牌色底块（.setting-icon）以维持品牌感。
 * 每个开关都接真实的 store / 通知行为，没有假开关。
 *
 * 「语言」与「稍后提醒间隔」用行内单选（`RnPicker`：灰底胶囊触发器 + 原生菜单）。早年用 `@expo/ui` 的 universal `Picker`，它的 `appearance` 默认就是
 * `menu`，iOS 落成原生 Menu 胶囊：不吃 RN `style`，还必须住在 `Host` 里 —— 内容树
 * 迁纯 RN 后每颗都要额外背一座 `ExpoUiIsland`，所以换成 RN 实现。选项都只有两三个，
 * 单独一屏反而是绕路。
 *
 * 「免打扰」收成一行：关着时显示「关闭」，点整行进 sheet 改时间。
 * 以前是「开关 + 时间选择器」两行，开关一变行数就跳，列表会错位。
 */
export function Settings() {
  const theme = useTheme();
  const { t, language, setLanguage } = useI18n();
  const picker = pickerFormat(language);
  const exportReport = useMedicationExport();
  // 设置是单行表：这一屏只读这一份偏好
  const { data: settings, reload } = useSettings();
  const [permissionGranted, setPermissionGranted] = useState(true);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showQuietHours, setShowQuietHours] = useState(false);
  // 两个 sheet 都用 @lodev09/react-native-true-sheet（真原生 sheet：
  // iOS UISheetPresentationController / Android ModalBottomSheet）。
  // 命令式 present/dismiss，index={-1} 初始关闭。放在屏幕根，
  // 不再是 FieldGroup 的子节点
  const quietSheetRef = useRef<TrueSheet>(null);
  const privacySheetRef = useRef<TrueSheet>(null);

  const openQuietSheet = () => {
    setShowQuietHours(true);
    void quietSheetRef.current?.present(0);
  };

  const openPrivacySheet = () => {
    setShowPrivacy(true);
    void privacySheetRef.current?.present(0);
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
      <Stack.Title>{t("settings.title")}</Stack.Title>

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <RNView style={{ gap: Spacing.four }}>
          {/* ── 通用 ── */}
          <RNView>
            <SectionTitle>{t("settings.sectionGeneral")}</SectionTitle>
            <SectionCard tone="outline">
              <SettingRow
                icon={SYMBOL_ICONS.settingsLanguage}
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
          </RNView>

          {/* ── 提醒 ── */}
          <RNView>
            <SectionTitle>{t("settings.sectionReminder")}</SectionTitle>
            <SectionCard tone="outline">
              <SettingRow
                icon={SYMBOL_ICONS.settingsNotification}
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
                <RNText
                  style={{
                    paddingHorizontal: ROW_PADDING,
                    paddingBottom: ROW_PADDING,
                    fontSize: 12,
                    color: theme.danger,
                  }}
                >
                  {t("settings.permissionDenied")}
                </RNText>
              ) : null}
              <RowDivider />
              <SettingRow
                icon={SYMBOL_ICONS.settingsSnooze}
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
                icon={SYMBOL_ICONS.settingsQuiet}
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
                icon={SYMBOL_ICONS.settingsSound}
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
                icon={SYMBOL_ICONS.settingsMissed}
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
          </RNView>

          {/* ── 数据 ── */}
          <RNView>
            <SectionTitle>{t("settings.sectionData")}</SectionTitle>
            <SectionCard tone="outline">
              <SettingRow
                testID="settings-export-row"
                icon={SYMBOL_ICONS.settingsExport}
                label={t("settings.exportTitle")}
                sub={t("settings.exportSubtitle")}
                onPress={() => {
                  void exportReport();
                }}
                showChevron
              />
            </SectionCard>
          </RNView>

          {/* ── 关于（免责声明放分组下方） ── */}
          <RNView>
            <SectionTitle>{t("settings.sectionAbout")}</SectionTitle>
            <SectionCard tone="outline">
              <SettingRow
                testID="settings-privacy-row"
                icon={SYMBOL_ICONS.settingsPrivacy}
                label={t("settings.privacyTitle")}
                sub={t("settings.privacySub")}
                onPress={() => {
                  openPrivacySheet();
                }}
                showChevron
              />
              <RowDivider />
              <SettingRow
                icon={SYMBOL_ICONS.settingsVersion}
                label={t("settings.version")}
                trailing={
                  <RNText
                    style={{
                      fontSize: 13,
                      fontFamily: Fonts.mono,
                      color: theme.textSecondary,
                    }}
                  >
                    {Constants.expoConfig?.version ?? "1.0.0"}
                  </RNText>
                }
              />
            </SectionCard>
            <RNText
              style={{
                paddingTop: Spacing.three,
                paddingHorizontal: Spacing.two,
                fontSize: 13,
                lineHeight: 21,
                color: theme.textSecondary,
                textAlign: "center",
              }}
            >
              {t("settings.note")}
            </RNText>
          </RNView>
        </RNView>
      </ScreenScaffold>

      {/* 免打扰时段：时间选择器收在 sheet 里，主行因此不用跟着开关长出第二行。
          TrueSheet 是真原生 sheet，放屏幕根；内容是纯 RN 子树 */}
      <TrueSheet
        ref={quietSheetRef}
        detents={["auto", 0.6]}
        initialDetentIndex={-1}
        onDidDismiss={() => {
          setShowQuietHours(false);
        }}
      >
        {showQuietHours ? (
          <RNView
            style={{
              padding: 20,
              gap: 16,
            }}
          >
            <RNText
              style={{ fontSize: 17, fontWeight: "700", color: theme.text }}
            >
              {t("settings.quietTitle")}
            </RNText>
            <RNView
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <RNText style={{ fontSize: 15, color: theme.text }}>
                {t("settings.quietEnable")}
              </RNText>
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
            </RNView>
            {quietOn ? (
              <>
                <RNText style={{ fontSize: 13, color: theme.textSecondary }}>
                  {t("settings.quietSub")}
                </RNText>
                <RNView
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Spacing.two,
                  }}
                >
                  <RNText style={{ fontSize: 15, color: theme.text }}>
                    {t("settings.quietRange")}
                  </RNText>
                  <RNView style={{ flex: 1 }} />
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
                  <RNText style={{ color: theme.textSecondary }}>–</RNText>
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
                </RNView>
              </>
            ) : null}
            <RNPressable
              testID="settings-quiet-close-button"
              onPress={() => {
                void quietSheetRef.current?.dismiss();
              }}
              style={({ pressed }) => ({
                backgroundColor: pressed ? theme.primarySoft : theme.primary,
                borderRadius: Radius.card,
                borderCurve: "continuous",
                paddingVertical: Spacing.three,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
              })}
            >
              <RNText
                style={{
                  color: theme.onPrimary,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {t("common.done")}
              </RNText>
            </RNPressable>
          </RNView>
        ) : null}
      </TrueSheet>

      {/* 隐私说明：内容较长，用原生 sheet 而不是塞进分组行里展开 */}
      <TrueSheet
        ref={privacySheetRef}
        detents={["auto", 0.6]}
        initialDetentIndex={-1}
        onDidDismiss={() => {
          setShowPrivacy(false);
        }}
      >
        {showPrivacy ? (
          <RNView
            style={{
              padding: 20,
              gap: 12,
            }}
          >
            <RNText
              style={{ fontSize: 17, fontWeight: "700", color: theme.text }}
            >
              {t("settings.privacyTitle")}
            </RNText>
            <RNText
              style={{
                fontSize: 14,
                color: theme.textSecondary,
                lineHeight: 20,
              }}
            >
              {t("settings.privacyBody")}
            </RNText>
            <RNPressable
              testID="settings-privacy-close-button"
              onPress={() => {
                void privacySheetRef.current?.dismiss();
              }}
              style={({ pressed }) => ({
                backgroundColor: pressed ? theme.primarySoft : theme.primary,
                borderRadius: Radius.card,
                borderCurve: "continuous",
                paddingVertical: Spacing.three,
                alignItems: "center",
                justifyContent: "center",
                minHeight: 44,
              })}
            >
              <RNText
                style={{
                  color: theme.onPrimary,
                  fontSize: 15,
                  fontWeight: "600",
                }}
              >
                {t("common.done")}
              </RNText>
            </RNPressable>
          </RNView>
        ) : null}
      </TrueSheet>
    </>
  );
}

/**
 * 一行设置：图标 + 标题 / 副标题在左，控件在右。
 *
 * `onPress` 只给「导航行」：整行点击进下一层 / 开 sheet，右端是箭头或数值这类
 * 非交互内容。**控制行**（有 Switch / Picker）不给 `onPress` —— 否则外层手势会
 * 吞掉尾控件的点击，开关就点不动；控件自身接收点击即可。
 */
function SettingRow({
  icon,
  label,
  sub,
  trailing,
  onPress,
  disabled,
  showChevron,
  testID,
}: {
  icon: SymbolIconName;
  label: string;
  sub?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  /** 不可用：置灰且不响应点击。控件本身也各自 disabled */
  disabled?: boolean;
  /** 行尾画「可进入下一层」的箭头 */
  showChevron?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const labelColor = disabled ? theme.textSecondary : theme.text;

  const body = (
    <>
      <RNView
        style={{
          width: ICON_TILE,
          height: ICON_TILE,
          borderRadius: Radius.tile,
          backgroundColor: theme.primarySoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <SymbolIcon name={icon} size={ICON_SIZE} color={theme.primary} />
      </RNView>
      {/* 文本列让位（flex + minWidth 0）：长文案截断而不是把右端控件挤出屏幕 */}
      <RNView style={{ flex: 1, minWidth: 0, gap: Spacing.half }}>
        <RNText
          numberOfLines={1}
          style={{ fontSize: 17, fontWeight: "600", color: labelColor }}
        >
          {label}
        </RNText>
        {sub ? (
          <RNText style={{ fontSize: 13, color: theme.textSecondary }}>
            {sub}
          </RNText>
        ) : null}
      </RNView>
      {trailing}
      {showChevron ? (
        <SymbolIcon
          name={SYMBOL_ICONS.chevronRight}
          size={14}
          color={theme.textSecondary}
        />
      ) : null}
    </>
  );

  const rowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: Spacing.rowGap,
    paddingHorizontal: ROW_PADDING,
    paddingVertical: ROW_PADDING,
    minHeight: 44,
  };

  if (!onPress) {
    return (
      <RNView testID={testID} style={rowStyle}>
        {body}
      </RNView>
    );
  }
  return (
    <RNPressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        rowStyle,
        pressed ? { backgroundColor: theme.backgroundSelected } : null,
      ]}
    >
      {body}
    </RNPressable>
  );
}

/** 分组行之间的发丝线：与文本列左缘对齐，不穿过图标底块 */
function RowDivider() {
  const theme = useTheme();
  return (
    <RNView
      style={{
        height: 1,
        marginLeft: DIVIDER_INSET,
        backgroundColor: theme.border,
      }}
    />
  );
}

/** 行尾的等宽数值 + 展开箭头（design/settings.html 的 .setting-action） */
function ValueAndChevron({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <RNView
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.two,
      }}
    >
      <RNText
        style={{
          fontSize: 13,
          fontFamily: Fonts.mono,
          color: theme.textSecondary,
        }}
      >
        {text}
      </RNText>
      <SymbolIcon
        name={SYMBOL_ICONS.chevronRight}
        size={14}
        color={theme.textSecondary}
      />
    </RNView>
  );
}
