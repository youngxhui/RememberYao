import { Share } from "react-native";

import { useTranslation } from "@/i18n";
import { useAppData } from "@/lib/store";

/**
 * 生成并分享一份用药数据报表（纯文本）。用系统分享面板，不引第三方依赖 ——
 * 用户可自行存到文件、发邮件或发给自己。
 *
 * 抽成 hook 而不是塞在设置页里：设置页与「我的」页的导出入口共用同一份实现，
 * 避免两处各写一遍（也避免其中一处一直是占位）。
 */
export function useMedicationExport() {
  const { medications, usages } = useAppData();
  const t = useTranslation();

  return async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const medLines = medications.map(
      (m) => `· ${m.name}  ${m.remainingQuantity}/${m.totalQuantity}`,
    );
    const recentLines = usages
      .slice(-20)
      .map(
        (u) =>
          `· ${u.takenAt.slice(0, 16).replace("T", " ")}  ${u.personName}  ${u.medicationName}`,
      );

    const message = [
      `${t("settings.exportHeader")}（${stamp}）`,
      "",
      `[${t("settings.exportMeds")}]`,
      ...medLines,
      "",
      `[${t("settings.exportRecent")}]`,
      ...recentLines,
    ].join("\n");

    try {
      await Share.share({ message });
    } catch {
      // 用户取消分享不应弹错
    }
  };
}
