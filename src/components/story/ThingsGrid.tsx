import Reveal from '../landing/Reveal';

const THINGS = [
  { icon: '💳', name: 'Bills' },
  { icon: '🎒', name: 'School & admin' },
  { icon: '✈️', name: 'Travel' },
  { icon: '🛒', name: 'Groceries' },
  { icon: '🍷', name: 'Date night' },
  { icon: '🏋️', name: 'Workouts' },
];

export default function ThingsGrid() {
  return (
    <section className="chapter chapter-light" style={{ paddingTop: 0 }}>
      <div className="chapter-inner">
        <Reveal>
          <div className="ch-eyebrow">What GiGi can help with</div>
          <div className="ch-big">
            More than <em>you&apos;d think.</em>
          </div>
        </Reveal>
        <div className="things-grid">
          {THINGS.map((t) => (
            <Reveal className="thing" key={t.name}>
              <div className="thing-icon" aria-hidden="true">
                {t.icon}
              </div>
              <div className="thing-name">{t.name}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
