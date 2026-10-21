// Validation and normalisation of a lead from the landing form. Error values are codes the page turns into Hebrew.
export const BUSINESS_SIZES = ['home', 'small', 'few-branches', 'chain'];
export const VARIANTS = ['b', 'c'];

const clean = (v, max) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

export function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+972')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  digits = digits.replace(/\D/g, '');
  return /^0(5\d|[23489]|7\d)\d{7}$/.test(digits) || /^0[23489]\d{7}$/.test(digits) ? digits : null;
}

export function parseLead(body) {
  const errors = {};
  const name = clean(body?.name, 80);
  if (!name) errors.name = 'required';
  const phone = normalizePhone(body?.phone);
  if (!phone) errors.phone = body?.phone ? 'invalid' : 'required';
  const size = clean(body?.businessSize, 20);
  if (size && !BUSINESS_SIZES.includes(size)) errors.businessSize = 'invalid';
  if (Object.keys(errors).length) return { errors };
  return {
    lead: {
      name,
      phone,
      businessName: clean(body?.businessName, 120),
      businessType: clean(body?.businessType, 80),
      website: clean(body?.website, 200),
      businessSize: size,
      notes: clean(body?.notes, 1000),
      variant: VARIANTS.includes(body?.variant) ? body.variant : '',
      source: clean(body?.source, 200),
    },
  };
}
