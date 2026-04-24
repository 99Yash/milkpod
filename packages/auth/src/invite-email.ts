import { serverEnv } from '@milkpod/env/server';
import { Resend } from 'resend';
import {
  buildInviteEmail,
  type InviteEmailInput,
} from './invite-email-template';

let _resend: Resend | undefined;

function getResend(): Resend {
  if (_resend) return _resend;
  _resend = new Resend(serverEnv().RESEND_API_KEY);
  return _resend;
}

// Resend's SDK doesn't expose AbortSignal on emails.send (see
// resend@6.9.3/dist/index.d.mts: PostOptions = { query?, headers? } only).
// Cap the wait ourselves so a hung Resend request can't keep this promise
// pending indefinitely and leak timers / event handlers under load.
const INVITE_EMAIL_TIMEOUT_MS = 30_000;

export interface SendInviteEmailInput extends InviteEmailInput {
  /** Recipient address. */
  to: string;
}

/**
 * Send the "{actor} invited you to {asset}" email. Fire-and-forget at call
 * sites — failures are logged, not thrown, so a Resend outage can't block the
 * invite mutation. Caller should still `await` if they want the log to happen
 * before process exit (e.g. in tests).
 */
export async function sendInviteEmail(input: SendInviteEmailInput): Promise<void> {
  const { to, ...templateInput } = input;
  const template = buildInviteEmail(templateInput);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getResend().emails.send({
        from: serverEnv().AUTH_FROM_EMAIL,
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Invite email send timed out after ${INVITE_EMAIL_TIMEOUT_MS}ms`,
              ),
            ),
          INVITE_EMAIL_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    console.error('[invite-email] send failed', {
      to,
      actorName: templateInput.actorName,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
