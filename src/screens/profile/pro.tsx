import { Stack, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Pressable as RNPressable,
  Text as RNText,
  View as RNView,
} from "react-native";
import { PACKAGE_TYPE, type PurchasesPackage } from "react-native-purchases";

import { ExternalLink } from "@/components/external-link";
import { SYMBOL_ICONS } from "@/components/icons";
import { SectionCard, SectionTitle } from "@/components/rn-section-card";
import { ScreenScaffold } from "@/components/screen-scaffold";
import { RowDivider, SettingRow } from "@/components/setting-row";
import { SymbolIcon } from "@/components/symbol-icon";
import { BottomTabInset, Radius, Spacing } from "@/constants/theme";
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
  fetchCurrentOffering,
  presentCustomerCenter,
  presentProPaywall,
  purchasePackage,
  restorePurchases,
  sortPackagesForDisplay,
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
 * 购买入口的优先级：
 * 1. 「升级」按钮 → RevenueCat Paywall（后台配置，改价改文案不发版）。
 *    墙弹不出来（后台还没配 offering / paywall）时自动回落到 2；
 * 2. 自带商品列表：用 offering 里的 package 自己渲染行，逐个 purchasePackage。
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
  // 付费墙不可用时的兜底商品列表；null = 还没尝试过 / 不需要
  const [fallbackPackages, setFallbackPackages] = useState<
    PurchasesPackage[] | null
  >(null);

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

  /** 「升级」：先弹 RevenueCat 付费墙，墙不可用再回落到自带商品列表 */
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

    if (result.code === "no_offerings") {
      // 后台还没配 offering / paywall —— 拉商品列表，改走 App 内购买
      const offering = await fetchCurrentOffering();
      setFallbackPackages(
        offering.status === "ok"
          ? sortPackagesForDisplay(offering.offering.availablePackages)
          : [],
      );
      return;
    }
    setNotice({ tone: "error", text: failureText(t, result.code) });
  }, [t]);

  /** 兜底商品行：直接买这个 package（没有付费墙的颜值，但流程完整） */
  const handlePurchasePackage = useCallback(
    async (aPackage: PurchasesPackage) => {
      setBusy("upgrade");
      setNotice(null);
      const result = await purchasePackage(aPackage);
      setBusy(null);

      switch (result.status) {
        case "purchased":
          setNotice({ tone: "success", text: t("pro.noticePurchased") });
          break;
        case "pending":
          setNotice({ tone: "success", text: t("pro.noticePending") });
          break;
        case "cancelled":
          break;
        default:
          setNotice({ tone: "error", text: failureText(t, result.code) });
      }
    },
    [t],
  );

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
        <RNView style={{ gap: Spacing.three }}>
          {notice ? <NoticeBanner notice={notice} /> : null}

          {/* 订阅状态 */}
          <RNView>
            <SectionTitle>{t("pro.sectionStatus")}</SectionTitle>
            <SectionCard tone="outline">
              {loading ? (
                <SettingRow
                  label={t("pro.status")}
                  trailing={
                    <RNText
                      style={{ fontSize: 15, color: theme.textSecondary }}
                    >
                      {t("common.loading")}
                    </RNText>
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
                      <RNText
                        style={{
                          fontSize: 15,
                          color: isPro ? theme.success : theme.textSecondary,
                        }}
                      >
                        {!available
                          ? t("pro.statusUnavailable")
                          : isPro
                            ? t("pro.statusActive")
                            : t("pro.statusInactive")}
                      </RNText>
                    }
                  />
                  {isPro && entitlement ? (
                    <>
                      <RowDivider />
                      <SettingRow
                        label={t("pro.currentPlan")}
                        trailing={
                          <RNText
                            style={{
                              fontSize: 15,
                              color: theme.textSecondary,
                            }}
                          >
                            {t(
                              planKeyFromProductId(
                                entitlement.productIdentifier,
                              ),
                            )}
                          </RNText>
                        }
                      />
                      <RowDivider />
                      <SettingRow
                        label={t("pro.expires")}
                        trailing={
                          <RNText
                            style={{
                              fontSize: 15,
                              color: theme.textSecondary,
                            }}
                          >
                            {expiresText ?? t("pro.expiresNever")}
                          </RNText>
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
          </RNView>

          {/* 未开通：权益说明 + 升级入口 */}
          {showUpgrade ? (
            <>
              <RNView>
                <SectionTitle>{t("pro.sectionBenefits")}</SectionTitle>
                <SectionCard tone="outline">
                  <BenefitRow text={t("pro.benefit1")} />
                  <RowDivider />
                  <BenefitRow text={t("pro.benefit2")} />
                  <RowDivider />
                  <BenefitRow text={t("pro.benefit3")} />
                </SectionCard>
              </RNView>

              <RNView style={{ gap: Spacing.two }}>
                <RNPressable
                  testID="pro-upgrade-button"
                  accessibilityRole="button"
                  disabled={busy !== null}
                  onPress={() => {
                    void handleUpgrade();
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: pressed
                      ? theme.primarySoft
                      : theme.primary,
                    borderRadius: Radius.card,
                    borderCurve: "continuous",
                    paddingVertical: Spacing.three,
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 50,
                    opacity: busy !== null ? 0.6 : 1,
                  })}
                >
                  <RNText
                    style={{
                      color: theme.onPrimary,
                      fontSize: 17,
                      fontWeight: "700",
                    }}
                  >
                    {busy === "upgrade"
                      ? t("common.loading")
                      : t("pro.upgrade")}
                  </RNText>
                </RNPressable>

                <SettingRow
                  testID="pro-restore-row"
                  label={t("pro.restore")}
                  disabled={busy !== null}
                  onPress={() => {
                    void handleRestore();
                  }}
                  trailing={
                    busy === "restore" ? (
                      <RNText
                        style={{ fontSize: 13, color: theme.textSecondary }}
                      >
                        {t("pro.restoring")}
                      </RNText>
                    ) : undefined
                  }
                  showChevron
                />
              </RNView>

              {/* 兜底商品列表：付费墙弹不出来时才出现 */}
              {fallbackPackages ? (
                <RNView>
                  <SectionTitle>{t("pro.sectionPlans")}</SectionTitle>
                  <SectionCard tone="outline">
                    {fallbackPackages.length === 0 ? (
                      <RNView
                        style={{
                          paddingHorizontal: Spacing.three,
                          paddingVertical: Spacing.three,
                        }}
                      >
                        <RNText
                          style={{ fontSize: 13, color: theme.textSecondary }}
                        >
                          {t("pro.fallbackHint")}
                        </RNText>
                      </RNView>
                    ) : (
                      fallbackPackages.map((aPackage, index) => (
                        <RNView key={aPackage.identifier}>
                          {index > 0 ? <RowDivider /> : null}
                          <SettingRow
                            testID={`pro-package-${aPackage.identifier}`}
                            label={t(planKeyFromPackage(aPackage))}
                            sub={packageSubtitle(t, aPackage) ?? undefined}
                            disabled={busy !== null}
                            onPress={() => {
                              void handlePurchasePackage(aPackage);
                            }}
                            trailing={
                              <RNText
                                style={{
                                  fontSize: 15,
                                  fontWeight: "600",
                                  color: theme.text,
                                }}
                              >
                                {aPackage.product.priceString}
                              </RNText>
                            }
                          />
                        </RNView>
                      ))
                    )}
                  </SectionCard>
                </RNView>
              ) : null}
            </>
          ) : null}

          {/* 条款 / 隐私：App Store 要求购买入口可触达 */}
          {available ? (
            <RNView style={{ alignItems: "center", gap: Spacing.two }}>
              <RNView
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Spacing.two,
                }}
              >
                <ExternalLink
                  href={PRO_TERMS_URL}
                  style={{ fontSize: 13, color: theme.textSecondary }}
                >
                  {t("pro.terms")}
                </ExternalLink>
                <RNText style={{ fontSize: 13, color: theme.textSecondary }}>
                  ·
                </RNText>
                <ExternalLink
                  href={PRO_PRIVACY_URL}
                  style={{ fontSize: 13, color: theme.textSecondary }}
                >
                  {t("pro.privacy")}
                </ExternalLink>
              </RNView>
              <RNText
                style={{
                  fontSize: 12,
                  lineHeight: 18,
                  color: theme.textSecondary,
                  textAlign: "center",
                }}
              >
                {t("pro.termsHint")}
              </RNText>
            </RNView>
          ) : (
            <RNText
              style={{
                fontSize: 13,
                color: theme.textSecondary,
                textAlign: "center",
              }}
            >
              {t("pro.unavailableHint")}
            </RNText>
          )}
        </RNView>
      </ScreenScaffold>
    </>
  );
}

/** 权益说明里的一行：对勾 + 文案 */
function BenefitRow({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <RNView
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Spacing.three,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.rowGap,
      }}
    >
      <SymbolIcon name={SYMBOL_ICONS.check} size={16} color={theme.primary} />
      <RNText style={{ flex: 1, fontSize: 15, color: theme.text }}>
        {text}
      </RNText>
    </RNView>
  );
}

/** 顶部提示条：成功用 successSoft / 失败用 dangerSoft */
function NoticeBanner({ notice }: { notice: Notice }) {
  const theme = useTheme();
  const tone =
    notice.tone === "success"
      ? { background: theme.successSoft, color: theme.success }
      : { background: theme.dangerSoft, color: theme.danger };
  return (
    <RNView
      style={{
        backgroundColor: tone.background,
        borderRadius: Radius.tile,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
      }}
    >
      <RNText style={{ fontSize: 13, color: tone.color }}>{notice.text}</RNText>
    </RNView>
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

/** package 类型 → 方案名 */
function planKeyFromPackage(aPackage: PurchasesPackage): Path {
  switch (aPackage.packageType) {
    case PACKAGE_TYPE.LIFETIME:
      return "pro.planLifetime";
    case PACKAGE_TYPE.ANNUAL:
      return "pro.planYearly";
    case PACKAGE_TYPE.MONTHLY:
      return "pro.planMonthly";
    default:
      return "common.unknown";
  }
}

/** 年付套餐显示折合月价（价格锚点，让年付显得划算） */
function packageSubtitle(
  t: Translate,
  aPackage: PurchasesPackage,
): string | null {
  if (aPackage.packageType !== PACKAGE_TYPE.ANNUAL) return null;
  const perMonth = aPackage.product.pricePerMonthString;
  return perMonth ? t("pro.perMonth", { price: perMonth }) : null;
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
    case "pending":
      return t("pro.noticePending");
    default:
      return t("pro.errorUnknown");
  }
}
