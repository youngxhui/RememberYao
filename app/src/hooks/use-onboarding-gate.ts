import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { hasSeenOnboarding } from "@/lib/onboarding";

/**
 * 首次启动且未看过引导页时跳转引导页。
 * 返回 true 表示仍在检查中（调用方应先渲染占位/空视图）。
 */
export function useOnboardingGate(): boolean {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void hasSeenOnboarding().then((seen) => {
      if (cancelled) return;
      setChecking(false);
      if (!seen) {
        router.replace("/onboarding");
      }
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return checking;
}
