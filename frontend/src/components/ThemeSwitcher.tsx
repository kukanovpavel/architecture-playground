import { useThemeStore } from "../theme";
import { useT } from "../i18n";

export function ThemeSwitcher() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const t = useT();

  return (
    <button className="theme-switch" onClick={toggleTheme} title={t("themeSwitchTitle")}>
      {theme === "light" ? t("themeDark") : t("themeLight")}
    </button>
  );
}
