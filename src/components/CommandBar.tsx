'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import Icon from './Icon';

// The ambient command bar — "What can I help with today?" — embedded at the top
// of the main screens. Voice and text are one input, and GiGi answers INLINE
// (a card that expands right here), never a page navigation.
export default function CommandBar() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [value, setValue] = useState('');
  const [asked, setAsked] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const recogRef = useRef<any>(null);

  useEffect(() => {
    const SR = (typeof window !== 'undefined') && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    if (!SR) { setSupported(false); return; }
    const r = new SR();
    r.lang = 'en-GB';
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      const t = Array.from(e.results).map((res: any) => res[0].transcript).join('');
      setValue(t);
      if (e.results[e.results.length - 1].isFinal) ask(t);
    };
    r.onend = () => setListening(false);
    r.onerror = (e: any) => {
      setListening(false);
      const map: Record<string, string> = {
        'not-allowed': 'Microphone blocked — allow the mic for this site, or just type.',
        'service-not-allowed': 'Microphone blocked — allow the mic for this site, or just type.',
        'no-speech': "I didn't catch that — try again, or type.",
        'audio-capture': 'No microphone found — you can type instead.',
      };
      setNotice(map[e?.error] ?? '');
    };
    recogRef.current = r;
    return () => { try { r.stop(); } catch {} speechSynthesis?.cancel?.(); };
  }, []);

  function toggleMic() {
    const r = recogRef.current;
    if (!r) return;
    if (listening) { r.stop(); setListening(false); return; }
    setReply(''); setNotice(''); setValue('');
    try { r.start(); setListening(true); trackClient('voice_listen'); }
    catch { setNotice('Could not start the microphone — you can type instead.'); }
  }

  async function ask(message: string) {
    const m = message.trim();
    if (!m) return;
    setAsked(m); setValue(''); setBusy(true); setReply(''); setNotice('');
    const res = await fetch('/api/assistant', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: m }),
    });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    const text = j.reply ?? 'Sorry, something went wrong.';
    setReply(text);
    if (j.error) setNotice(`Details: ${j.error}`);
    speak(text);
  }

  function speak(text: string) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB';
      const v = speechSynthesis.getVoices().find((x) => /en-GB/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch {}
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="cmdbar">
        <button
          className={`cmd-mic${listening ? ' listening' : ''}`}
          aria-label={listening ? 'Stop listening' : 'Talk to GiGi'}
          onClick={toggleMic}
          disabled={!supported}
          style={{ background: listening ? 'var(--today)' : 'var(--brand)' }}
        >
          <Icon name="mic" size={18} strokeWidth={1.8} />
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={listening ? 'Listening…' : 'What can I help with today?'}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(value); }}
          className="cmd-input"
        />
        {value.trim() && !listening && (
          <button className="btn btn-primary btn-sm" style={{ marginRight: 4 }} onClick={() => ask(value)}>Ask</button>
        )}
      </div>

      {(busy || reply) && (
        <div className="card pop-in" style={{ marginTop: 8, borderColor: 'var(--brand)' }}>
          {asked && <p className="tiny muted" style={{ margin: 0 }}>“{asked}”</p>}
          <p style={{ margin: '4px 0 0' }}>{busy ? '…' : reply}</p>
          {reply && !busy && (
            <button className="link tiny" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 6 }} onClick={() => { setReply(''); setAsked(''); }}>
              Dismiss
            </button>
          )}
        </div>
      )}
      {notice && (
        <p className="tiny muted" style={{ margin: '6px 2px 0', wordBreak: 'break-word' }}>
          {notice} {notice.startsWith('Details') ? '' : <Link href="/app/data" className="link">Why?</Link>}
        </p>
      )}
    </div>
  );
}
