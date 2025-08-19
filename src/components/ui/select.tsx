// src/components/ui/select.tsx
import * as RSelect from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";
import { memo } from "react";

export type SelectItem = { value: string; label: string; disabled?: boolean };

type Props = {
  items: SelectItem[];
  value: string; // "" shows placeholder
  onValueChange: (v: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
};

const Select = memo(function Select({
  items,
  value,
  onValueChange,
  placeholder,
  "aria-label": ariaLabel,
  className,
}: Props) {
  // Radix rule: items must never have value === ""
  const hasValue = items.some((i) => i.value === value);
  const safeValue = hasValue ? value : "";

  return (
    <RSelect.Root value={safeValue} onValueChange={onValueChange}>
      <RSelect.Trigger
        aria-label={ariaLabel}
        className={[
          "inline-flex h-10 w-full max-w-full min-w-0 items-center justify-between gap-2",
          "rounded-xl border border-border bg-card px-3 text-sm shadow-soft",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]",
          "data-[placeholder]:text-muted",
          className ?? "",
        ].join(" ")}
      >
        {/* single-line & truncating text */}
        <RSelect.Value
          placeholder={placeholder}
          className="truncate whitespace-nowrap"
        />
        <RSelect.Icon>
          <ChevronDown className="h-4 w-4 opacity-70 shrink-0" aria-hidden />
        </RSelect.Icon>
      </RSelect.Trigger>

      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className={[
            "z-[2000] max-h-64 overflow-auto rounded-xl border border-border bg-card shadow-soft",
            // never exceed viewport width; also respect trigger width
            "min-w-[var(--radix-select-trigger-width)]",
            "max-w-[min(calc(100vw-16px),var(--radix-select-trigger-width))]",
          ].join(" ")}
        >
          <RSelect.Viewport className="p-1">
            {items
              .filter((it) => it.value !== "")
              .map((it) => (
                <RSelect.Item
                  key={it.value}
                  value={it.value}
                  disabled={!!it.disabled}
                  className={[
                    "relative flex cursor-default select-none items-center rounded-lg px-3 py-2 text-sm outline-none",
                    "data-[highlighted]:bg-primary/10 data-[state=checked]:font-medium",
                    "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed",
                  ].join(" ")}
                >
                  <RSelect.ItemText className="truncate">
                    {it.label}
                  </RSelect.ItemText>
                </RSelect.Item>
              ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
});

export { Select };
