'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import React from 'react';
import {
  Controller,
  type FieldPath,
  type Resolver,
  useForm,
} from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod/v4';
import { Button } from '~/components/ui/button';
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { useLastAuthMethod } from '~/hooks/use-last-auth-method';
import { authClient } from '~/lib/auth/client';
import { LAST_AUTH_METHOD_KEY } from '~/lib/constants';
import { getErrorMessage, setLocalStorageItem } from '~/lib/utils';

const signInSchema = z.object({
  email: z.email().max(255, 'Email must be less than 255 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const signUpSchema = signInSchema.extend({
  name: z.string().min(1, 'Name is required'),
});

type SignInPayload = z.infer<typeof signInSchema>;
type SignUpPayload = z.infer<typeof signUpSchema>;
type AuthMode = 'signin' | 'signup';
type AuthFormValues = SignInPayload & { name?: string };

export function EmailSignIn() {
  const router = useRouter();
  const lastAuthMethod = useLastAuthMethod();
  const [mode, setMode] = React.useState<AuthMode>('signin');

  const authSchema = React.useMemo(
    () => (mode === 'signup' ? signUpSchema : signInSchema),
    [mode]
  );
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema) as Resolver<AuthFormValues>,
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
    shouldUnregister: true,
  });
  const isSubmitting = form.formState.isSubmitting;
  const buttonLabel =
    mode === 'signup' ? 'Create account' : 'Sign In with Email';
  const loadingLabel =
    mode === 'signup' ? 'Creating account...' : 'Signing in...';

  const persistLastAuthMethod = () => {
    setLocalStorageItem(LAST_AUTH_METHOD_KEY, 'EMAIL');
  };

  const runAuth = async ({
    action,
    fallbackError,
    successMessage,
  }: {
    action: () => Promise<{ error?: { message?: string } | null } | undefined>;
    fallbackError: string;
    successMessage: string;
  }) => {
    try {
      const result = await action();
      if (result?.error) {
        toast.error(result.error.message ?? fallbackError);
        return;
      }

      persistLastAuthMethod();
      router.replace('/');
      toast.success(successMessage);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const handleSignIn = async ({ email, password }: SignInPayload) => {
    await runAuth({
      action: () =>
        authClient.signIn.email({
          email,
          password,
          callbackURL: '/',
        }),
      fallbackError: 'Invalid email or password.',
      successMessage: 'Successfully signed in!',
    });
  };

  const handleSignUp = async ({ email, password, name }: SignUpPayload) => {
    await runAuth({
      action: () =>
        authClient.signUp.email({
          email,
          password,
          name,
          callbackURL: '/',
        }),
      fallbackError: 'Sign up failed.',
      successMessage: 'Account created!',
    });
  };

  const handleFormSubmit = form.handleSubmit(async (data) => {
    if (mode === 'signup') {
      await handleSignUp(signUpSchema.parse(data));
      return;
    }

    await handleSignIn(signInSchema.parse(data));
  });

  const renderInput = ({
    name,
    label,
    placeholder,
    type = 'text',
    autoComplete,
    autoCapitalize,
    autoCorrect,
  }: {
    name: FieldPath<AuthFormValues>;
    label: string;
    placeholder?: string;
    type?: React.ComponentProps<typeof Input>['type'];
    autoComplete?: string;
    autoCapitalize?: string;
    autoCorrect?: string;
  }) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field, fieldState }) => {
        const { ref: _ref, ...fieldProps } = field;
        const inputId = `auth-${name}`;

        return (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel className="sr-only" htmlFor={inputId}>
              {label}
            </FieldLabel>
            <FieldContent>
              <Input
                {...fieldProps}
                id={inputId}
                type={type}
                placeholder={placeholder}
                autoComplete={autoComplete}
                autoCapitalize={autoCapitalize}
                autoCorrect={autoCorrect}
                aria-invalid={fieldState.invalid}
                className="bg-background"
                disabled={isSubmitting}
              />
              <FieldError errors={[fieldState.error]} />
            </FieldContent>
          </Field>
        );
      }}
    />
  );

  return (
    <form className="grid gap-3" onSubmit={handleFormSubmit} noValidate>
      <FieldGroup className="gap-1.5">
        {mode === 'signup'
          ? renderInput({
              name: 'name',
              label: 'Name',
              placeholder: 'Your name',
              autoComplete: 'name',
            })
          : null}
        {renderInput({
          name: 'email',
          label: 'Email',
          placeholder: 'name@example.com',
          type: 'email',
          autoCapitalize: 'none',
          autoComplete: 'email',
          autoCorrect: 'off',
        })}
        {renderInput({
          name: 'password',
          label: 'Password',
          placeholder: 'Enter your password',
          type: 'password',
          autoComplete: mode === 'signup' ? 'new-password' : 'current-password',
        })}
      </FieldGroup>
      <Button disabled={isSubmitting} type="submit" className="relative">
        <span className="text-sm">
          {isSubmitting ? loadingLabel : buttonLabel}
        </span>
        {isSubmitting ? (
          <Spinner />
        ) : (
          mode === 'signin' &&
          lastAuthMethod === 'EMAIL' && (
            <i className="text-xs absolute right-4 text-muted text-center">
              Last used
            </i>
          )
        )}
      </Button>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="justify-start px-0 text-muted-foreground"
        onClick={() => {
          setMode(mode === 'signup' ? 'signin' : 'signup');
          form.clearErrors();
        }}
        disabled={isSubmitting}
      >
        {mode === 'signup'
          ? 'Already have an account? Sign in'
          : 'New here? Create an account'}
      </Button>
    </form>
  );
}
