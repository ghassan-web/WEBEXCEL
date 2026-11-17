import { ExclamationTriangleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import Button from "./Button";

export default function ErrorState({
  title = "Gagal memuat data",
  description = "Terjadi kesalahan saat menghubungi server.",
  onRetry,
  className = "",
  ...rest
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center py-8 px-6 text-center bg-[var(--color-danger-soft)]/40 border border-[var(--color-danger)]/20 rounded-[var(--radius-card)] ${className}`}
      {...rest}
    >
      <div className="w-10 h-10 bg-[var(--color-danger-soft)] text-[var(--color-danger)] rounded-lg flex items-center justify-center mb-3 border border-[var(--color-danger)]/20">
        <ExclamationTriangleIcon className="w-5 h-5" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-[var(--color-ink)] tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-[var(--color-ink-muted)] mt-1 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" icon={ArrowPathIcon} onClick={onRetry}>
            Coba Lagi
          </Button>
        </div>
      )}
    </div>
  );
}
