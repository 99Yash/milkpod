import { redirect } from 'next/navigation';
import { OAuthButtons } from '~/app/(auth)/signin/oauth-buttons';
import { getServerSession } from '~/lib/auth/session';
import { siteConfig } from '~/lib/site';
import { EmailSignIn } from './email-signin';

export const dynamic = 'force-dynamic';

export default async function AuthenticationPage() {
  const session = await getServerSession();

  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="w-full rounded-2xl bg-background/80 p-8 backdrop-blur">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center">
          <img
            src="/favicon.svg"
            alt={`${siteConfig.name} mark`}
            className="h-12 w-12 opacity-90"
          />
        </div>
        <div className="space-y-1">
          <h1 className="text-[32px] font-normal leading-[36px] tracking-[-0.96px] font-['Perfectly_Nineties',serif]">
            Welcome to {siteConfig.name}
          </h1>
          <p className="text-[14px] font-medium leading-5 tracking-[-0.32px] text-[#666666] dark:text-muted-foreground font-(family-name:--font-inter)">
            Login or create an account
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6">
        <div className="space-y-1">
          <OAuthButtons />
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <div className="space-y-1">
          <EmailSignIn />
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        By continuing, you agree to our Terms and Privacy Policy.
      </p>
    </div>
  );
}
