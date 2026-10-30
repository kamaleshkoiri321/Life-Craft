import { redirect } from 'next/navigation';

export default function TopLevelSettingsRedirectPage() {
  redirect('/app/settings');
}
