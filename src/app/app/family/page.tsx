'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { trackClient } from '@/lib/analytics';
import type { Child, MemberRole } from '@/lib/types';

interface MemberRow {
  id: string; name: string; email: string; role: MemberRole; status: string; isYou: boolean; inviteToken?: string;
}

const ROLE_LABEL: Record<MemberRole, string> = { owner: 'Owner', adult: 'Co-parent', teen: 'Teen' };

export default function Family() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [toast, setToast] = useState('');
  const [invite, setInvite] = useState<{ open: boolean; link?: string }>({ open: false });

  async function load() {
    const j = await fetch('/api/members').then((r) => r.json());
    setMembers(j.members ?? []);
    setChildren(j.children ?? []);
    setCanManage(Boolean(j.canManage));
  }
  useEffect(() => { load(); trackClient('family_viewed'); }, []);

  function showToast(m: string) { setToast(m); setTimeout(() => setToast(''), 2600); }

  async function removeMember(id: string) {
    if (!confirm('Remove this family member? They lose access immediately.')) return;
    await fetch(`/api/members/${id}`, { method: 'DELETE' });
    showToast('Removed.');
    load();
  }

  async function removeChild(id: string) {
    if (!confirm('Remove this child profile?')) return;
    await fetch(`/api/children?id=${id}`, { method: 'DELETE' });
    showToast('Removed.');
    load();
  }

  return (
    <div className="screen">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>Family</h1>
        <Link href="/app/settings" className="pill">← Settings</Link>
      </div>
      <p className="small muted">Everyone in your household. Co-parents can act; teens get a limited view.</p>

      <h2 style={{ fontSize: 18, marginTop: 16 }}>Adults &amp; teens</h2>
      <div className="stack">
        {members.map((m) => (
          <div className="card" key={m.id}>
            <div className="row between">
              <div>
                <h3 style={{ margin: 0 }}>{m.name} {m.isYou && <span className="tiny muted">(you)</span>}</h3>
                <span className="tiny muted">{m.email}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`pill ${m.role === 'owner' ? 'brand' : ''}`}>{ROLE_LABEL[m.role]}</span>
                {m.status === 'invited' && <div className="tiny" style={{ color: 'var(--accent)', marginTop: 4 }}>Invited · pending</div>}
              </div>
            </div>
            {m.inviteToken && (
              <div className="stack" style={{ marginTop: 10 }}>
                <div className="row between" style={{ background: 'var(--surface-2)', padding: '8px 12px', borderRadius: 10 }}>
                  <code className="tiny" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inviteLink(m.inviteToken)}</code>
                  <button className="btn btn-subtle btn-sm" onClick={() => { navigator.clipboard?.writeText(inviteLink(m.inviteToken!)); showToast('Invite link copied.'); }}>Copy</button>
                </div>
                <p className="tiny muted" style={{ margin: 0 }}>Share this link with {m.name} to let them join. (In production it&apos;s emailed.)</p>
              </div>
            )}
            {canManage && m.role !== 'owner' && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => removeMember(m.id)}>Remove</button>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        invite.open ? (
          <InviteForm onDone={(link) => { setInvite({ open: false, link }); load(); if (link) showToast('Invite created — copy the link below.'); }} onCancel={() => setInvite({ open: false })} />
        ) : (
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { setInvite({ open: true }); trackClient('invite_opened'); }}>
            + Invite a family member
          </button>
        )
      )}

      <div className="divider" />
      <h2 style={{ fontSize: 18 }}>Children</h2>
      <p className="small muted" style={{ marginTop: 0 }}>
        Profiles only — no login. Used to link school emails and passport reminders.
      </p>
      <div className="stack">
        {children.map((c) => (
          <div className="card row between" key={c.id}>
            <div>
              <h3 style={{ margin: 0 }}>{c.name}</h3>
              <span className="tiny muted">
                {[c.yearGroup, c.passportExpiry ? `passport exp. ${c.passportExpiry}` : null].filter(Boolean).join(' · ') || 'No details'}
              </span>
            </div>
            {canManage && <button className="btn btn-ghost btn-sm" onClick={() => removeChild(c.id)}>Remove</button>}
          </div>
        ))}
        {children.length === 0 && <p className="small muted">No children added yet.</p>}
      </div>
      {canManage && <AddChild onDone={load} />}

      <div className="banner ok" style={{ marginTop: 18 }}>
        Children&apos;s details are special-category data: kept minimal, never shared with other
        families, and erased with one tap. Every change is in your <Link href="/app/data" className="link" style={{ color: 'inherit' }}>data log</Link>.
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function inviteLink(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/join/${token}`;
}

function InviteForm({ onDone, onCancel }: { onDone: (link?: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'adult' | 'teen'>('adult');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError('');
    setBusy(true);
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Could not invite.'); return; }
    const j = await res.json();
    trackClient('member_invited', { role });
    onDone(typeof window !== 'undefined' ? `${window.location.origin}/join/${j.inviteToken}` : undefined);
  }

  return (
    <div className="card stack" style={{ marginTop: 12, borderColor: 'var(--brand)' }}>
      <h3>Invite a family member</h3>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Their name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anders" />
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Their email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="them@example.com" />
      </label>
      <div>
        <span className="small" style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>Role</span>
        <div className="choices">
          <button className={`choice ${role === 'adult' ? 'selected' : ''}`} onClick={() => setRole('adult')}>Co-parent (can act)</button>
          <button className={`choice ${role === 'teen' ? 'selected' : ''}`} onClick={() => setRole('teen')}>Teen (limited view)</button>
        </div>
      </div>
      {error && <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" disabled={!name || !email || busy} onClick={submit}>{busy ? 'Inviting…' : 'Create invite'}</button>
      </div>
    </div>
  );
}

function AddChild({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [yearGroup, setYearGroup] = useState('');
  const [passportExpiry, setPassportExpiry] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await fetch('/api/children', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, yearGroup, passportExpiry }),
    });
    trackClient('child_added');
    setBusy(false);
    setName(''); setYearGroup(''); setPassportExpiry(''); setOpen(false);
    onDone();
  }

  if (!open) return <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>+ Add a child</button>;
  return (
    <div className="card stack" style={{ marginTop: 12, borderColor: 'var(--brand)' }}>
      <h3>Add a child</h3>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ella" />
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Year group <span className="muted tiny">— optional</span></span>
        <input value={yearGroup} onChange={(e) => setYearGroup(e.target.value)} placeholder="e.g. Year 4" />
      </label>
      <label className="field" style={{ marginBottom: 0 }}>
        <span>Passport expiry <span className="muted tiny">— optional</span></span>
        <input type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} />
      </label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn btn-primary" disabled={!name || busy} onClick={submit}>{busy ? 'Adding…' : 'Add child'}</button>
      </div>
    </div>
  );
}
