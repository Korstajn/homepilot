// Smooth in-page scrolling, as on the reference landing page. Anchor clicks and
// the "Join the waitlist" buttons both come through here.
export function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

export function onAnchorClick(id: string) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    scrollToId(id);
  };
}
