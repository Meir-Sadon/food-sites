import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLead, normalizePhone } from '../lead.mjs';
import { leadMail } from '../mail.mjs';

test('phone formats are normalised', () => {
  assert.equal(normalizePhone('054-635 9856'), '0546359856');
  assert.equal(normalizePhone('+972546359856'), '0546359856');
  assert.equal(normalizePhone('123'), null);
});
test('name and phone are the only required fields', () => {
  assert.deepEqual(parseLead({}).errors, { name: 'required', phone: 'required' });
  assert.equal(parseLead({ name: 'דנה', phone: 'abc' }).errors.phone, 'invalid');
  assert.equal(parseLead({ name: 'דנה', phone: '0501234567' }).lead.name, 'דנה');
});
test('optional fields are validated and trimmed', () => {
  assert.equal(parseLead({ name: 'a', phone: '0501234567', businessSize: 'x' }).errors.businessSize, 'invalid');
  const { lead } = parseLead({ name: 'a', phone: '0501234567', businessSize: 'chain', variant: 'c', notes: '  hi   there ' });
  assert.equal(lead.notes, 'hi there');
  assert.equal(lead.variant, 'c');
});
test('mail escapes html', () => {
  assert.ok(!leadMail({ name: '<b>x</b>', phone: '1' }).html.includes('<b>x'));
});
