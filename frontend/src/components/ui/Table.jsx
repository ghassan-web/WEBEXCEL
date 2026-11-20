import { createContext, useContext } from "react";

const TableContext = createContext({ dense: false, stickyHeader: false });

export function Table({
  children,
  stickyHeader = false,
  dense = false,
  className = "",
  containerClassName = "",
  ...rest
}) {
  return (
    <TableContext.Provider value={{ dense, stickyHeader }}>
      <div className={`w-full overflow-x-auto table-scroll bg-[var(--color-surface)] ${containerClassName}`}>
        <table className={`w-full text-left border-collapse text-xs sm:text-[13px] text-[var(--color-ink-body)] ${className}`} {...rest}>
          {children}
        </table>
      </div>
    </TableContext.Provider>
  );
}

export function TableHeader({ children, className = "", ...rest }) {
  const { stickyHeader } = useContext(TableContext);
  return (
    <thead
      className={`border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)] ${
        stickyHeader ? "sticky top-0 z-10 backdrop-blur-[2px]" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </thead>
  );
}

export function TableBody({ children, className = "", ...rest }) {
  return (
    <tbody className={`divide-y divide-[var(--color-line)]/60 ${className}`} {...rest}>
      {children}
    </tbody>
  );
}

export function TableRow({ children, className = "", isSelected = false, ...rest }) {
  return (
    <tr
      className={`transition-colors duration-100 hover:bg-[var(--color-surface-sunken)]/60 ${
        isSelected ? "bg-[var(--color-brand-soft)]/50" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  className = "",
  numeric = false,
  align = "left",
  ...rest
}) {
  const { dense } = useContext(TableContext);
  const textAlign = numeric ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <th
      scope="col"
      className={`${dense ? "px-3 py-2" : "px-3.5 py-2.5"} text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)] ${textAlign} whitespace-nowrap select-none ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className = "",
  numeric = false,
  align = "left",
  ...rest
}) {
  const { dense } = useContext(TableContext);
  const textAlign = numeric ? "text-right font-mono tabular-nums" : align === "center" ? "text-center" : "text-left";

  return (
    <td
      className={`${dense ? "px-3 py-2" : "px-3.5 py-2.5"} text-[var(--color-ink-body)] ${textAlign} ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
