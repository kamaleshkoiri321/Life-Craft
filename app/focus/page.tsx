import { redirect } from 'next/navigation';

export default function TopLevelFocusRedirectPage() {
  redirect('/app/focus');
}
