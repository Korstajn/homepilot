import Image from 'next/image';
import Reveal from '../landing/Reveal';

export default function ProductChapter() {
  return (
    <section className="chapter chapter-light">
      <div className="chapter-inner">
        <div className="product-layout">
          <Reveal>
            <div className="ch-eyebrow">The product</div>
            <div className="ch-big">
              So I built <em>GiGi.</em>
            </div>
            <div className="ch-body">
              One quiet update a day. She sees what needs managing across the household — bills,
              school forms, passports, the weekly shop — and handles it on your behalf, with your
              approval at every step.
            </div>
            <div className="ch-body">
              I built it selfishly. I needed it. But if it lifts even a little of that weight off
              other parents in the same juggle, that&apos;s the whole reason I&apos;m sharing it.
            </div>
            <div className="ch-sign">
              <div className="ch-sign-name">Kerstin Skjefstad Larsson</div>
              <div className="ch-sign-role">Founder, GiGi</div>
            </div>
          </Reveal>
          <Reveal className="product-photo">
            <Image src="/images/story-park.jpg" alt="Kerstin with her family" width={1000} height={1250} sizes="(max-width: 900px) 100vw, 45vw" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
