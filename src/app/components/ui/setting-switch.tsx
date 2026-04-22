"use client";

import { Switch } from "./switch";
import { cn } from "./utils";

type SettingSwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
  labelClassName?: string;
  disabled?: boolean;
};

export function SettingSwitch({
  checked,
  onCheckedChange,
  label,
  className,
  labelClassName,
  disabled = false,
}: SettingSwitchProps) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-xs font-semibold text-slate-600 shrink-0", disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer", className)}>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
      <span className={cn("select-none", labelClassName)}>{label}</span>
    </label>
  );
}
