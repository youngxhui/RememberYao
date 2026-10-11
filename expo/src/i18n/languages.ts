export const LANGUAGES = ["zh", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = {
  zh: "简体中文",
  en: "English",
};

export const DEFAULT_LANGUAGE: Language = "zh";

/** 把设备语言（zh-CN / en_US / zh-Hans-CN）归一到受支持的语言 */
export function normalizeLanguage(tag: string | null | undefined): Language {
  if (!tag) return DEFAULT_LANGUAGE;
  const base = tag.toLowerCase().split(/[-_]/)[0];
  if (base === "en") return "en";
  return DEFAULT_LANGUAGE;
}

/** 按当前语言把 zh/en 词典合成一份，zh 缺失的键回退到 key 本身 */
export function resolveDictionary(
  language: Language,
  dictionaries: Record<Language, TranslationTree>,
): TranslationTree {
  return dictionaries[language] ?? dictionaries[DEFAULT_LANGUAGE];
}

/**
 * 原生日期 / 时间选择器的显示格式：跟 App 语言走，不跟系统 locale ——
 * 中文界面里弹一个「8:00 AM」很违和（日期时间格式由界面语言决定，不硬编码语序）。
 *
 * `locale` 只有 iOS 认；Android 的 12/24 小时制没有 locale 可依，只能显式给
 * `is24Hour`。
 */
export function pickerFormat(language: Language) {
  return {
    locale: language === "zh" ? "zh-Hans" : "en",
    is24Hour: language === "zh",
  };
}

export type TranslationTree = { [key: string]: string | TranslationTree };

/** 路径取值：`t("a.b.c")`；缺失时返回 fallback 或 key，便于一眼看出漏翻 */
export function lookup(
  tree: TranslationTree,
  path: string,
  fallback?: string,
): string {
  let node: string | TranslationTree | undefined = tree;
  for (const key of path.split(".")) {
    if (typeof node !== "object" || node === null) return fallback ?? path;
    node = node[key];
  }
  return typeof node === "string" ? node : (fallback ?? path);
}
