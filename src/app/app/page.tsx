import { redirect } from 'next/navigation';

// Digest is the home surface now (prototype IA). Send /app there.
export default function AppIndex() {
  redirect('/app/digest');
}
