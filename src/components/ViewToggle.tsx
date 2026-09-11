'use client';

import Icon from './Icon';

export default function ViewToggle({ value, onChange }: { value: 'desktop' | 'mobile'; onChange: (v: 'desktop' | 'mobile') => void }) {
  return (
    <div className="view-toggle" role="group" aria-label="Choose view">
      <button className={value === 'desktop' ? 'on' : ''} onClick={() => onChange('desktop')} aria-pressed={value === 'desktop'}>
        <Icon name="monitor" size={15} /> Desktop
      </button>
      <button className={value === 'mobile' ? 'on' : ''} onClick={() => onChange('mobile')} aria-pressed={value === 'mobile'}>
        <Icon name="phone" size={15} /> App
      </button>
    </div>
  );
}
