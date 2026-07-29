import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ProjectSummary } from "../types";
import { useT } from "../i18n";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ThemeSwitcher } from "../components/ThemeSwitcher";

export function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [name, setName] = useState("Untitled space");
  const [loading, setLoading] = useState(true);

  const refresh = () => api.listProjects().then(setProjects);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const create = async () => {
    const project = await api.createProject(name || "Untitled space");
    onOpen(project.id);
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("confirmDeleteSpace"))) return;
    await api.deleteProject(id);
    refresh();
  };

  return (
    <div className="project-list-page">
      <div className="header-actions">
        <ThemeSwitcher />
        <LanguageSwitcher />
      </div>
      <h1>{t("appTitle")}</h1>
      <p className="hint">{t("appSubtitle")}</p>

      <div className="new-project-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("spaceNamePlaceholder")}
        />
        <button onClick={create}>{t("newSpace")}</button>
      </div>

      {loading ? (
        <p>{t("loading")}</p>
      ) : projects.length === 0 ? (
        <p className="hint">{t("noSpacesYet")}</p>
      ) : (
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.id} onClick={() => onOpen(p.id)}>
              <div>
                <div className="project-name">{p.name}</div>
                <div className="hint">
                  {t("updated")} {new Date(p.updated_at).toLocaleString()}
                </div>
              </div>
              <button className="link danger" onClick={(e) => remove(p.id, e)}>
                {t("delete")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
