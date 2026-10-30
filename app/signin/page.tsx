import { redirect } from 'next/navigation';

export default function LegacySignInRedirectPage() {
  redirect('/sign-in');
}
