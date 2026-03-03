'use client';

import { useRouter } from 'next/navigation';
import React from 'react';
import { toast } from 'sonner';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { useLastAuthMethod } from '~/hooks/use-last-auth-method';
import { api } from '~/lib/api';
import { authClient } from '~/lib/auth/client';
import { LAST_AUTH_METHOD_KEY } from '~/lib/constants';
import { getErrorMessage, setLocalStorageItem } from '~/lib/utils';

type Step = 'email' | 'otp';

const RESEND_COOLDOWN_SECS = 30;

export function EmailSignIn() {
  const router = useRouter();
  const lastAuthMethod = useLastAuthMethod();
  const [step, setStep] = React.useState<Step>('email');
  const [email, setEmail] = React.useState('');
  const [otp, setOtp] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [resendCountdown, setResendCountdown] = React.useState(0);

  React.useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const handleResendOtp = async () => {
    setResendCountdown(RESEND_COOLDOWN_SECS);
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });
      if (result.error) {
        toast.error(result.error.message ?? 'Failed to resend code.');
        return;
      }
      toast.success('A new code has been sent.');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setIsLoading(true);
    try {
      // Check for provider conflict before sending OTP
      const { data: check } = await api['auth']['check-email-provider'].post({
        email: trimmed,
      });

      if (check && 'conflict' in check && check.conflict) {
        const provider =
          'existingProvider' in check
            ? (check.existingProvider as string)
            : 'another provider';
        toast.error(
          `This email is registered with ${provider === 'google' ? 'Google' : provider}. Please use ${provider === 'google' ? 'Google' : provider} to sign in.`,
        );
        setIsLoading(false);
        return;
      }

      const result = await authClient.emailOtp.sendVerificationOtp({
        email: trimmed,
        type: 'sign-in',
      });

      if (result.error) {
        toast.error(result.error.message ?? 'Failed to send verification code.');
        setIsLoading(false);
        return;
      }

      setEmail(trimmed);
      setStep('otp');
      setResendCountdown(RESEND_COOLDOWN_SECS);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;

    setIsLoading(true);
    try {
      const result = await authClient.signIn.emailOtp({
        email,
        otp,
      });

      if (result.error) {
        toast.error(result.error.message ?? 'Invalid or expired code.');
        setIsLoading(false);
        return;
      }

      setLocalStorageItem(LAST_AUTH_METHOD_KEY, 'EMAIL');
      router.replace('/');
    } catch (error) {
      toast.error(getErrorMessage(error));
      setIsLoading(false);
    }
  };

  if (step === 'otp') {
    return (
      <form className="grid gap-3" onSubmit={handleVerifyOtp} noValidate>
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code sent to <strong>{email}</strong>
        </p>
        <Input
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          className="bg-background text-center tracking-[0.3em] text-lg"
          disabled={isLoading}
          maxLength={6}
        />
        <Button disabled={isLoading || otp.length !== 6} type="submit" className="relative">
          <span className="text-sm">
            {isLoading ? 'Verifying...' : 'Verify code'}
          </span>
          {isLoading ? <Spinner /> : null}
        </Button>
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="justify-start px-0 text-muted-foreground"
            onClick={() => {
              setStep('email');
              setOtp('');
            }}
            disabled={isLoading}
          >
            Use a different email
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="px-0 text-muted-foreground"
            onClick={handleResendOtp}
            disabled={isLoading || resendCountdown > 0}
          >
            {resendCountdown > 0
              ? `Resend in ${resendCountdown}s`
              : 'Resend code'}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form className="grid gap-3" onSubmit={handleSendOtp} noValidate>
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        placeholder="name@example.com"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect="off"
        className="bg-background"
        disabled={isLoading}
      />
      <Button disabled={isLoading || !email.trim()} type="submit" className="relative">
        <span className="text-sm">
          {isLoading ? 'Sending code...' : 'Continue with Email'}
        </span>
        {isLoading ? (
          <Spinner />
        ) : (
          lastAuthMethod === 'EMAIL' && (
            <i className="text-xs absolute right-4 text-muted text-center">
              Last used
            </i>
          )
        )}
      </Button>
    </form>
  );
}
