import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  MinusIcon,
} from "@heroicons/react/24/outline";

const ACCENTS = {
  brand: "var(--color-brand)",
  valid: "var(--color-valid)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  premi: "var(--color-premi)",
  claim: "var(--color-claim)",
  ink: "var(--color-ink)",
};

/**
 * MetricTile — Enterprise KPI card with restrained typography,
 * subtle monochrome icon, numeric emphasis, and optional progress indicator.
 */
export default function MetricTile({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  accent = "brand",
  delta = null,
  invertDelta = false,
  loading = false,
  type = "none",
  progressValue = 0,
  progressLabel,
  progressColor,
  children,
  className = "",
  ...rest
}) {
  const accentColor = ACCENTS[accent] || ACCENTS.brand;

  const direction = delta?.direction ?? "flat";
  const isPositive = invertDelta ? direction === "down" : direction === "up";
  const isNegative = invertDelta ? direction === "up" : direction === "down";

  const deltaBadgeClass = isPositive
    ? "bg-[var(--color-valid-soft)] text-[var(--color-valid)] border-[var(--color-valid)]/20"
    : isNegative
      ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/20"
      : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] border-[var(--color-line)]";

  const DeltaIcon =
    direction === "up"
      ? ArrowUpRightIcon
      : direction === "down"
        ? ArrowDownRightIcon
        : MinusIcon;

  return (
    <div
      className={`group relative overflow-hidden bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-surface)] h-full min-h-[128px] p-4 sm:p-5 flex flex-col justify-between gap-3 transition-colors duration-150 hover:border-[var(--color-line-strong)] shadow-[var(--shadow-card)] ${className}`}
      {...rest}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-[var(--color-ink-muted)] leading-snug">
            {label}
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            {delta && !loading && (
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border text-[11px] font-semibold tabular-nums font-mono ${deltaBadgeClass}`}
                title="Perubahan dibanding periode sebelumnya"
              >
                <DeltaIcon className="w-3 h-3" />
                {Math.abs(delta.value).toLocaleString("id-ID", {
                  maximumFractionDigits: 1,
                })}
                %
              </span>
            )}
            {Icon && (
              <Icon
                className="w-4 h-4 text-[var(--color-ink-muted)] shrink-0"
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        <div className="flex items-baseline gap-1.5">
          {loading ? (
            <span className="h-7 w-28 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] animate-pulse" />
          ) : (
            <>
              <span className="text-2xl font-bold font-mono tabular-nums leading-none text-[var(--color-ink)]">
                {value}
              </span>
              {unit && (
                <span className="text-xs font-medium text-[var(--color-ink-muted)]">
                  {unit}
                </span>
              )}
            </>
          )}
        </div>

        {hint && (
          <p className="text-xs text-[var(--color-ink-muted)] leading-snug">
            {hint}
          </p>
        )}
      </div>

      {children ? (
        <div className="mt-auto pt-1">{children}</div>
      ) : type === "progress" || type === "proportion" ? (
        <div className="mt-auto pt-1 h-7 flex flex-col justify-end space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-[var(--color-ink-muted)] font-medium leading-none">
            <span>
              {progressLabel || (type === "proportion" ? "Volume Share" : "Completeness")}
            </span>
            <span
              className="tabular-nums font-semibold font-mono"
              style={{ color: progressColor || accentColor }}
            >
              {Number(progressValue || 0).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-[var(--ease-saas)]"
              style={{
                width: `${Math.min(100, Math.max(0, Number(progressValue) || 0))}%`,
                backgroundColor: progressColor || accentColor,
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
