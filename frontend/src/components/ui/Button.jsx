import { ArrowPathIcon } from "@heroicons/react/24/outline";

export default function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  icon: Icon,
  disabled = false,
  fullWidth = false,
  className = "",
  type = "button",
  ...rest
}) {
  const baseStyles =
    "inline-flex items-center justify-center font-semibold rounded-[var(--radius-control)] border transition-all duration-150 ease-[var(--ease-saas)] cursor-pointer select-none active:scale-[0.985] box-border focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] focus-visible:outline-offset-2";

  const variants = {
    primary:
      "border-transparent bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] active:bg-[var(--color-brand-active)] shadow-[var(--shadow-raised)] disabled:bg-[var(--color-line)] disabled:text-[var(--color-ink-faint)] disabled:shadow-none",
    dark:
      "border-transparent bg-[var(--color-ink-solid)] text-[var(--color-on-ink-solid)] hover:bg-[var(--color-ink-solid-hover)] shadow-[var(--shadow-raised)] disabled:bg-[var(--color-line)] disabled:text-[var(--color-ink-faint)] disabled:shadow-none",
    secondary:
      "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] hover:border-[var(--color-line-strong)] shadow-[var(--shadow-raised)] disabled:bg-[var(--color-surface-sunken)] disabled:text-[var(--color-ink-faint)] disabled:border-[var(--color-line)] disabled:shadow-none",
    subtle:
      "border-[var(--color-brand-line)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] hover:bg-[var(--color-brand)]/15 disabled:opacity-50",
    ghost:
      "border-transparent bg-transparent text-[var(--color-ink-body)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] active:bg-[var(--color-line)]/60 disabled:text-[var(--color-ink-faint)] disabled:bg-transparent",
    danger:
      "border-transparent bg-[var(--color-danger)] text-white hover:opacity-92 active:opacity-85 shadow-[var(--shadow-raised)] disabled:bg-[var(--color-line)] disabled:text-[var(--color-ink-faint)] disabled:shadow-none",
  };

  const sizes = {
    xs: "h-7 px-2.5 text-[11px] gap-1",
    sm: "h-8.5 px-3 text-xs gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-11 px-5 text-[var(--text-body)] gap-2",
  };

  const stateStyles = loading
    ? "pointer-events-none opacity-90 cursor-wait"
    : disabled
      ? "disabled:cursor-not-allowed disabled:pointer-events-none disabled:active:scale-100"
      : "";

  const widthStyle = fullWidth ? "w-full" : "";
  const iconSize =
    size === "xs"
      ? "w-3 h-3"
      : size === "sm"
        ? "w-3.5 h-3.5"
        : size === "lg"
          ? "w-4.5 h-4.5"
          : "w-4 h-4";

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`${baseStyles} ${widthStyle} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${stateStyles} ${className}`}
      {...rest}
    >
      {loading ? (
        <ArrowPathIcon className={`${iconSize} animate-spin shrink-0`} />
      ) : Icon ? (
        <Icon className={`${iconSize} shrink-0`} />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
