import { useEffect, useState } from "react";
import { ProjectList } from "./pages/ProjectList";
import { Editor } from "./pages/Editor";
import { useThemeStore } from "./theme";
import { useLanguageStore } from "./i18n";
import "./App.css";

type View = { name: "list" } | { name: "editor"; id: string };

function initialView(): View {
  const projectId = new URLSearchParams(window.location.search).get("project");
  return projectId ? { name: "editor", id: projectId } : { name: "list" };
}

// Optional ?theme=light|dark and ?lang=en|ru query params force a specific
// look on load — handy for scripted/reproducible screenshots and shareable links.
function useQueryParamOverrides() {
  const setTheme = useThemeStore((s) => s.setTheme);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const theme = params.get("theme");
    if (theme === "light" || theme === "dark") setTheme(theme);
    const lang = params.get("lang");
    if (lang === "en" || lang === "ru") setLanguage(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function App() {
  const [view, setView] = useState<View>(initialView);
  const theme = useThemeStore((s) => s.theme);
  useQueryParamOverrides();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  if (view.name === "editor") {
    return <Editor projectId={view.id} onBack={() => setView({ name: "list" })} />;
  }
  return <ProjectList onOpen={(id) => setView({ name: "editor", id })} />;
}

export default App;
