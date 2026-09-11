const ITEMS: { num: string; text: React.ReactNode }[] = [
  { num: '01', text: <><strong>Tell GiGi exactly what you need</strong> — then let the magic happen.</> },
  { num: '02', text: <><strong>You always stay in control.</strong> Nothing happens without your approval.</> },
  { num: '03', text: <>Every experience we design exists to <strong>simplify your household admin.</strong></> },
];

export default function Manifesto() {
  return (
    <section id="manifesto">
      <div className="manifesto-grid">
        {ITEMS.map((item) => (
          <div className="manifesto-item" key={item.num}>
            <div className="manifesto-num">{item.num}</div>
            <div className="manifesto-text">{item.text}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
