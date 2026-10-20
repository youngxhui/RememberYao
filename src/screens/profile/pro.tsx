import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Button, Text, View, XStack } from "tamagui";

import { ExternalLink } from "@/components/external-link";
import { SYMBOL_ICONS } from "@/components/icons";
import { SectionCard, SectionTitle } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { RowDivider, SettingRow } from "@/components/setting-row";
import { SymbolIcon } from "@/components/symbol-icon";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useSubscription } from "@/hooks/use-subscription";
import { useTheme } from "@/hooks/use-theme";
import {
  pickerFormat,
  useI18n,
  useTranslation,
  type Path,
  type Translate,
} from "@/i18n";
import {
  PRO_ENTITLEMENT_ID,
  presentCustomerCenter,
  presentProPaywall,
  restorePurchases,
  type PurchaseFailureCode,
} from "@/lib/revenuecat";

/**
 * 服务条款 / 隐私政策链接。
 * App Store 审核要求购买入口可触达这两份文档（3.1.1 / 5.1.1），
 * **上线前必须换成真实地址** —— RevenueCat 付费墙里的链接在后台单独配。
 */
const PRO_TERMS_URL = "https://example.com/terms";
const PRO_PRIVACY_URL = "https://example.com/privacy";

/** 屏幕顶部的提示条：购买结果 / 失败原因 */
type Notice = { tone: "success" | "error"; text: string };

/**
 * 二级屏 · RememberYao Pro：订阅状态 + 升级入口。
 *
 * 从「设置」根屏第四个分区入口推进来（`/profile/pro`，平级挂在 profile
 * Stack 下，和 settings 一族一样不自带 _layout —— Stack 里嵌 Stack 会出
 * 双层导航栏）。
 *
 * 购买入口只有一个：「升级」按钮弹 **RevenueCat 远程付费墙**
 * （`presentProPaywall`）—— 商品、价格、文案、样式全在 RevenueCat 后台配，
 * 改什么都不用发版；购买与恢复都在墙内由 SDK 完成，App 不自己渲染商品列表、
 * 不自己调 purchasePackage。
 *
 * 已开通时不显示升级入口，只留「管理订阅」（Customer Center：换档 / 取消 /
 * 退款）—— 让用户自助，省客服工单。
 */
export function ProScreen() {
  const t = useTranslation();
  const { language } = useI18n();
  const theme = useTheme();
  const { customerInfo, isPro, available, loading, error, reload } =
    useSubscription();
  // 同一时刻只允许一个购买动作在飞，避免连点开出两个系统支付弹窗
  const [busy, setBusy] = useState<"upgrade" | "restore" | "manage" | null>(
    null,
  );
  const [notice, setNotice] = useState<Notice | null>(null);

  // 聚焦刷新：权益可能在系统设置里被改（取消订阅 / 退款）
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const entitlement =
    customerInfo?.entitlements.active[PRO_ENTITLEMENT_ID] ?? null;

  const expiresText = useMemo(() => {
    if (!entitlement?.expirationDate) return null;
    const date = new Date(entitlement.expirationDate);
    if (Number.isNaN(date.getTime())) return null;
    // 日期格式走 Intl，跟 App 语言（不硬编码语序，见 i18n 约定）
    return new Intl.DateTimeFormat(pickerFormat(language).locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }, [entitlement, language]);

  /** 「升级」：弹 RevenueCat 远程付费墙，购买 / 恢复都在墙内完成 */
  const handleUpgrade = useCallback(async () => {
    setBusy("upgrade");
    setNotice(null);
    const result = await presentProPaywall();
    setBusy(null);

    if (result.status === "purchased") {
      setNotice({ tone: "success", text: t("pro.noticePurchased") });
      return;
    }
    if (result.status === "restored") {
      setNotice({ tone: "success", text: t("pro.noticeRestored") });
      return;
    }
    // 已开通（墙没弹）/ 用户主动关掉：都不需要提示
    if (result.status === "not_presented" || result.status === "cancelled") {
      return;
    }

    // 远程付费墙没加载出来（网络 / 后台 offering 或 paywall 没配好）
    setNotice({ tone: "error", text: failureText(t, result.code) });
  }, [t]);

  /** 恢复购买：换机 / 重装 / 多设备后找回权益 */
  const handleRestore = useCallback(async () => {
    setBusy("restore");
    setNotice(null);
    const result = await restorePurchases();
    setBusy(null);

    if (result.status === "failed") {
      setNotice({ tone: "error", text: failureText(t, result.code) });
      return;
    }
    setNotice({
      tone: result.isPro ? "success" : "error",
      text: result.isPro ? t("pro.noticeRestored") : t("pro.noticeRestoreNone"),
    });
  }, [t]);

  /** 管理订阅：Customer Center 是原生模态，弹窗期间不占本地状态 */
  const handleManage = useCallback(async () => {
    setBusy("manage");
    setNotice(null);
    try {
      await presentCustomerCenter();
    } finally {
      setBusy(null);
    }
  }, []);

  const showUpgrade = available && !loading && !error && !isPro;

  return (
    <>
      <Stack.Screen.BackButton displayMode="minimal" />
      <Stack.Title>{t("pro.title")}</Stack.Title>

      <ScreenScaffold
        contentContainerStyle={{
          paddingHorizontal: Spacing.screen,
          paddingBottom: BottomTabInset + Spacing.four,
        }}
      >
        <View gap="three">
          {notice ? <NoticeBanner notice={notice} /> : null}

          {/* 页面说明：一句话讲清这屏是干什么的（跟随 Stack.Title 之下） */}
          <Text fontSize={13} color="textSecondary">
            {t("pro.subtitle")}
          </Text>

          {/* 订阅状态 */}
          <View>
            <SectionTitle>{t("pro.sectionStatus")}</SectionTitle>
            <SectionCard tone="outline">
              {loading ? (
                <SettingRow
                  label={t("pro.status")}
                  trailing={
                    <Text fontSize={15} color="textSecondary">
                      {t("common.loading")}
                    </Text>
                  }
                />
              ) : error ? (
                <SettingRow
                  testID="pro-retry-row"
                  label={t("pro.status")}
                  sub={t("pro.errorNetwork")}
                  onPress={reload}
                  showChevron
                />
              ) : (
                <>
                  <SettingRow
                    label={t("pro.status")}
                    trailing={
                      <Text
                        fontSize={15}
                        color={isPro ? "success" : "textSecondary"}
                      >
                        {!available
                          ? t("pro.statusUnavailable")
                          : isPro
                            ? t("pro.statusActive")
                            : t("pro.statusInactive")}
                      </Text>
                    }
                  />
                  {isPro && entitlement ? (
                    <>
                      <RowDivider />
                      <SettingRow
                        label={t("pro.currentPlan")}
                        trailing={
                          <Text fontSize={15} color="textSecondary">
                            {t(
                              planKeyFromProductId(
                                entitlement.productIdentifier,
                              ),
                            )}
                          </Text>
                        }
                      />
                      <RowDivider />
                      <SettingRow
                        label={t("pro.expires")}
                        trailing={
                          <Text fontSize={15} color="textSecondary">
                            {expiresText ?? t("pro.expiresNever")}
                          </Text>
                        }
                      />
                    </>
                  ) : null}
                  {isPro ? (
                    <>
                      <RowDivider />
                      <SettingRow
                        testID="pro-manage-row"
                        label={t("pro.manage")}
                        sub={t("pro.manageSub")}
                        disabled={busy !== null}
                        onPress={() => {
                          void handleManage();
                        }}
                        showChevron
                      />
                    </>
                  ) : null}
                </>
              )}
            </SectionCard>
          </View>

          {/* 未开通：权益说明 + 升级入口 */}
          {showUpgrade ? (
            <>
              <View>
                <SectionTitle>{t("pro.sectionBenefits")}</SectionTitle>
                <SectionCard tone="outline">
                  <BenefitRow text={t("pro.benefit1")} />
                  <RowDivider />
                  <BenefitRow text={t("pro.benefit2")} />
                  <RowDivider />
                  <BenefitRow text={t("pro.benefit3")} />
                </SectionCard>
              </View>

              <View gap="two">
                <Button
                  testID="pro-upgrade-button"
                  disabled={busy !== null}
                  onPress={() => {
                    void handleUpgrade();
                  }}
                  backgroundColor="primary press:primarySoft"
                  color="onPrimary"
                  borderRadius="card"
                  borderCurve="continuous"
                  paddingBlock="three"
                  minHeight={50}
                  opacity={busy !== null ? 0.6 : 1}
                  alignSelf="stretch"
                >
                  <Text color="onPrimary" fontSize={17} fontWeight="700">
                    {busy === "upgrade"
                      ? t("common.loading")
                      : t("pro.upgrade")}
                  </Text>
                </Button>

                <SettingRow
                  testID="pro-restore-row"
                  label={t("pro.restore")}
                  disabled={busy !== null}
                  onPress={() => {
                    void handleRestore();
                  }}
                  trailing={
                    busy === "restore" ? (
                      <Text fontSize={13} color="textSecondary">
                        {t("pro.restoring")}
                      </Text>
                    ) : undefined
                  }
                />
              </View>
            </>
          ) : null}

          {/* 条款 / 隐私：App Store 要求购买入口可触达 */}
          {available ? (
            <View alignItems="center" gap="two">
              <XStack alignItems="center" gap="two">
                <ExternalLink
                  href={PRO_TERMS_URL}
                  style={{ fontSize: 13, color: theme.textSecondary }}
                >
                  {t("pro.terms")}
                </ExternalLink>
                <Text fontSize={13} color="textSecondary">
                  ·
                </Text>
                <ExternalLink
                  href={PRO_PRIVACY_URL}
                  style={{ fontSize: 13, color: theme.textSecondary }}
                >
                  {t("pro.privacy")}
                </ExternalLink>
              </XStack>
              <Text
                fontSize={12}
                lineHeight={18}
                color="textSecondary"
                textAlign="center"
              >
                {t("pro.termsHint")}
              </Text>
            </View>
          ) : (
            <Text fontSize={13} color="textSecondary" textAlign="center">
              {t("pro.unavailableHint")}
            </Text>
          )}
        </View>
      </ScreenScaffold>
    </>
  );
}

/** 权益说明里的一行：对勾 + 文案 */
function BenefitRow({ text }: { text: string }) {
  // SymbolIcon 的 color 走 expo-symbols 原生 tintColor，收不了 Tamagui token 名，
  // 仍取真实色值
  const theme = useTheme();
  return (
    <XStack
      alignItems="center"
      gap="three"
      paddingInline="three"
      paddingBlock="rowGap"
    >
      <SymbolIcon name={SYMBOL_ICONS.check} size={16} color={theme.primary} />
      <Text flex={1} fontSize={15} color="text">
        {text}
      </Text>
    </XStack>
  );
}

/** 顶部提示条：成功用 successSoft / 失败用 dangerSoft */
function NoticeBanner({ notice }: { notice: Notice }) {
  const success = notice.tone === "success";
  return (
    <View
      backgroundColor={success ? "successSoft" : "dangerSoft"}
      borderRadius="tile"
      paddingInline="three"
      paddingBlock="two"
    >
      <Text fontSize={13} color={success ? "success" : "danger"}>
        {notice.text}
      </Text>
    </View>
  );
}

/**
 * 权益里的商品 id → 方案名。Google Play 的订阅 id 形如 `yearly:monthly`
 * （productId:basePlan），所以用包含判断而不是全等。
 */
function planKeyFromProductId(productId: string): Path {
  if (productId.includes("lifetime")) return "pro.planLifetime";
  if (productId.includes("yearly")) return "pro.planYearly";
  if (productId.includes("monthly")) return "pro.planMonthly";
  return "common.unknown";
}

/** 购买失败码 → 本地化文案。放屏幕层而不是 lib：lib 不碰词典（硬规则 28） */
function failureText(t: Translate, code: PurchaseFailureCode): string {
  switch (code) {
    case "network":
      return t("pro.errorNetwork");
    case "store":
      return t("pro.errorStore");
    case "not_allowed":
      return t("pro.errorNotAllowed");
    case "already_owned":
      return t("pro.errorAlreadyOwned");
    case "receipt_in_use":
      return t("pro.errorReceiptInUse");
    case "unavailable":
      return t("pro.errorUnavailable");
    // 远程付费墙没加载出来：网络抽了，或后台 offering / paywall 没配好
    case "no_offerings":
      return t("pro.paywallFailed");
    case "pending":
      return t("pro.noticePending");
    default:
      return t("pro.errorUnknown");
  }
}
