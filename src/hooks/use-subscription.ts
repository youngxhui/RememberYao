import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { type CustomerInfo } from "react-native-purchases";

import {
  addCustomerInfoListener,
  configureRevenueCat,
  fetchCustomerInfo,
  isProActive,
  refreshCustomerInfo,
  revenueCatReady,
} from "@/lib/revenuecat";

/**
 * 订阅状态：按屏幕的查询 Hook（对齐 store.ts 里 useQuery 的形状）。
 *
 * 唯一的数据源是 RevenueCat 的 CustomerInfo —— 权益、到期时间、购买商店都在
 * 那一个对象里。三条更新路径，都比轮询及时：
 * 1. 购买 / 恢复成功：SDK 推 CustomerInfo 更新（addCustomerInfoListener）
 * 2. 回前台：主动失效缓存重读（订阅可能在系统设置里被取消 / 扣款失败）
 * 3. 屏幕聚焦：reload() 手动刷新
 *
 * `loading` 只是首屏加载标志（界面四态约定）：刷新不翻牌，否则每次聚焦都闪空态。
 * 读失败保留上一份数据，只翻 error 牌。
 */
export type SubscriptionState = {
  /** CustomerInfo 全集，null = 还没读到 / 读失败 */
  customerInfo: CustomerInfo | null;
  /** rememberyao_pro 是否生效 */
  isPro: boolean;
  /** SDK 是否可用。web / 配置失败时为 false，界面据此隐藏购买入口 */
  available: boolean;
  loading: boolean;
  error: boolean;
  reload: () => void;
};

export function useSubscription(): SubscriptionState {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const loadedRef = useRef(false);
  // 并发请求序号：只认最后一次，聚焦刷新不会被自动重查的旧响应覆盖
  const seqRef = useRef(0);

  const reload = useCallback(() => {
    if (!revenueCatReady()) {
      setLoading(false);
      return;
    }
    const seq = (seqRef.current += 1);
    if (!loadedRef.current) setLoading(true);
    // async IIFE 而不是 promise 链：和 store.ts 的 useQuery 保持一致，
    // 也避开 promise 插件的 always-return / no-callback-in-promise
    void (async () => {
      try {
        const info = await fetchCustomerInfo();
        if (seq === seqRef.current) {
          setCustomerInfo(info);
          setError(false);
        }
      } catch {
        // 读失败保留上一份数据：屏幕走 error / 空态而不是白屏
        if (seq === seqRef.current) setError(true);
      }
      if (seq === seqRef.current) {
        loadedRef.current = true;
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let removeListener: (() => void) | null = null;
    let appStateSub: { remove: () => void } | null = null;

    void (async () => {
      // 幂等配置。这里兜一次而不是只靠根布局：React 的**子 effect 先于父
      // effect** 执行，这个 Hook（子屏）可能比根布局的 configure 早一刻，
      // 直接读 CustomerInfo 会撞 UninitializedPurchasesError
      await configureRevenueCat();
      if (cancelled) return;
      if (!revenueCatReady()) {
        // web / 配置失败：没有 StoreKit 与 Google Play，权益状态保持「未开通」
        setLoading(false);
        return;
      }

      removeListener = addCustomerInfoListener((info) => {
        setCustomerInfo(info);
        setError(false);
      });

      // 回前台刷新：订阅可能在系统设置里取消、续费扣款失败被退回，
      // 本地缓存不会主动知道。失败不打扰用户，保留上一份状态
      appStateSub = AppState.addEventListener("change", (state) => {
        if (state !== "active") return;
        void (async () => {
          try {
            const info = await refreshCustomerInfo();
            if (!cancelled) {
              setCustomerInfo(info);
              setError(false);
            }
          } catch {
            // 忽略：下次回前台 / 聚焦还会再试
          }
        })();
      });

      reload();
    })();

    return () => {
      cancelled = true;
      removeListener?.();
      appStateSub?.remove();
    };
  }, [reload]);

  return {
    customerInfo,
    isPro: isProActive(customerInfo),
    available: revenueCatReady(),
    loading,
    error,
    reload,
  };
}
