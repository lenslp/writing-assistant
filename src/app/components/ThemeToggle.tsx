"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  const label = isDark ? "切换浅色主题" : "切换暗色主题";
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setTheme(nextTheme)}
      className={`group inline-flex items-center justify-center rounded-2xl border border-border bg-card/75 text-muted-foreground shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:text-foreground hover:shadow-[0_12px_32px_rgba(111,92,255,0.16)] ${
        compact ? "h-10 w-10" : "h-11 gap-2 px-3 text-[12px]"
      }`}
      style={{ fontWeight: 800 }}
    >
      <span className="relative grid h-6 w-6 place-items-center overflow-hidden rounded-xl bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5 transition-transform group-hover:rotate-12" />
      </span>
      {compact ? null : <span>{isDark ? "浅色" : "暗色"}</span>}
    </button>
  );
}
