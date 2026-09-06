import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils";

export interface ToggleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange"
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: "sm" | "md" | "lg";
  color?: "primary" | "success" | "purple";
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      checked,
      onChange,
      size = "md",
      color = "primary",
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const sizes = {
      sm: { track: "w-8 h-5", thumb: "w-3 h-3", translate: "translate-x-3.5" },
      md: { track: "w-11 h-6", thumb: "w-4 h-4", translate: "translate-x-5" },
      lg: { track: "w-14 h-7", thumb: "w-5 h-5", translate: "translate-x-7" },
    };

    const colors = {
      primary: "bg-primary-500",
      success: "bg-success",
      purple: "bg-purple-600",
    };

    const sizeConfig = sizes[size];

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
          sizeConfig.track,
          checked ? colors[color] : "bg-gray-200 dark:bg-gray-700",
          checked
            ? "focus:ring-" + color + "-500/50"
            : "focus:ring-gray-500/50",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "absolute top-1 left-1 bg-white rounded-full shadow-sm transition-transform duration-200",
            sizeConfig.thumb,
            checked && sizeConfig.translate,
          )}
        />
      </button>
    );
  },
);

Toggle.displayName = "Toggle";
