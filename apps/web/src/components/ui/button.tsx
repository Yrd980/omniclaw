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
    ? "bg-[var(--accent)] text-[oklch(0.985_0.006_210)] hover:bg-[var(--accent-strong)]"
    : "border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--panel)]";
  return (
    <button
      {...props}
      disabled={disabled || busy}
      className={cn("inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60", classes, className)}
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
