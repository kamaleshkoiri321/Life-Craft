import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import FeaturesSection from '@/components/FeaturesSection';
import HowItWorksSection from '@/components/HowItWorksSection';

interface HomePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  if (searchParams) {
    const resolvedParams = await searchParams;
    const state =
      typeof resolvedParams.state === 'string'
        ? resolvedParams.state.trim()
        : '';
    const code =
      typeof resolvedParams.code === 'string' ? resolvedParams.code.trim() : '';
    const oauthError =
      typeof resolvedParams.error === 'string'
        ? resolvedParams.error.trim()
        : '';

    if (state && state.includes('.') && (code || oauthError)) {
      const callbackParams = new URLSearchParams();
      callbackParams.set('state', state);
      if (code) callbackParams.set('code', code);
      if (oauthError) callbackParams.set('error', oauthError);
      if (typeof resolvedParams.scope === 'string') {
        callbackParams.set('scope', resolvedParams.scope);
      }
      redirect(`/api/calendar/google/callback?${callbackParams.toString()}`);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#171622]">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
      </main>
    </div>
  );
}
