import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "en" | "ru";

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: "en",
      setLanguage: (language) => set({ language }),
      toggleLanguage: () =>
        set({ language: get().language === "en" ? "ru" : "en" }),
    }),
    { name: "architecture-playground-language" }
  )
);
