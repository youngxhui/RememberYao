import {
  BottomSheet,
  Button,
  Column,
  Host,
  Icon,
  ListItem,
  Picker,
  Row,
  ScrollView,
  Spacer,
  Switch,
  Text,
} from "@expo/ui";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import Constants from "expo-constants";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import {
  useCallback,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import { Fonts, Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { useI18n, useTranslation, type Language } from "@/i18n";
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
  type Person,
} from "@/lib/store";

/** 免打扰的默认区间：22:00–07:00（跨零点） */
const DEFAULT_QUIET_START = "22:00";
const DEFAULT_QUIET_END = "07:00";

/** 家庭成员副标题最多列出 3 个名字，再多就省略 */
const FAMILY_NAME_PREVIEW = 3;

type SettingIconName = ComponentProps<typeof Icon>["name"];

/**
 * 设置页：提醒 / 家庭照护 / 数据 / 关于 四组。
 * 视觉基准 = design/settings.html。
 *
 * 「我的」页只留四个入口，具体开关收在这里 —— 设置项会随版本变多，
 * 全堆在 tab 首页会把「我的」挤成一张设置清单，盖掉本周概览和家庭成员。
 *
 * 这一屏留在 Expo UI 原生树里：Switch / Picker / DateTimePicker / BottomSheet
 * 都是真原生控件，RN 的 Switch 已被 oxlint 禁用，手搓一个只会更不像。
 * 但分组容器没用系统的 Form —— Form 的 Section 是内嵌圆角分组样式，
 * 改不成设计稿的「描边卡片」，所以按 .settings-card 自己拼 Column，
 * 行内仍然用 ListItem 保住整行点击热区与按压反馈。
 *
 * 每个开关都接真实的 store / 通知行为，没有装饰性的假开关。
 */
export function Settings() {
  const theme = useTheme();
  const t = useTranslation();
  const { language } = useI18n();
  const router = useRouter();
  // 「我的」页的「隐私与数据」深链到这里：/settings?focus=privacy
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const { settings, persons, loading, reload } = useAppData();
  const [permissionGranted, setPermissionGranted] = useState(true);
  // 惰性初值而不是 effect：push 每次都新挂一个屏幕实例，进来就是要打开的状态；
  // 用 effect 的话用户手动关掉 sheet 后参数没变，sheet 还会被重新弹出来
  const [showPrivacy, setShowPrivacy] = useState(focus === "privacy");
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
        <ScrollView
          style={{ paddingTop: 8, paddingBottom: 32 }}
          showsIndicators={false}
        >
          <Column spacing={24}>
            {/* ── 提醒 ── */}
            <SettingsSection title={t("settings.sectionReminder")}>
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
                <Column style={{ padding: Spacing.three }}>
                  <Text textStyle={{ fontSize: 12, color: theme.danger }}>
                    {t("settings.permissionDenied")}
                  </Text>
                </Column>
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
            </SettingsSection>

            {/* ── 家庭照护 ── */}
            <SettingsSection title={t("settings.sectionCare")}>
              <SettingRow
                testID="settings-family-row"
                icon="person.2.fill"
                label={t("settings.familyTitle")}
                sub={
                  loading
                    ? t("common.loading")
                    : personNamesPreview(persons, language)
                }
                onPress={() => {
                  router.push("/(tabs)/profile/persons");
                }}
                trailing={
                  <ValueAndChevron
                    text={t("settings.familyCount", { count: persons.length })}
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
            </SettingsSection>

            {/* ── 数据 ── */}
            <SettingsSection title={t("settings.sectionData")}>
              <SettingRow
                testID="settings-export-row"
                icon="square.and.arrow.down"
                label={t("settings.exportTitle")}
                sub={t("settings.exportSubtitle")}
              />
              <SettingRow
                icon="heart.fill"
                label={t("settings.healthTitle")}
                sub={t("settings.healthSub")}
                trailing={
                  // 还没接 Apple Health：常显一个关着的开关，
                  // 让人以为「已经关了」，不如直接说明未开放
                  <Switch
                    testID="settings-health-switch"
                    value={false}
                    disabled
                    onValueChange={() => {}}
                  />
                }
              />
            </SettingsSection>

            {/* ── 关于 ── */}
            <SettingsSection
              title={t("settings.sectionAbout")}
              // 设计稿把免责声明放在「关于」卡片之后，不在卡片里
              footer={
                <Text
                  style={{ paddingTop: Spacing.two }}
                  textStyle={{
                    fontSize: 13,
                    lineHeight: 21,
                    color: theme.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {t("settings.note")}
                </Text>
              }
            >
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
            </SettingsSection>
          </Column>
        </ScrollView>

        {/* 免打扰时段：时间选择器收在 sheet 里，主行因此不用跟着开关长出第二行 */}
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
                <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>
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
                    value={timeToDate(settings.quietEnd ?? DEFAULT_QUIET_END)}
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

        {/* 隐私说明：内容较长，用原生 sheet 而不是塞进分组行里展开 */}
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
      </Host>
    </>
  );
}

/**
 * 一个设置分组：左侧强调条标题 + 一张描边卡片。
 * 对齐 design/settings.html 的 .settings-section / .settings-card。
 *
 * 卡片自己拼而不用系统的 Form：Form 的 Section 是内嵌圆角分组，改不成
 * 「白底 + 1px 描边 + 18px 圆角」。行仍然交给 ListItem，整行点击热区
 * 与按压反馈都在，只是热区被 16px 内边距收进来一点。
 * 圆角没配 borderCurve、也没写 overflow：borderRadius 在 iOS 上已经转成
 * clipShape，而这两项 universal style 都不支持（纯 RN 树才有）。
 */
function SettingsSection({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  /** 卡片下面的说明文字（设计稿只用在「关于」的免责声明） */
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const rows = Array.isArray(children) ? children : [children];

  return (
    <Column spacing={Spacing.two} style={{ paddingHorizontal: Spacing.screen }}>
      <SectionTitle title={title} />
      {/* borderRadius 在 iOS 上会转成 clipShape，卡片自带圆角裁剪，
          所以不需要（universal style 也不支持）overflow: hidden */}
      <Column
        style={{
          borderRadius: Radius.card,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        {rows.map((row, index) => (
          // eslint-disable-next-line -- 位置即身份：分组内不会重排
          <Column key={index}>
            {index > 0 ? <HairLine /> : null}
            {row}
          </Column>
        ))}
      </Column>
      {footer}
    </Column>
  );
}

/** 分组标题：左侧 4px 强调条 + 17px 标题（SwiftUI 没有 border-left） */
function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Row alignment="center" spacing={8} style={{ paddingLeft: 10 }}>
      <Column
        style={{
          width: 4,
          height: 16,
          borderRadius: 2,
          backgroundColor: theme.primary,
        }}
      />
      <Text textStyle={{ fontSize: 17, fontWeight: "700", color: theme.text }}>
        {title}
      </Text>
    </Row>
  );
}

/** 卡片内的行间发丝线，通栏（对齐设计稿的 border-bottom） */
function HairLine() {
  const theme = useTheme();
  return <Column style={{ height: 1, backgroundColor: theme.border }} />;
}

/** 家庭成员副标题：列出真实成员名，超过 3 个省略。分隔符跟着语言走 */
function personNamesPreview(persons: Person[], language: Language): string {
  if (persons.length === 0) return "";
  const names = persons
    .slice(0, FAMILY_NAME_PREVIEW)
    .map((person) => person.name);
  const separator = language === "zh" ? "、" : ", ";
  return persons.length > FAMILY_NAME_PREVIEW
    ? `${names.join(separator)}…`
    : names.join(separator);
}

/**
 * 一行设置：图标 + 标题 / 副标题在左，控件在右。
 *
 * 用 ListItem 而不是自己拼 Row：它自带整行点击热区（contentShape）和按压反馈。
 * leading 槽位交给 ListItem 是因为它在 iOS 上会把 accessory 包进
 * `RNHostView matchContents`，纯 SwiftUI 子节点（这里是 Icon）按固有尺寸渲染。
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
  return (
    // 16px 内边距落在 ListItem 外面：行内还要塞原生 Switch / Picker，
    // 放进 universal style 只会和控件自己的内边距叠起来
    <Column style={{ padding: Spacing.three }}>
      <ListItem
        testID={testID}
        leading={<SettingIcon name={icon} />}
        // 不可用时干脆不给 onPress：原生行就不会有按压反馈，
        // 比"传了但什么都不做"更符合用户预期
        onPress={disabled ? undefined : onPress}
        supportingText={
          sub ? (
            <Text textStyle={{ fontSize: 13, color: theme.textSecondary }}>
              {sub}
            </Text>
          ) : undefined
        }
        trailing={trailing}
      >
        <Text
          textStyle={{
            fontSize: 17,
            fontWeight: "600",
            color: disabled ? theme.textSecondary : theme.text,
          }}
        >
          {label}
        </Text>
      </ListItem>
    </Column>
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
