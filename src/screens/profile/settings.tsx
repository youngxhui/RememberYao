import {
  BottomSheet,
  Button,
  Column,
  FieldGroup,
  Host,
  Icon,
  Picker,
  Row,
  Spacer,
  Switch,
  Text,
} from "@expo/ui";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import Constants from "expo-constants";
import { Stack, useFocusEffect } from "expo-router";
import {
  useCallback,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useMedicationExport } from "@/hooks/use-medication-export";
import { useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/i18n";
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
  useAppData,
} from "@/lib/store";

/** 免打扰的默认区间：22:00–07:00（跨零点） */
const DEFAULT_QUIET_START = "22:00";
const DEFAULT_QUIET_END = "07:00";

type SettingIconName = ComponentProps<typeof Icon>["name"];

/**
 * 设置页：提醒 / 家庭照护 / 数据 / 关于 四组。
 * 视觉基准 = design/settings.html。
 *
 * 分组容器用 `@expo/ui` 的 `FieldGroup`（iOS = SwiftUI Form）—— 与同栈的
 * plan-form、persons 同一套写法；分组标题走原生 `FieldGroup.Section title`，
 * 行用统一的 `Row` 自己排布（[图标] 文本 …弹性空白… [右端控件]），行内边距、分组
 * 圆角与分隔线交给原生表单，不再自己拼描边卡片。
 *
 * ⚠️ `FieldGroup` 自身就是滚动容器，**不要再套外层 `ScrollView`**：Sections 里
 * 嵌进去会塌成零高（项目已记录的真机 bug）。
 *
 * 行首图标保留品牌色底块（design 的 .setting-icon）以维持品牌感；Switch /
 * Picker / DateTimePicker 都是真原生控件 —— RN 的 Switch 已被 oxlint 禁用，
 * 手搓一个只会更不像。每个开关都接真实的 store / 通知行为，没有假开关。
 */
export function Settings() {
  const theme = useTheme();
  const t = useTranslation();
  const exportReport = useMedicationExport();
  const { settings, reload } = useAppData();
  const [permissionGranted, setPermissionGranted] = useState(true);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showQuietHours, setShowQuietHours] = useState(false);

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
      <Stack.Title large>{t("settings.title")}</Stack.Title>
      <Host seedColor={theme.primary} style={{ flex: 1 }}>
        <FieldGroup>
          {/* ── 提醒 ── */}
          <FieldGroup.Section title={t("settings.sectionReminder")}>
            <SettingRow
              icon="bell.fill"
              label={t("settings.notificationsTitle")}
              sub={t("settings.notificationsSub")}
              trailing={
                <Switch
                  testID="settings-notifications-switch"
                  value={settings.notificationsEnabled}
                  onValueChange={(value) => {
                    void toggleNotifications(value);
                  }}
                />
              }
            />
            {!permissionGranted ? (
              <Text
                style={{ paddingHorizontal: Spacing.three }}
                textStyle={{ fontSize: 12, color: theme.danger }}
              >
                {t("settings.permissionDenied")}
              </Text>
            ) : null}
            <SettingRow
              icon="alarm.fill"
              label={t("settings.snoozeTitle")}
              sub={t("settings.snoozeSub")}
              disabled={!settings.notificationsEnabled}
              trailing={
                <Picker
                  testID="settings-snooze-picker"
                  selectedValue={settings.snoozeMinutes}
                  enabled={settings.notificationsEnabled}
                  onValueChange={(value) => {
                    void updateSettings({ snoozeMinutes: Number(value) });
                  }}
                >
                  {SNOOZE_OPTIONS.map((minutes) => (
                    <Picker.Item
                      key={minutes}
                      label={t("settings.minutesValue", { count: minutes })}
                      value={minutes}
                    />
                  ))}
                </Picker>
              }
            />
            {/* 免打扰收成一行：关着时显示「关闭」，点整行进 sheet 改时间。
                  以前是「开关 + 时间选择器」两行，开关一变行数就跳，列表会错位 */}
            <SettingRow
              testID="settings-quiet-row"
              icon="moon.fill"
              label={t("settings.quietTitle")}
              sub={t("settings.quietSub")}
              disabled={!settings.notificationsEnabled}
              onPress={() => {
                setShowQuietHours(true);
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
            <SettingRow
              icon="speaker.wave.2.fill"
              label={t("settings.soundTitle")}
              sub={t("settings.soundSub")}
              disabled={!settings.notificationsEnabled}
              trailing={
                <Switch
                  testID="settings-sound-switch"
                  value={settings.soundEnabled}
                  disabled={!settings.notificationsEnabled}
                  onValueChange={(value) => {
                    void updateSettings({ soundEnabled: value });
                  }}
                />
              }
            />
            <SettingRow
              icon="exclamationmark.triangle.fill"
              label={t("settings.notifyMissedTitle")}
              sub={t("settings.notifyMissedSub", {
                count: DEFAULT_SETTINGS.missedAlertStreak,
              })}
              trailing={
                <Switch
                  testID="settings-missed-streak-switch"
                  value={settings.missedAlertStreak > 0}
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
          </FieldGroup.Section>

          {/* ── 数据 ── */}
          <FieldGroup.Section title={t("settings.sectionData")}>
            <SettingRow
              testID="settings-export-row"
              icon="square.and.arrow.down"
              label={t("settings.exportTitle")}
              sub={t("settings.exportSubtitle")}
              onPress={() => {
                void exportReport();
              }}
            />
          </FieldGroup.Section>

          {/* ── 关于（免责声明放分组脚注） ── */}
          <FieldGroup.Section title={t("settings.sectionAbout")}>
            <SettingRow
              testID="settings-privacy-row"
              icon="checkmark.shield.fill"
              label={t("settings.privacyTitle")}
              sub={t("settings.privacySub")}
              onPress={() => {
                setShowPrivacy(true);
              }}
              trailing={<Chevron />}
            />
            <SettingRow
              icon="info.circle.fill"
              label={t("settings.version")}
              trailing={
                <Text
                  textStyle={{
                    fontSize: 13,
                    fontFamily: Fonts.mono,
                    color: theme.textSecondary,
                  }}
                >
                  {Constants.expoConfig?.version ?? "1.0.0"}
                </Text>
              }
            />
            <FieldGroup.SectionFooter>
              <Text
                textStyle={{
                  fontSize: 13,
                  lineHeight: 21,
                  color: theme.textSecondary,
                  textAlign: "center",
                }}
              >
                {t("settings.note")}
              </Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
          {/* 免打扰时段：时间选择器收在 sheet 里，主行因此不用跟着开关长出第二行。
            ⚠️ 必须作为 FieldGroup 的子节点：BottomSheet 内嵌一个绝对定位的 Host，
            若和 FieldGroup 同级挂在 Host 下（Host 变多子节点）会让整屏手势失效。 */}
          {showQuietHours ? (
            <BottomSheet
              isPresented={showQuietHours}
              onDismiss={() => {
                setShowQuietHours(false);
              }}
            >
              <Column spacing={16} style={{ padding: 20 }}>
                <Text textStyle={{ fontSize: 17, fontWeight: "700" }}>
                  {t("settings.quietTitle")}
                </Text>
                <Switch
                  testID="settings-quiet-switch"
                  label={t("settings.quietEnable")}
                  value={quietOn}
                  onValueChange={(value) => {
                    void setQuietHours(
                      value ? DEFAULT_QUIET_START : null,
                      value ? DEFAULT_QUIET_END : null,
                    );
                  }}
                />
                {quietOn ? (
                  <>
                    <Text
                      textStyle={{ fontSize: 13, color: theme.textSecondary }}
                    >
                      {t("settings.quietSub")}
                    </Text>
                    <Row alignment="center">
                      <Text>{t("settings.quietRange")}</Text>
                      <Spacer flexible />
                      <DateTimePicker
                        testID="settings-quiet-start"
                        value={timeToDate(
                          settings.quietStart ?? DEFAULT_QUIET_START,
                        )}
                        mode="time"
                        display="compact"
                        is24Hour
                        onValueChange={(_, date) => {
                          void setQuietHours(
                            dateToTime(date),
                            settings.quietEnd ?? DEFAULT_QUIET_END,
                          );
                        }}
                      />
                      <Text textStyle={{ color: theme.textSecondary }}>–</Text>
                      <DateTimePicker
                        testID="settings-quiet-end"
                        value={timeToDate(
                          settings.quietEnd ?? DEFAULT_QUIET_END,
                        )}
                        mode="time"
                        display="compact"
                        is24Hour
                        onValueChange={(_, date) => {
                          void setQuietHours(
                            settings.quietStart ?? DEFAULT_QUIET_START,
                            dateToTime(date),
                          );
                        }}
                      />
                    </Row>
                  </>
                ) : null}
                <Button
                  testID="settings-quiet-close-button"
                  label={t("common.done")}
                  onPress={() => {
                    setShowQuietHours(false);
                  }}
                />
              </Column>
            </BottomSheet>
          ) : null}

          {/* 隐私说明：内容较长，用原生 sheet 而不是塞进分组行里展开 */}
          {showPrivacy ? (
            <BottomSheet
              isPresented={showPrivacy}
              onDismiss={() => {
                setShowPrivacy(false);
              }}
            >
              <Column spacing={12} style={{ padding: 20 }}>
                <Text textStyle={{ fontSize: 17, fontWeight: "700" }}>
                  {t("settings.privacyTitle")}
                </Text>
                <Text textStyle={{ fontSize: 14, color: theme.textSecondary }}>
                  {t("settings.privacyBody")}
                </Text>
                <Button
                  testID="settings-privacy-close-button"
                  label={t("common.done")}
                  onPress={() => {
                    setShowPrivacy(false);
                  }}
                />
              </Column>
            </BottomSheet>
          ) : null}
        </FieldGroup>
      </Host>
    </>
  );
}

/**
 * 一行设置：图标 + 标题 / 副标题在左，控件在右，统一 `Row` 排布。
 *
 * 不用 `ListItem`：它是 iOS 的 `Button(contentShape)`，整行包住会把右端 Switch /
 * Picker 的点击吞掉（开关点不动）。这里用普通 `Row`：**导航行**才给 `Row` 设
 * `onPress`（整行进下一页 / 开 sheet，右端是箭头这类非交互内容）；**控制行**不给
 * `onPress`，让 Switch / Picker 自己接收点击。
 */
function SettingRow({
  icon,
  label,
  sub,
  trailing,
  onPress,
  disabled,
  testID,
}: {
  icon: SettingIconName;
  label: string;
  sub?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  /** 不可用：置灰且不响应点击。控件本身也各自 disabled */
  disabled?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const labelColor = disabled ? theme.textSecondary : theme.text;
  const subtitle = sub ? (
    <Text
      textStyle={{
        fontSize: 13,
        color: theme.textSecondary,
        textAlign: "left",
      }}
    >
      {sub}
    </Text>
  ) : null;

  // 所有行统一一套布局：[图标] 文本 …弹性空白… [右端控件]。
  // 图标与文本相邻，右端（开关 / 选择器 / 箭头 / 数值）由中间弹性空隙推到行尾，
  // 每行对齐一致，不再一半行文本贴图标、一半被推到中间。
  //
  // onPress 只给「导航行」：整行点击进下一页 / 开 sheet，右端是箭头这类非交互内容。
  // 控制行（有 Switch / Picker）**不给 Row 设 onPress** —— 否则 Row 的手势会吞掉
  // 尾控件的点击（ListItem / Button 同理），开关就点不动；控件自身接收点击即可。
  return (
    <Row
      testID={testID}
      alignment="center"
      spacing={Spacing.rowGap}
      onPress={disabled ? undefined : onPress}
    >
      <SettingIcon name={icon} />
      {/* 文本列不撑满（撑满会把文字居中）：贴着图标按内容宽排布，右端控件由
          Spacer 推到行尾。与 ListItem 内部结构一致（leading / VStack / Spacer /
          trailing），VStack 被 Spacer + 控件约束，长文案自然截断。 */}
      <Column alignment="start" spacing={Spacing.half}>
        <Text
          numberOfLines={1}
          textStyle={{
            fontSize: 17,
            fontWeight: "600",
            color: labelColor,
            textAlign: "left",
          }}
        >
          {label}
        </Text>
        {subtitle}
      </Column>
      <Spacer flexible />
      {trailing}
    </Row>
  );
}

/** 行首图标：36px 品牌色底块 + 18px 线性图标（design 的 .setting-icon） */
function SettingIcon({ name }: { name: SettingIconName }) {
  const theme = useTheme();
  return (
    <Icon
      name={name}
      size={18}
      color={theme.primary}
      style={{
        width: 36,
        height: 36,
        borderRadius: Radius.tile,
        backgroundColor: theme.primarySoft,
      }}
    />
  );
}

/** 行尾的等宽数值 + 展开箭头（design 的 .setting-action） */
function ValueAndChevron({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Row alignment="center" spacing={6}>
      <Text
        textStyle={{
          fontSize: 13,
          fontFamily: Fonts.mono,
          color: theme.textSecondary,
        }}
      >
        {text}
      </Text>
      <Chevron />
    </Row>
  );
}

function Chevron() {
  const theme = useTheme();
  return <Icon name="chevron.down" size={14} color={theme.textSecondary} />;
}
