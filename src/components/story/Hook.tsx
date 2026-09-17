import Reveal from '../landing/Reveal';

export default function Hook() {
  return (
    <section className="chapter chapter-light" style={{ paddingTop: 170 }}>
      <div className="ch-dots" />
      <Reveal visible className="chapter-inner" style={{ position: 'relative', zIndex: 1 }}>
        <div className="ch-eyebrow">Why I built this</div>
        <div className="ch-big">
          Every parent I know is quietly running <em>a job nobody applied for.</em>
        </div>
        <div className="ch-foot">Chief of staff for their own family.</div>
      </Reveal>
    </section>
  );
}
