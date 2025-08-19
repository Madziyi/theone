import React, { createContext, useContext } from "react";
import { cn } from "./cn";

type TabsCtx = { value: string; onChange: (v: string) => void };
const Ctx = createContext<TabsCtx | null>(null);

export function Tabs({
  value,
  onValueChange,
  children,
}: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) {
  return <Ctx.Provider value={{ value, onChange: onValueChange }}>{children}</Ctx.Provider>;
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("inline-flex rounded-xl border border-border bg-card p-1", className)} {...props} />;
}

export function TabsTrigger({
  value,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("TabsTrigger must be used inside Tabs");
  const active = ctx.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx.onChange(value)}
      data-state={active ? "active" : "inactive"}
      className={cn(
        "h-9 min-w-[3.5rem] px-3 text-sm rounded-lg transition ease-out-custom",
        active
          ? "bg-primary text-white"
          : "text-muted hover:bg-white/5",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}