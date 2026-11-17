export default function Skeleton({ className = "", ...rest }) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius-control)] bg-[var(--color-line)]/70 ${className}`}
      {...rest}
    />
  );
}
