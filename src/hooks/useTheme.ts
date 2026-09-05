import { useEffect, useState } from "react";

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || "system";
  });

  useEffect(() => {
    const change = (event: Event) => {
      const value = (event as CustomEvent).detail;
      if (["system", "light", "dark"].includes(value)) setTheme(value);
    };
    window.addEventListener("theme-change", change);
    return () => window.removeEventListener("theme-change", change);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;

    const applyTheme = (t: string) => {
      if (t === "dark") {
        root.classList.add("dark");
      } else if (t === "light") {
        root.classList.remove("dark");
      } else {
        // system
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
      }
    };

    applyTheme(theme);
    localStorage.setItem("theme", theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => applyTheme("system");

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  return [theme, setTheme] as const;
}
