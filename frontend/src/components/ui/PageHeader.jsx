export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  status,
  className = "",
  ...rest
}) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1 ${className}`}
      {...rest}
    >
      <div className="flex flex-col gap-1 min-w-0">
        {eyebrow && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
            {eyebrow}
          </span>
        )}
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[1.375rem] sm:text-[1.5rem] font-bold text-[var(--color-ink)] tracking-tight leading-tight">
            {title}
          </h1>
          {status}
        </div>
        {description && (
          <p className="text-sm text-[var(--color-ink)] max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}
