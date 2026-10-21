const SIZES = { home: 'עסק ביתי', small: 'עסק קטן', 'few-branches': 'כמה סניפים', chain: 'רשת' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function leadMail(lead) {
  const rows = [
    ['שם', lead.name], ['טלפון', lead.phone], ['שם העסק', lead.businessName], ['סוג העסק', lead.businessType],
    ['אתר / אינסטגרם', lead.website], ['גודל', SIZES[lead.businessSize] ?? ''], ['הערות', lead.notes],
    ['גרסת דף', lead.variant],
  ].filter(([, v]) => v);
  return {
    subject: `ליד חדש: ${lead.name} ${lead.phone}`,
    html: `<div dir="rtl" style="font-family:Arial">${rows.map(([k, v]) => `<p><b>${k}:</b> ${esc(v)}</p>`).join('')}</div>`,
  };
}

// Brevo (preferred) or Resend over HTTP; both unset means no mail. A failed mail never fails the lead.
export async function sendLeadMail(env, lead, fetchFn = fetch) {
  const to = env.LEAD_NOTIFY_EMAIL;
  const from = env.MAIL_FROM;
  if (!to || !from) return false;
  const { subject, html } = leadMail(lead);
  try {
    if (env.BREVO_API_KEY) {
      const r = await fetchFn('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ sender: { email: from }, to: [{ email: to }], subject, htmlContent: html }),
      });
      return r.ok;
    }
    if (env.RESEND_API_KEY) {
      const r = await fetchFn('https://api.resend.com/emails', {
        method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html }),
      });
      return r.ok;
    }
  } catch (e) {
    console.error('lead mail failed', e.message);
  }
  return false;
}
