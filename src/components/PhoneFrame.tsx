// Wraps the mobile-app screens (onboarding + /app) in a phone frame on desktop,
// collapsing to full-bleed on real phones. The marketing landing does NOT use
// this — it is a full-width web page.
export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="viewport">
      <div className="phone">{children}</div>
    </div>
  );
}
