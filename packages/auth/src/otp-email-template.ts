export type OtpEmailType = 'sign-in' | 'email-verification' | 'forget-password';

const CONTENT_BY_TYPE: Record<
  OtpEmailType,
  { heading: string; intro: string; subjectPrefix: string }
> = {
  'sign-in': {
    heading: 'Sign in to Milkpod',
    intro: 'Use this one-time code to finish signing in to your account.',
    subjectPrefix: 'Your sign-in code',
  },
  'email-verification': {
    heading: 'Verify your email',
    intro: 'Use this one-time code to verify your email address.',
    subjectPrefix: 'Verify your email',
  },
  'forget-password': {
    heading: 'Reset your password',
    intro: 'Use this one-time code to continue resetting your password.',
    subjectPrefix: 'Reset your password',
  },
};

export function buildOtpEmail(type: OtpEmailType, otp: string) {
  const content = CONTENT_BY_TYPE[type];
  const subject = `${content.subjectPrefix} - ${otp}`;

  const html = `
<div style="margin:0;padding:0;background:#f7f8fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;background:#f7f8fb;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;box-shadow:0 16px 40px rgba(17,24,39,0.08);">
          <tr>
            <td style="padding:26px 24px;background:linear-gradient(140deg,#0f172a 0%,#1e293b 100%);">
              <p style="margin:0;font-size:12px;line-height:18px;letter-spacing:0.08em;text-transform:uppercase;color:#cbd5e1;">Milkpod</p>
              <h1 style="margin:10px 0 0 0;font-size:24px;line-height:31px;font-weight:600;color:#f8fafc;">${content.heading}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#334155;">${content.intro}</p>
              <p style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:#64748b;">One-time code</p>
              <div style="display:inline-block;padding:12px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:34px;line-height:38px;letter-spacing:0.3em;font-weight:700;color:#0f172a;">${otp}</div>
              <p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#64748b;">This code expires in 5 minutes and can only be used once.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px 24px;">
              <div style="height:1px;background:#e2e8f0;"></div>
              <p style="margin:16px 0 0 0;font-size:12px;line-height:18px;color:#94a3b8;">If you did not request this code, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>
`.trim();

  const text = [
    content.heading,
    '',
    content.intro,
    '',
    `Code: ${otp}`,
    'This code expires in 5 minutes and can only be used once.',
    '',
    'If you did not request this code, you can safely ignore this email.',
  ].join('\n');

  return { subject, html, text };
}
