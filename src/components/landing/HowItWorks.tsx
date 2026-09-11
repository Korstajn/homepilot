import Reveal from './Reveal';

const STEPS = [
  {
    num: '1',
    title: 'Connect your household',
    desc: 'Email, calendar, and your supermarket account. Read-only — GiGi never acts without your approval.',
  },
  {
    num: '2',
    title: 'GiGi runs in the background',
    desc: 'Bills monitored, school emails read, calendar checked — every day, without you lifting a finger.',
  },
  {
    num: '3',
    title: 'One digest, one tap',
    desc: 'A short morning briefing with only what matters. Approve a switch or booking with a single tap.',
  },
];

export default function HowItWorks() {
  return (
    <section className="section" id="how">
      <div className="section-inner">
        <Reveal>
          <div className="sec-tag">How it works</div>
          <h2 className="sec-h">
            Set up once.
            <br />
            <em>It runs itself.</em>
          </h2>
          <p className="sec-lead">
            No weekly input needed. GiGi checks quietly in the background and only surfaces what
            genuinely needs you.
          </p>
        </Reveal>
        <div className="how-steps">
          {STEPS.map((s) => (
            <Reveal className="how-step" key={s.num}>
              <div className="step-num">{s.num}</div>
              <div className="step-title">{s.title}</div>
              <div className="step-desc">{s.desc}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
