import { useLanguageStore } from "./language";
import { UI, type UIKey } from "./translations";
import { CATALOG_I18N, CATEGORY_I18N } from "./catalogI18n";
import { findingMessage } from "./findings";
import type { Category, Finding } from "../types";

export { useLanguageStore } from "./language";
export type { Language } from "./language";

export function useT() {
  const language = useLanguageStore((s) => s.language);
  return (key: UIKey) => UI[language][key] ?? UI.en[key];
}

export function useCatalogText() {
  const language = useLanguageStore((s) => s.language);
  return {
    label: (typeKey: string, fallback: string) =>
      CATALOG_I18N[typeKey]?.[language]?.label ?? fallback,
    description: (typeKey: string, fallback: string) =>
      CATALOG_I18N[typeKey]?.[language]?.description ?? fallback,
    category: (category: Category, fallback: string) =>
      CATEGORY_I18N[category]?.[language] ?? fallback,
  };
}

export function useFindingMessage() {
  const language = useLanguageStore((s) => s.language);
  return (finding: Finding) => findingMessage(finding, language);
}
