import { useEffect } from "react";
import { useStore } from "../store";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Delete/Backspace, Ctrl|Cmd+C/X/V, Ctrl|Cmd+Z / Ctrl|Cmd+Shift+Z (or +Y), Escape. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const s = useStore.getState();

      if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selectedComponentId || s.selectedConnectionId) {
          e.preventDefault();
          s.deleteSelected();
        }
        return;
      }

      if (mod && key === "c") {
        if (s.selectedComponentId) {
          e.preventDefault();
          s.copySelected();
        }
        return;
      }

      if (mod && key === "x") {
        if (s.selectedComponentId) {
          e.preventDefault();
          s.cutSelected();
        }
        return;
      }

      if (mod && key === "v") {
        if (s.clipboard) {
          e.preventDefault();
          s.pasteClipboard();
        }
        return;
      }

      if (mod && key === "z" && e.shiftKey) {
        e.preventDefault();
        s.redo();
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        s.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        s.redo();
        return;
      }

      if (e.key === "Escape") {
        s.select(null, null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
