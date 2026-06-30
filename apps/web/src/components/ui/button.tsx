import type React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: React.ReactNode;
  busy?: boolean;
  variant?: "primary" | "secondary";
};

export function Button({ children, icon, busy, variant = "primary", className, disabled, ...props }: ButtonProps) {
  const classes = variant === "primary"
    ? "bg-[var(--accent)] text-[oklch(0.985_0.006_210)] hover:bg-[var(--accent-strong)] hover:shadow-[0_0_28px_oklch(0.74_0.16_166_/_0.18)]"
    : "border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:border-[var(--muted)] hover:bg-[var(--panel-strong)]";
  return (
    <button
      {...props}
      disabled={disabled || busy}
      className={cn("inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium shadow-sm transition-all duration-200 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60", classes, className)}
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
