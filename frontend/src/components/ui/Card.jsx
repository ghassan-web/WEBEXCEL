export default function Card({
  title,
  description,
  badge,
  actions,
  padding = "md",
  interactive = false,
  children,
  className = "",
  ...rest
}) {
  const hasHeader = title || description || actions || badge;
  const paddingStyles = padding === "none" ? "p-0" : padding === "sm" ? "p-3.5" : "p-5";

  return (
    <div
      className={`bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-surface)] shadow-[var(--shadow-card)] flex flex-col transition-all duration-150 ${
        interactive ? "hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-card-hover)]" : ""
      } ${className}`}
      {...rest}
    >
      {hasHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--color-line)]/80 shrink-0">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              {title && (
                <h3 className="text-[var(--text-body-lg)] font-semibold text-[var(--color-ink)] tracking-tight truncate">
                  {title}
                </h3>
              )}
              {badge && (
                <span className="text-[11px] font-semibold tabular-nums text-[var(--color-ink-muted)] bg-[var(--color-surface-sunken)] border border-[var(--color-line)] px-2.5 py-0.5 rounded-full shrink-0 font-mono">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="text-[var(--text-caption)] text-[var(--color-ink-muted)] leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {actions}
            </div>
          )}
        </div>
      )}
      <div className={`flex-1 ${paddingStyles}`}>
        {children}
      </div>
    </div>
  );
}
