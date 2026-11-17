import React from "react";
import { InboxIcon } from "@heroicons/react/24/outline";

export default function EmptyState({
  icon: Icon = InboxIcon,
  title = "Tidak ada data",
  description = "Belum ada data yang tersedia untuk filter saat ini.",
  action,
  className = "",
  ...rest
}) {
  const renderIcon = () => {
    if (!Icon) return null;
    if (React.isValidElement(Icon)) return Icon;
    const Component = Icon;
    return <Component className="w-5 h-5" aria-hidden="true" />;
  };

  return (
    <div
      className={`flex flex-col items-center justify-center py-8 px-6 sm:py-10 text-center bg-[var(--color-surface)] border border-dashed border-[var(--color-line)] rounded-[var(--radius-card)] select-none ${className}`}
      {...rest}
    >
      <div className="w-10 h-10 bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] rounded-lg flex items-center justify-center mb-3 border border-[var(--color-line)]">
        {renderIcon()}
      </div>

      <h3 className="text-sm font-semibold text-[var(--color-ink)] tracking-tight">
        {title}
      </h3>
      {description && (
        <p className="text-xs text-[var(--color-ink-muted)] mt-1 max-w-sm leading-relaxed">
          {description}
        </p>
      )}

      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  );
}
