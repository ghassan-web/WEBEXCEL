import { forwardRef } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

const Select = forwardRef(({
  label,
  id,
  error,
  hint,
  required = false,
  options = [],
  children,
  className = "",
  disabled = false,
  ...rest
}, ref) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-medium text-[var(--color-ink)] flex items-center gap-1"
        >
          {label}
          {required && <span className="text-[var(--color-danger)] font-bold" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative w-full">
        <select
          ref={ref}
          id={id}
          disabled={disabled}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`w-full appearance-none pl-3.5 pr-9 py-2 bg-[var(--color-surface)] border rounded-[var(--radius-control)] text-sm text-[var(--color-ink)] transition-colors cursor-pointer
            focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] focus-visible:outline-offset-1
            disabled:bg-[var(--color-surface-sunken)] disabled:text-[var(--color-ink-faint)] disabled:cursor-not-allowed
            ${error 
              ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)]/20" 
              : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
            }
            ${className}
          `}
          {...rest}
        >
          {options.length > 0 
            ? options.map((opt) => (
                <option key={opt.value ?? opt} value={opt.value ?? opt}>
                  {opt.label ?? opt}
                </option>
              ))
            : children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-ink-muted)]">
          <ChevronDownIcon className="w-4 h-4" />
        </div>
      </div>
      {error ? (
        <span id={`${id}-error`} className="text-xs font-medium text-[var(--color-danger)]" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="text-xs text-[var(--color-ink-muted)]">
          {hint}
        </span>
      ) : null}
    </div>
  );
});

Select.displayName = "Select";
export default Select;
