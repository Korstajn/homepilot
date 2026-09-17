/**
 * The four-segment bar at the top of each onboarding step.
 *
 * Hidden on desktop (see `.onboard-progress` in globals.css), where the panel
 * beside the form names the same four steps in full. Showing both would be the
 * same information twice, and the bar is the less useful of the two.
 */
export function Progress({ step, total = 4 }: { step: number; total?: number }) {
  return (
    <div className="row onboard-progress" style={{ gap: 6, marginBottom: 18 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 4,
            borderRadius: 2,
            flex: 1,
            background: i < step ? 'var(--brand)' : 'var(--border)',
          }}
        />
      ))}
    </div>
  );
}
