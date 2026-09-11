// Shimmer placeholders shown while a screen's data loads — replaces janky
// "Loading…" text.
export function SkeletonScreen() {
  return (
    <div className="screen" aria-busy="true" aria-label="Loading">
      <div className="skeleton sk-line" style={{ width: '40%', height: 10 }} />
      <div className="skeleton" style={{ width: '70%', height: 26, borderRadius: 8, margin: '6px 0 16px' }} />
      <div className="skeleton" style={{ height: 52, borderRadius: 999, marginBottom: 16 }} />
      <div className="skeleton sk-card" />
      <div className="skeleton sk-card" />
      <div className="skeleton sk-card" />
    </div>
  );
}
