import { redirect } from 'next/navigation';

export default function TopLevelNotesRedirectPage() {
  redirect('/app/notes');
}
