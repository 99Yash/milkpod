export interface InviteEmailInput {
  actorName: string;
  assetTitle: string;
  role: 'editor' | 'viewer';
  /** Absolute URL the invitee should land on after accepting. */
  targetUrl: string;
  /** True when the invitee doesn't yet have an account — the link will go to signup. */
  requiresSignup?: boolean;
}

export interface InviteEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildInviteEmail(input: InviteEmailInput): InviteEmailTemplate {
  const actor = escapeHtml(input.actorName);
  const title = escapeHtml(input.assetTitle);
  const role = input.role;
  const cta = input.requiresSignup ? 'Accept invite & sign up' : 'Open in Milkpod';

  const subject = `${input.actorName} invited you to “${input.assetTitle}” on Milkpod`;

  const html = `
<div style="margin:0;padding:0;background:#f7f8fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;background:#f7f8fb;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <tr><td>
            <p style="margin:0 0 12px 0;font-size:14px;color:#4b5563;">Milkpod</p>
            <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#111827;line-height:1.3;">
              ${actor} invited you to collaborate
            </h1>
            <p style="margin:0 0 20px 0;font-size:14px;line-height:1.5;color:#374151;">
              You've been added as <strong>${role}</strong> on <strong>“${title}”</strong>.
            </p>
            <p style="margin:0 0 24px 0;">
              <a href="${input.targetUrl}" style="display:inline-block;padding:10px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:500;">
                ${cta}
              </a>
            </p>
            <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">
              If you weren't expecting this invite, you can safely ignore this email.
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;

  const text = `${input.actorName} invited you to collaborate on "${input.assetTitle}" in Milkpod as ${role}.

${cta}: ${input.targetUrl}

If you weren't expecting this invite, you can safely ignore this email.`;

  return { subject, html, text };
}
