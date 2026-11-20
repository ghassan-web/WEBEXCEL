import { createContext, useContext, useState } from "react";

const TabsContext = createContext(null);

export function Tabs({
  items,
  value: controlledValue,
  defaultValue,
  activeId,
  onChange,
  onValueChange,
  variant = "underline",
  className = "",
  children,
  ...rest
}) {
  const [uncontrolledValue, setUncontrolledValue] = useState(
    defaultValue || (items && (items[0]?.value !== undefined ? items[0]?.value : items[0]?.id)) || ""
  );

  const isControlled = controlledValue !== undefined || activeId !== undefined;
  const currentValue = isControlled
    ? (controlledValue !== undefined ? controlledValue : activeId)
    : uncontrolledValue;

  const handleValueChange = (newVal) => {
    if (!isControlled) {
      setUncontrolledValue(newVal);
    }
    onChange?.(newVal);
    onValueChange?.(newVal);
  };

  if (children) {
    return (
      <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange }}>
        <div className={`flex flex-col gap-2 ${className}`} {...rest}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }

  if (variant === "pills") {
    return (
      <div
        role="tablist"
        className={`inline-flex items-center gap-1 p-1 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-full shadow-[var(--shadow-raised)] overflow-x-auto scrollbar-none select-none w-fit ${className}`}
        {...rest}
      >
        {(items || []).map((item) => {
          const itemValue = item.value !== undefined ? item.value : item.id;
          const isSelected = currentValue === itemValue;
          const Icon = item.icon;

          return (
            <button
              key={itemValue}
              role="tab"
              type="button"
              aria-selected={isSelected}
              onClick={() => handleValueChange(itemValue)}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-150 ease-[var(--ease-saas)] whitespace-nowrap cursor-pointer ${
                isSelected
                  ? "bg-[var(--color-brand)] text-white shadow-sm font-semibold"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />}
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge !== null && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)]"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 border-b border-[var(--color-line)] overflow-x-auto scrollbar-none select-none ${className}`}
      {...rest}
    >
      {(items || []).map((item) => {
        const itemValue = item.value !== undefined ? item.value : item.id;
        const isSelected = currentValue === itemValue;
        const Icon = item.icon;

        return (
          <button
            key={itemValue}
            role="tab"
            type="button"
            aria-selected={isSelected}
            onClick={() => handleValueChange(itemValue)}
            className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-all duration-150 whitespace-nowrap cursor-pointer -mb-px focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] focus-visible:outline-offset-2 ${
              isSelected
                ? "border-[var(--color-brand)] text-[var(--color-ink)]"
                : "border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:border-[var(--color-line-strong)]"
            }`}
          >
            {Icon && (
              <Icon
                className={`w-4 h-4 shrink-0 ${isSelected ? "text-[var(--color-brand)]" : "text-[var(--color-ink-muted)]"}`}
                aria-hidden="true"
              />
            )}
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge !== null && (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                  isSelected
                    ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                    : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] border border-[var(--color-line)]"
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabsList({ className = "", children, ...rest }) {
  return (
    <div
      role="tablist"
      className={`inline-flex items-center gap-1 p-1 bg-[var(--color-surface-sunken)] border border-[var(--color-line)] rounded-full text-[var(--color-ink-muted)] select-none ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, className = "", children, disabled = false, ...rest }) {
  const context = useContext(TabsContext);
  const isSelected = context ? context.value === value : false;

  return (
    <button
      role="tab"
      type="button"
      aria-selected={isSelected}
      disabled={disabled}
      onClick={() => context?.onValueChange(value)}
      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-[13px] font-semibold rounded-full transition-all duration-150 ease-[var(--ease-saas)] cursor-pointer whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] disabled:pointer-events-none disabled:opacity-50 ${
        isSelected
          ? "bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line)] shadow-sm font-bold"
          : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface)]/70"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className = "", children, ...rest }) {
  const context = useContext(TabsContext);
  if (!context || context.value !== value) return null;

  return (
    <div
      role="tabpanel"
      className={`outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Tabs;
