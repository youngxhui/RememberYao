import Purchases, {
  LOG_LEVEL,
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";
import RevenueCatUI, {
  PAYWALL_RESULT,
  type CustomerCenterCallbacks,
} from "react-native-purchases-ui";

/**
 * RevenueCat（应用内购买 / 订阅）封装层。
 *
 * 分工沿用 `notifications.ts` 的模式：本文件是**唯一**碰 SDK 的地方，
 * 屏幕只消费这里的结果对象与 Hook（`@/hooks/use-subscription`），
 * 不在界面里直接调 `Purchases.*`。
 *
 * 两套购买入口，按优先级：
 * 1. **RevenueCat Paywall**（`presentProPaywall`）：付费墙在 RevenueCat 后台
 *    配置，改文案 / 改价格 / 改商品组合都不发版；购买、恢复、退款全在原生墙内完成。
 * 2. **自带商品列表**（`fetchCurrentOffering` + `purchasePackage`）：后台还没配
 *    offering / paywall 时的兜底，用 `PurchasesPackage` 自己渲染行。
 *
 * 权益模型（RevenueCat 后台）：
 * - 商品：`lifetime`（买断，非订阅）、`yearly`（年订阅）、`monthly`（月订阅）
 * - 权益：`rememberyao_pro`，三个商品都挂它下面 —— 界面只认权益，不认商品，
 *   以后加商品（比如季付）不用改代码。
 */

/** 权益标识：后台 entitlements 里建的那个，三个商品都归它 */
export const PRO_ENTITLEMENT_ID = "rememberyao_pro";

/**
 * RevenueCat API Key。
 *
 * `test_` 前缀 = **Test Store**（RevenueCat 自带的测试商店）：不接 App Store
 * Connect / Google Play 就能在沙盒里跑通购买全流程，适合现在这个阶段。
 *
 * 上线前换成各自平台的正式 key（Dashboard → Project → API keys）：
 * iOS `appl_…`、Android `goog_…`。**两个平台必须是不同的 key**，不能共用 ——
 * RevenueCat 按 key 区分商店，混用会串账。正式 key 不进仓库，用 EAS 的
 * 环境变量注入（构建时烘进 bundle 的 EXPO_PUBLIC_* 变量）：
 *   EXPO_PUBLIC_RC_API_KEY_IOS / EXPO_PUBLIC_RC_API_KEY_ANDROID
 */
const TEST_API_KEY = "test_TTmLDiXZVZeGlMJXSKRFEXwkPVV";

/** 按平台取 key：没有注入正式 key 时回落到 Test Store key */
function apiKeyForCurrentPlatform(): string {
  if (process.env.EXPO_OS === "ios") {
    return process.env.EXPO_PUBLIC_RC_API_KEY_IOS ?? TEST_API_KEY;
  }
  if (process.env.EXPO_OS === "android") {
    return process.env.EXPO_PUBLIC_RC_API_KEY_ANDROID ?? TEST_API_KEY;
  }
  return TEST_API_KEY;
}

let configured = false;

/** SDK 是否已配置。web / 配置失败时为 false —— 调用方据此把购买入口降级 */
export function revenueCatReady(): boolean {
  return configured;
}

/**
 * 配置 SDK。幂等：重复 configure 会抛 CONFIGURATION_ERROR，已配置过就直接返回。
 *
 * 根布局会调一次；`useSubscription` 里也会调一次兜底 —— React 的**子 effect
 * 先于父 effect** 执行，购买入口（子屏）可能比根布局的 configure 早一刻。
 *
 * web 没有 StoreKit / Google Play，直接跳过：所有购买调用都走
 * `revenueCatReady()` 守卫，界面显示「暂不可用」而不是崩。
 */
export async function configureRevenueCat(): Promise<void> {
  if (configured) return;
  if (process.env.EXPO_OS !== "ios" && process.env.EXPO_OS !== "android")
    return;

  try {
    if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
    Purchases.configure({
      apiKey: apiKeyForCurrentPlatform(),
      // 权益校验：让 RevenueCat 后端对权益做可信校验（结果记在
      // entitlement.verification 上），防本地伪造 entitlement。INFORMATIONAL
      // 档校验失败也照样放行，只是把 FAILED 暴露给我们观测
      entitlementVerificationMode:
        Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
    });
    configured = true;
  } catch (error) {
    // 配置失败不致命：权益降级成「未开通」，购买入口提示不可用
    console.warn("RevenueCat 配置失败", error);
  }
}

/** 权益是否生效：`entitlements.active` 里有这个 key 即生效（含试用 / 宽限） */
export function isProActive(customerInfo: CustomerInfo | null): boolean {
  return customerInfo?.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
}

// ─── 结果类型 ────────────────────────────────────────────

/**
 * 购买 / 恢复失败的原因分类。lib 层不碰词典（硬规则 28），只给码，
 * 由屏幕映射成本地化文案。
 */
export type PurchaseFailureCode =
  | "cancelled"
  | "pending"
  | "network"
  | "store"
  | "not_allowed"
  | "already_owned"
  | "receipt_in_use"
  | "unavailable"
  | "not_configured"
  | "no_offerings"
  | "unknown";

export type PurchaseResult =
  | { status: "purchased"; customerInfo: CustomerInfo }
  /** 用户主动取消了系统购买弹窗 —— 不是错误，不该弹提示 */
  | { status: "cancelled" }
  /** 支付待确认（如家长审批 / 延时到账）：权益稍后到，不用当失败 */
  | { status: "pending" }
  | { status: "failed"; code: PurchaseFailureCode };

export type RestoreResult =
  | { status: "restored"; customerInfo: CustomerInfo; isPro: boolean }
  | { status: "failed"; code: PurchaseFailureCode };

export type PaywallResult =
  // 拆开两个字面量成员而不是合成 `status: "purchased" | "restored"`：
  // TS 对「判别属性是多字面量」的成员只在 true 分支过滤，false 分支收窄到
  // never 也不会移除该成员，调用方的 exhaustive 判断会残留一个没有 code 的分支
  | { status: "purchased"; customerInfo: CustomerInfo | null }
  | { status: "restored"; customerInfo: CustomerInfo | null }
  | { status: "cancelled" }
  /** 已拥有权益，paywall 没弹（presentPaywallIfNeeded 的返回值） */
  | { status: "not_presented" }
  | { status: "failed"; code: PurchaseFailureCode };

export type OfferingResult =
  | { status: "ok"; offering: PurchasesOffering }
  | { status: "failed"; code: PurchaseFailureCode };

/** PurchasesError → 失败分类。纯函数，方便单测。
 *  入参收 `unknown`：catch 里拿到的是 unknown，而桥接层可能抛回非
 *  PurchasesError 的东西（如插件的 UNIMPLEMENTED），认不出来的一律算 unknown */
export function failureCodeFromError(error: unknown): PurchaseFailureCode {
  if (!isPurchasesError(error)) return "unknown";
  switch (error.code) {
    case PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR:
      return "cancelled";
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return "pending";
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
      return "network";
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
    case PURCHASES_ERROR_CODE.SYSTEM_INFO_ERROR:
      return "store";
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return "not_allowed";
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
      return "already_owned";
    case PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR:
      return "receipt_in_use";
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
      return "unavailable";
    default:
      return "unknown";
  }
}

/** 桥接层抛回来的东西够不够当一个 PurchasesError（有 code 字段就算） */
function isPurchasesError(error: unknown): error is PurchasesError {
  return typeof error === "object" && error !== null && "code" in error;
}

// ─── CustomerInfo ────────────────────────────────

/** 读 CustomerInfo（权益、到期时间、购买商店、订阅状态都在这一个对象里） */
export async function fetchCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

/**
 * 失效缓存后重读：回前台 / 手动刷新时用。
 * 订阅可能在系统设置里被取消、续费扣款失败被退回，本地缓存不会主动知道。
 */
export async function refreshCustomerInfo(): Promise<CustomerInfo> {
  await Purchases.invalidateCustomerInfoCache();
  return Purchases.getCustomerInfo();
}

/**
 * 监听 CustomerInfo 变化：购买成功、续费、退款、跨设备同步都会推。
 * 返回取消监听的函数。必须在 configure 之后注册。
 */
export function addCustomerInfoListener(
  listener: CustomerInfoUpdateListener,
): () => void {
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

// ─── 商品与购买 ────────────────────────────────

/**
 * 取当前 offering（后台标记为 Current 的那个）。
 * 没有配置 current offering 时返回 `no_offerings` —— 调用方回落到
 * 「付费墙不可用」的提示，别把用户晾在一句「出错了」上。
 */
export async function fetchCurrentOffering(): Promise<OfferingResult> {
  if (!configured) return { status: "failed", code: "not_configured" };
  try {
    const offerings = await Purchases.getOfferings();
    const offering = offerings.current;
    if (!offering) return { status: "failed", code: "no_offerings" };
    return { status: "ok", offering };
  } catch (error) {
    return { status: "failed", code: failureCodeFromError(error) };
  }
}

/**
 * 买一个 package（自带商品列表用；RevenueCat Paywall 内部走原生购买，
 * 不经过这里）。
 *
 * 结果对象而不是抛错：用户取消是正常路径，不该走 catch。
 */
export async function purchasePackage(
  aPackage: PurchasesPackage,
): Promise<PurchaseResult> {
  if (!configured) return { status: "failed", code: "not_configured" };
  try {
    const { customerInfo } = await Purchases.purchasePackage(aPackage);
    return { status: "purchased", customerInfo };
  } catch (error) {
    const code = failureCodeFromError(error);
    if (code === "cancelled") return { status: "cancelled" };
    if (code === "pending") return { status: "pending" };
    return { status: "failed", code };
  }
}

/**
 * 恢复购买：换机 / 重装 / 多设备后用。恢复成功但权益没激活也返回
 * `restored`（`isPro: false`）—— 那不是错误，由调用方提示「没找到」。
 */
export async function restorePurchases(): Promise<RestoreResult> {
  if (!configured) return { status: "failed", code: "not_configured" };
  try {
    const customerInfo = await Purchases.restorePurchases();
    return {
      status: "restored",
      customerInfo,
      isPro: isProActive(customerInfo),
    };
  } catch (error) {
    return { status: "failed", code: failureCodeFromError(error) };
  }
}

/**
 * 兜底商品列表的展示顺序：永久 > 年付 > 月付。
 * 价格锚点从高到低，年付夹在中间最容易被接受（RevenueCat 后台的推荐序）。
 * 纯函数，排序不影响传入数组。
 */
export function sortPackagesForDisplay(
  packages: PurchasesPackage[],
): PurchasesPackage[] {
  const order: PACKAGE_TYPE[] = [
    PACKAGE_TYPE.LIFETIME,
    PACKAGE_TYPE.ANNUAL,
    PACKAGE_TYPE.MONTHLY,
  ];
  return [...packages].toSorted(
    (a, b) => order.indexOf(a.packageType) - order.indexOf(b.packageType),
  );
}

// ─── Paywall / Customer Center ────────────────────────────

/**
 * 弹 RevenueCat Paywall（后台配置的付费墙）。
 *
 * 走 `presentPaywallIfNeeded`：已拥有权益时不弹，直接返回 `not_presented` ——
 * 「升级」按钮因此不需要自己判断权益状态。
 *
 * `customerInfo` 从墙内回调里拿，省得调用方再查一次；墙是原生模态，
 * 关掉之后 promise 才 resolve。
 */
export async function presentProPaywall(): Promise<PaywallResult> {
  if (!configured) return { status: "failed", code: "not_configured" };
  let purchasedInfo: CustomerInfo | null = null;

  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: PRO_ENTITLEMENT_ID,
      callbacks: {
        onPurchaseCompleted: ({ customerInfo }) => {
          purchasedInfo = customerInfo;
        },
        onRestoreCompleted: ({ customerInfo }) => {
          purchasedInfo = customerInfo;
        },
      },
    });

    switch (result) {
      case PAYWALL_RESULT.PURCHASED:
        return { status: "purchased", customerInfo: purchasedInfo };
      case PAYWALL_RESULT.RESTORED:
        return { status: "restored", customerInfo: purchasedInfo };
      case PAYWALL_RESULT.NOT_PRESENTED:
        return { status: "not_presented" };
      case PAYWALL_RESULT.CANCELLED:
        return { status: "cancelled" };
      default:
        // ERROR：多半是后台还没配 offering / paywall。
        // 报成 no_offerings，调用方据此回落到自带商品列表
        return { status: "failed", code: "no_offerings" };
    }
  } catch (error) {
    return { status: "failed", code: failureCodeFromError(error) };
  }
}

/**
 * 弹 Customer Center：用户自助管理订阅（换档 / 取消 / 退款申请 / 购买记录），
 * 在 RevenueCat 后台配置，能省掉大量客服工单。
 *
 * 权益未生效时没必要弹，调用方自己判断；web 上 SDK 未配置，静默返回。
 */
export async function presentCustomerCenter(
  callbacks?: CustomerCenterCallbacks,
): Promise<void> {
  if (!configured) return;
  await RevenueCatUI.presentCustomerCenter({ callbacks });
}

// ─── 用户身份（预留） ────────────────────────────

/**
 * RememberYao 目前没有账号体系，用 RevenueCat 的**匿名 app user id** 即可
 * （SDK 自动生成、跨会话保持，重装 / 换机靠「恢复购买」找回权益）。
 *
 * 将来若接入账号，在这里包一层 `Purchases.logIn(userId)` /
 * `Purchases.logOut()`，并保持**同一个 appUserID 跨平台**，否则同一个人
 * 在 iOS 买的订阅 Android 不认。不要在多处直接调 logIn/logOut。
 */
