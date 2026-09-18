import Reveal from '../landing/Reveal';

/**
 * Statement on the left, the paragraph that qualifies it on the right.
 *
 * As a single centred column this was one line of display type in a black box
 * the height of a screen — the emptiest thing on the page. Split, both halves
 * carry something and the chapter is the size of what it says.
 */
export default function Realisation() {
  return (
    <section className="chapter chapter-dark">
      <Reveal className="chapter-inner">
        <div className="ch-eyebrow">The realisation</div>
        <div className="chapter-split">
          <div className="ch-big">You can&apos;t hand off what&apos;s only living in your head.</div>
          <div className="ch-body">
            The mental load stays invisible until someone actually writes it down.{' '}
            <strong>
              The moment it&apos;s written down, it stops being a feeling — and becomes a list you
              can delegate.
            </strong>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
