import { BackpackIcon, BillsIcon, CartIcon, DumbbellIcon, PlaneIcon, WineIcon } from '../landing/icons';
import Reveal from '../landing/Reveal';

/**
 * Six cards of "what GiGi can help with".
 *
 * Each one used to be an icon, two words, and then a third of a card of
 * nothing. "Bills" tells a reader who already knows what bills are precisely
 * nothing — so every card now carries the sentence someone would actually say
 * to GiGi about it, which is both the point of the product and the thing that
 * earns the card its space. Same device as the homepage's verticals grid.
 */
const THINGS = [
  { icon: <BillsIcon />, name: 'Bills', example: 'Virgin renews in 12 days — find me a better deal.' },
  { icon: <BackpackIcon />, name: 'School & admin', example: 'What did the school ask for this week?' },
  { icon: <PlaneIcon />, name: 'Travel', example: 'Are everyone’s passports valid for October?' },
  { icon: <CartIcon />, name: 'Groceries', example: 'Same order as last Thursday, plus nappies.' },
  { icon: <WineIcon />, name: 'Date night', example: 'Friday, somewhere local — and a sitter.' },
  { icon: <DumbbellIcon />, name: 'Workouts', example: 'Two mornings a week that don’t clash.' },
];

export default function ThingsGrid() {
  return (
    <section className="chapter chapter-light">
      <div className="chapter-inner">
        <Reveal>
          <div className="ch-eyebrow">What GiGi can help with</div>
          <div className="ch-big">
            More than <em>you&apos;d think.</em>
          </div>
        </Reveal>
        <div className="things-grid">
          {THINGS.map((t) => (
            <Reveal className="thing" key={t.name}>
              <div className="thing-icon">{t.icon}</div>
              <div className="thing-name">{t.name}</div>
              <div className="thing-example">{t.example}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
