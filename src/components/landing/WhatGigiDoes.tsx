import Reveal from './Reveal';

// The verticals GiGi covers, each shown through a line she would actually send.
const VERTICALS = [
  {
    icon: '💳',
    title: 'Bills',
    example: 'Found a better broadband deal. Saving you £168 this year. Switch confirmed.',
  },
  {
    icon: '📋',
    title: 'Household admin',
    example: "Ella's trip consent form is due today. Finn has PE kit tomorrow.",
  },
  {
    icon: '🗓️',
    title: 'Scheduling & coordination',
    example: "Ella's passport expires in July. Trip's in August — renew now.",
  },
  {
    icon: '🎒',
    title: 'School & children',
    example: "Reading the class WhatsApp so you don't have to — sports day moved to Friday.",
  },
  {
    icon: '🛒',
    title: 'Groceries',
    example: "This week's basket is ready — 3 swaps flagged. Approve to order.",
  },
  {
    icon: '🔔',
    title: 'Reminders & contracts',
    example: 'Your gym contract renews in 12 days — cancel or keep?',
  },
];

export default function WhatGigiDoes() {
  return (
    <section className="section" id="what">
      <div className="section-inner">
        <Reveal className="what-intro">
          <div className="sec-tag">What GiGi does</div>
          <h2 className="sec-h">
            Some of the many things
            <br />
            <em>GiGi can help with.</em>
          </h2>
          <p className="sec-lead" style={{ margin: '0 auto' }}>
            Household admin, scheduling, and coordination — handled automatically, every week.
          </p>
        </Reveal>
        <div className="verticals-grid">
          {VERTICALS.map((v) => (
            <Reveal className="vert" key={v.title}>
              <div className="vert-icon" aria-hidden="true">
                {v.icon}
              </div>
              <div className="vert-title">{v.title}</div>
              <div className="vert-example">{v.example}</div>
            </Reveal>
          ))}
        </div>
        <Reveal className="also-strip">
          And whatever else family life throws at you — GiGi keeps learning what your household needs.
        </Reveal>
      </div>
    </section>
  );
}
