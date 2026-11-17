export default function Badge({
  children,
  tone = "neutral",
  icon: Icon,
  dot = false,
  className = "",
  ...rest
}) {
  const tones = {
    neutral: "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] border-[var(--color-line)]",
    brand:   "bg-[var(--color-brand-soft)] text-[var(--color-brand)] border-[var(--color-brand-line)] font-semibold",
    premi:   "bg-[var(--color-premi-soft)] text-[var(--color-premi)] border-[var(--color-premi-line)] font-semibold",
    klaim:   "bg-[var(--color-claim-soft)] text-[var(--color-claim)] border-[var(--color-claim-line)] font-semibold",
    claim:   "bg-[var(--color-claim-soft)] text-[var(--color-claim)] border-[var(--color-claim-line)] font-semibold",
    valid:   "bg-[var(--color-valid-soft)] text-[var(--color-valid)] border-[var(--color-valid)]/20 font-semibold",
    warning: "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/25 font-semibold",
    danger:  "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/20 font-semibold",
    info:    "bg-[var(--color-brand-soft)] text-[var(--color-brand)] border-[var(--color-brand-line)] font-semibold",
  };

  const dotColors = {
    neutral: "bg-[var(--color-ink-muted)]",
    brand:   "bg-[var(--color-brand)]",
    premi:   "bg-[var(--color-premi)]",
    klaim:   "bg-[var(--color-claim)]",
    claim:   "bg-[var(--color-claim)]",
    valid:   "bg-[var(--color-valid)]",
    warning: "bg-[var(--color-warning)]",
    danger:  "bg-[var(--color-danger)]",
    info:    "bg-[var(--color-brand)]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] leading-5 font-medium tabular-nums select-none transition-colors ${
        tones[tone] || tones.neutral
      } ${className}`}
      {...rest}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[tone] || dotColors.neutral}`}
          aria-hidden="true"
        />
      )}
      {Icon && <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}
