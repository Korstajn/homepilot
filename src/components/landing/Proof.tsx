import Reveal from './Reveal';

const STATS = [
  { num: '94%', label: 'Still using after 8 weeks' },
  { num: '£168', label: 'Average saved on bills, year one' },
  { num: '4.9', label: 'Average satisfaction score' },
];

const QUOTES = [
  {
    text: "I'd been meaning to switch broadband for six months. GiGi did it in a day.",
    author: 'A parent in London',
  },
  {
    text: "The school WhatsApp used to stress me out every morning. Now I get three bullet points and I'm done.",
    author: 'A parent in London',
  },
];

export default function Proof() {
  return (
    <section className="section" id="proof">
      <div className="section-inner">
        <Reveal>
          <div className="sec-tag">Early results</div>
          <h2 className="sec-h" style={{ color: 'var(--bone)' }}>
            What early families
            <br />
            <em style={{ color: 'rgba(255,255,255,0.35)' }}>told us.</em>
          </h2>
        </Reveal>
        <Reveal className="stats-grid">
          {STATS.map((s) => (
            <div className="stat-block" key={s.num}>
              <div className="sb-num">{s.num}</div>
              <div className="sb-label">{s.label}</div>
            </div>
          ))}
        </Reveal>
        <Reveal className="quotes-section">
          {QUOTES.map((q) => (
            <div className="quote-card" key={q.text}>
              <div className="quote-text">{`"${q.text}"`}</div>
              <div className="quote-author">{q.author}</div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
