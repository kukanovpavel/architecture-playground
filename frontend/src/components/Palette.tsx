import { useStore } from "../store";
import { CATEGORY_COLORS } from "../categoryColors";
import type { Category } from "../types";
import { useT, useCatalogText } from "../i18n";

export function Palette() {
  const catalog = useStore((s) => s.catalog);
  const t = useT();
  const catalogText = useCatalogText();

  if (!catalog) return <div className="panel palette">{t("loading")}</div>;

  return (
    <div className="panel palette">
      <h3>{t("componentsTitle")}</h3>
      <p className="hint">{t("dragHint")}</p>
      {catalog.categories.map((category) => {
        const entries = Object.entries(catalog.types).filter(
          ([, e]) => e.category === category
        );
        if (entries.length === 0) return null;
        return (
          <div key={category} className="palette-group">
            <div
              className="palette-group-title"
              style={{ color: CATEGORY_COLORS[category as Category] }}
            >
              {catalogText.category(category as Category, category)}
            </div>
            {entries.map(([key, entry]) => (
              <div
                key={key}
                className="palette-item"
                draggable
                title={catalogText.description(key, entry.description)}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-component-type", key);
                  e.dataTransfer.effectAllowed = "move";
                }}
                style={{ borderLeft: `3px solid ${CATEGORY_COLORS[category as Category]}` }}
              >
                {catalogText.label(key, entry.label)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
