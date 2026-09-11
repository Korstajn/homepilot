// Re-mounts on every in-app navigation, so the content cross-fades smoothly as
// screens swap (works alongside the per-block stagger in .screen > *).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
