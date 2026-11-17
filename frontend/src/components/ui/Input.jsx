import { forwardRef } from "react";

const Input = forwardRef(({
  label,
  id,
  error,
  hint,
  required = false,
  className = "",
  type = "text",
  disabled = false,
  ...rest
}, ref) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={id}
          className="text-[var(--text-caption)] font-medium text-[var(--color-ink)] flex items-center gap-1"
        >
          {label}
          {required && <span className="text-[var(--color-danger)] font-bold" aria-hidden="true">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        type={type}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={`w-full px-3.5 py-2 bg-[var(--color-surface)] border rounded-[var(--radius-control)] text-[var(--text-body)] text-[var(--color-ink)] transition-colors 
          placeholder:text-[var(--color-ink-faint)]
          focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] focus-visible:outline-offset-1
          disabled:bg-[var(--color-surface-sunken)] disabled:text-[var(--color-ink-faint)] disabled:cursor-not-allowed
          ${error 
            ? "border-[var(--color-danger)] bg-[var(--color-danger-soft)]/20" 
            : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
          }
          ${className}
        `}
        {...rest}
      />
      {error ? (
        <span id={`${id}-error`} className="text-[var(--text-caption)] font-medium text-[var(--color-danger)]" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="text-[var(--text-caption)] text-[var(--color-ink-muted)]">
          {hint}
        </span>
      ) : null}
    </div>
  );
});

Input.displayName = "Input";
export default Input;
