import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useStore } from "../store";
import { Palette } from "../components/Palette";
import { Canvas } from "../components/Canvas";
import { PropertiesPanel } from "../components/PropertiesPanel";
import { RequirementsPanel } from "../components/RequirementsPanel";
import { ResultsPanel } from "../components/ResultsPanel";
import { LiveStatsPanel } from "../components/LiveStatsPanel";
import { RecommendationsPanel } from "../components/RecommendationsPanel";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { useT } from "../i18n";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

export function Editor({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const t = useT();
  const loadCatalog = useStore((s) => s.loadCatalog);
  const openProject = useStore((s) => s.openProject);
  const reset = useStore((s) => s.reset);
  const projectName = useStore((s) => s.projectName);
  const saving = useStore((s) => s.saving);
  const simulating = useStore((s) => s.simulating);
  const dirty = useStore((s) => s.dirty);
  const save = useStore((s) => s.save);
  const runSimulation = useStore((s) => s.runSimulation);
  const stopSimulation = useStore((s) => s.stopSimulation);
  const liveRunning = useStore((s) => s.liveRunning);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);

  useKeyboardShortcuts();

  useEffect(() => {
    loadCatalog();
    // ?autorun=1 (optionally with &rate=<rps>) starts the live simulation as
    // soon as the space loads — handy for demo links and reproducible screenshots.
    const params = new URLSearchParams(window.location.search);
    const autorun = params.get("autorun") === "1";
    const rate = Number(params.get("rate"));
    openProject(projectId).then(() => {
      if (autorun) runSimulation(rate > 0 ? rate : undefined);
    });
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div className="editor-page">
      <div className="topbar">
        <button className="link" onClick={onBack}>
          {t("back")}
        </button>
        <div className="project-title">{projectName || t("loading")}</div>
        <div className="topbar-actions">
          <span className="hint">{dirty ? t("unsavedChanges") : t("saved")}</span>
          <button disabled={!canUndo} title={t("undoTitle")} onClick={() => undo()}>
            {t("undo")}
          </button>
          <button disabled={!canRedo} title={t("redoTitle")} onClick={() => redo()}>
            {t("redo")}
          </button>
          <button disabled={saving} onClick={() => save()}>
            {saving ? t("saving") : t("save")}
          </button>
          {liveRunning ? (
            <button className="danger-solid" onClick={() => stopSimulation()}>
              ■ {t("stop")}
            </button>
          ) : (
            <button className="primary" disabled={simulating} onClick={() => runSimulation()}>
              {simulating ? t("running") : `▶ ${t("run")}`}
            </button>
          )}
          <div className="header-actions">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </div>
      </div>
      <div className="editor-body">
        <Palette />
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
        <div className="right-column">
          <LiveStatsPanel />
          <RecommendationsPanel />
          <PropertiesPanel />
          <RequirementsPanel />
          <ResultsPanel />
        </div>
      </div>
    </div>
  );
}
