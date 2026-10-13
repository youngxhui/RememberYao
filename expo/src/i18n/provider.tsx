import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Localization from "expo-localization";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { en } from "./dictionaries/en";
import { zh } from "./dictionaries/zh";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_LABELS,
  lookup,
  normalizeLanguage,
  type Language,
} from "./languages";

/** 语言偏好单独存 AsyncStorage：不进 SQLite，避免和业务数据迁移耦合 */
const LANG_STORAGE_KEY = "rememberyao-lang";

const DICTIONARIES = { zh, en } as const;

/** 字典值的插值占位符：`{name}` */
type Vars = Record<string, string | number>;

/** 把「父键 + 子路径」拼成点分路径。
 *  单独抽出来是为了让递归落在泛型参数位 —— TS 3.7 起允许 type alias
 *  在泛型位引用自身，直接写成自引用别名会报「circularly references itself」。 */
type JoinPath<K extends string, P> = P extends string ? `${K}.${P}` : never;

/** zh 字典的叶子键，作为 `t()` 的合法路径（t("medication.typeBlister")） */
export type Path<T = typeof zh> = {
  [K in keyof T & string]: T[K] extends string ? K : JoinPath<K, Path<T[K]>>;
}[keyof T & string];

export type Translate = (path: Path, vars?: Vars) => string;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/** 当前语言的 t()，供 React 之外调用（通知调度、数据层拼文案）。
 *  Provider 每次渲染会更新它；Provider 尚未挂载时回退到中文。 */
let ambientT: Translate = (path, vars) => interpolate(lookup(zh, path), vars);

/** 在 React 之外取翻译函数 */
export function getTranslator(): Translate {
  return ambientT;
}

/** 取当前语言与翻译函数。屏幕/组件里用这个，不要直接 import 词典。 */
export function useI18n(): I18nContextValue {
  const value = use(I18nContext);
  if (!value) throw new Error("useI18n 必须在 I18nProvider 内使用");
  return value;
}

/** 只要 t()，语言本身用不到时更方便 */
export function useTranslation(): Translate {
  return useI18n().t;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  // 启动时读持久化偏好；没有就用设备语言，都没有则中文
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, deviceTag] = await Promise.all([
        AsyncStorage.getItem(LANG_STORAGE_KEY),
        Promise.resolve(Localization.getLocales()[0]?.languageTag ?? null),
      ]);
      if (cancelled) return;
      const next: Language = stored
        ? (LANGUAGES.find((l) => l === stored) ?? DEFAULT_LANGUAGE)
        : normalizeLanguage(deviceTag);
      setLanguageState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    void AsyncStorage.setItem(LANG_STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dictionary = DICTIONARIES[language];
    // 缺键时回退到中文，再缺就显示 key —— 漏翻一眼可见
    const t: Translate = (path, vars) =>
      interpolate(lookup(dictionary, path, lookup(zh, path)), vars);
    return { language, setLanguage, t };
  }, [language, setLanguage]);

  // React 之外（通知调度）用的入口。放 effect 里而不是渲染期赋值：
  // 渲染期改模块级变量是副作用，在并发渲染下会读到别的语言
  useEffect(() => {
    ambientT = value.t;
  }, [value.t]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

export { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_LABELS, type Language };
