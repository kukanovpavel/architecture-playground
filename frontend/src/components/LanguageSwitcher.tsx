import { useLanguageStore, useT } from "../i18n";

export function LanguageSwitcher() {
  const language = useLanguageStore((s) => s.language);
  const toggleLanguage = useLanguageStore((s) => s.toggleLanguage);
  const t = useT();

  return (
    <button className="lang-switch" onClick={toggleLanguage} title={t("langSwitchTitle")}>
      {language === "en" ? "RU" : "EN"}
    </button>
  );
}
