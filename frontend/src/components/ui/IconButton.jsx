import { ArrowPathIcon } from "@heroicons/react/24/outline";

export default function IconButton({
  label,
  icon: Icon,
  variant = "ghost",
  size = "md",
  loading = false,
  disabled = false,
  className = "",
  type = "button",
  ...rest
}) {
  const baseStyles =
    "inline-flex items-center justify-center rounded-[var(--radius-control)] transition-all duration-150 ease-[var(--ease-saas)] cursor-pointer select-none active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] focus-visible:outline-offset-2";

  const variants = {
    primary:
      "bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)] shadow-[var(--shadow-raised)] disabled:bg-[var(--color-line)] disabled:text-[var(--color-ink-faint)]",
    secondary:
      "bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line)] hover:bg-[var(--color-surface-sunken)] hover:border-[var(--color-line-strong)] shadow-[var(--shadow-raised)] disabled:bg-[var(--color-surface-sunken)] disabled:text-[var(--color-ink-faint)]",
    ghost:
      "bg-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)] disabled:text-[var(--color-ink-faint)]",
    danger:
      "bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white border border-[var(--color-danger)]/20 shadow-[var(--shadow-raised)] disabled:bg-[var(--color-line)] disabled:text-[var(--color-ink-faint)]",
  };

  const sizes = {
    sm: "p-1.5",
    md: "p-2",
  };

  const isActuallyDisabled = disabled || loading;

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={isActuallyDisabled}
      aria-busy={loading}
      className={`${baseStyles} ${variants[variant] || variants.ghost} ${sizes[size] || sizes.md} ${className}`}
      {...rest}
    >
      {loading ? (
        <ArrowPathIcon className={`${size === "sm" ? "w-4 h-4" : "w-[18px] h-[18px]"} animate-spin shrink-0`} />
      ) : Icon ? (
        <Icon className={`${size === "sm" ? "w-4 h-4" : "w-[18px] h-[18px]"} shrink-0`} />
      ) : null}
    </button>
  );
}
