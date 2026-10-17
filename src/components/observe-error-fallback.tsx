import { Pressable, Text as RNText, View as RNView } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import { getTranslator } from "@/i18n";

/**
 * Observe 错误边界的兜底界面：渲染期崩溃时整棵应用树被它替换。
 * 以函数形式传给 `errorBoundaryFallback`，边界会注入 `error` 与 `resetError`。
 *
 * 刻意用纯 RN 而不是 `@expo/ui`：崩溃可能就发生在原生 UI 层或 I18nProvider
 * 里，兜底界面必须还能画出来。同理文案走 `getTranslator()`（React 之外的
 * 翻译入口，Provider 没挂载时回退中文）而不是 `useTranslation()`。
 */
export function ObserveErrorFallback({
  resetError,
}: {
  resetError: () => void;
}) {
  const theme = useTheme();
  const t = getTranslator();

  return (
    <RNView
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: theme.canvas,
      }}
    >
      <RNText style={{ fontSize: 20, fontWeight: "700", color: theme.text }}>
        {t("common.errorTitle")}
      </RNText>
      <RNText
        style={{
          fontSize: 14,
          lineHeight: 20,
          textAlign: "center",
          marginTop: 8,
          color: theme.textSecondary,
        }}
      >
        {t("common.errorBody")}
      </RNText>
      <Pressable
        testID="observe-error-retry"
        onPress={resetError}
        style={{
          marginTop: 24,
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 999,
          backgroundColor: theme.primary,
        }}
      >
        <RNText
          style={{ fontSize: 15, fontWeight: "600", color: theme.onPrimary }}
        >
          {t("common.retry")}
        </RNText>
      </Pressable>
    </RNView>
  );
}
