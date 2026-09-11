export function Progress({ step, total = 4 }: { step: number; total?: number }) {
  return (
    <div className="row" style={{ gap: 6, marginBottom: 18 }}>
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
