import Image from 'next/image';

export default function PhotoReality() {
  return (
    <section className="chapter-photo">
      <Image
        src="/images/story-kitchen.jpg"
        alt="Kerstin with her family"
        width={1200}
        height={1093}
        sizes="(max-width: 868px) 100vw, 820px"
      />
      <div className="photo-caption">
        <div className="photo-caption-inner">
          <div className="ch-eyebrow" style={{ color: 'rgba(245,242,236,0.45)' }}>
            The reality
          </div>
          <div className="photo-quote">
            I was too. Toddlers, a renovation, a full-time job — one evening in the kitchen I
            remember thinking: there has to be a better way to hold all this.
          </div>
        </div>
      </div>
    </section>
  );
}
