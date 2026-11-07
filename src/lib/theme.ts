import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "tf.theme";

/** Inline script run before paint to avoid a theme flash. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", dark ? "#8f1d1d" : "#c8102e");
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>("system");
  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as ThemeChoice | null) ?? "system";
    setTheme(saved);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(KEY) ?? "system") === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const choose = (t: ThemeChoice) => {
    localStorage.setItem(KEY, t);
    setTheme(t);
    apply(t);
  };
  return { theme, setTheme: choose };
}
