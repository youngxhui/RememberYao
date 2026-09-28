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
