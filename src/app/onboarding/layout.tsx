import AuthFrame from '@/components/AuthFrame';
import OnboardingAside from '@/components/OnboardingAside';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AuthFrame aside={<OnboardingAside />}>{children}</AuthFrame>;
}
