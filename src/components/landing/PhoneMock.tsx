'use client';

import { useState } from 'react';

/** The hero product shot: a static replica of the 7am digest. */
export default function PhoneMock() {
  const [approved, setApproved] = useState(false);

  return (
    <div className="phone-frame">
      <div className="phone-screen">
        <div className="phone-notch" />
        <div className="phone-header">
          <div className="ph-eyebrow">GiGi · THURSDAY</div>
          <div className="ph-title">Good morning, Sarah</div>
          <div className="ph-sub">3 things today</div>
          <div className="ph-askbar">
            <div className="ph-mic">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" />
              </svg>
            </div>
            <div className="ph-ask-text">What can I help with today?</div>
          </div>
        </div>
        <div className="phone-body">
          <div className="ph-pill">
            <div className="ph-pill-dot" />
            <div className="ph-pill-text">
              <strong>GiGi is running.</strong> Bills, school &amp; travel monitored around the clock.
            </div>
          </div>
          <div className="ph-impact-label">
            Your impact <span>since you joined</span>
          </div>
          <div className="ph-impact-row">
            <ImpactTile value="£412" label="money saved" green />
            <ImpactTile value="18 hrs" label="time saved" />
            <ImpactTile value="47" label="tasks managed" />
          </div>
          <div className="ph-card">
            <div className="ph-card-title">TODAY</div>
            <PhoneItem dot="#E24B4A" text="Ella's trip consent due today" chip="DUE" chipClass="chip-amber" />
            <PhoneItem dot="#2D6A4F" text="Broadband deal — save £168/yr" chip="READY" chipClass="chip-green" />
            <PhoneItem dot="#3730A3" text="Book a babysitter — Thu 7pm" chip="BOOK" chipClass="chip-blue" />
          </div>
          <button
            className="ph-btn"
            style={approved ? { background: '#166534' } : undefined}
            onClick={() => setApproved(true)}
          >
            {approved ? '✓ Switch confirmed' : 'Approve broadband switch →'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImpactTile({ value, label, green = false }: { value: string; label: string; green?: boolean }) {
  return (
    <div className="ph-impact-tile">
      <div className={`ph-impact-val${green ? ' green' : ''}`}>{value}</div>
      <div className="ph-impact-lbl">{label}</div>
    </div>
  );
}

function PhoneItem({ dot, text, chip, chipClass }: { dot: string; text: string; chip: string; chipClass: string }) {
  return (
    <div className="ph-item">
      <div className="ph-dot" style={{ background: dot }} />
      <div className="ph-text">{text}</div>
      <div className={`ph-chip ${chipClass}`}>{chip}</div>
    </div>
  );
}
