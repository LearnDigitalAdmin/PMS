import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject, listAll } from 'firebase/storage';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-plot',
    storage: { rules: readFileSync('../storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
after(async () => { await env.cleanup(); });

const anon = () => env.unauthenticatedContext().storage();
const as = (uid, claims = {}) => env.authenticatedContext(uid, claims).storage();
const bytes = new Uint8Array([1, 2, 3]);
const meta = (contentType) => ({ contentType });

test('public customer upload: valid name + type succeeds', async () => {
  await assertSucceeds(uploadBytes(ref(anon(), 'uploads/12345678/1713456789012_cv.pdf'), bytes, meta('application/pdf')));
});
test('public customer upload: bad type / bad name / oversize rejected', async () => {
  await assertFails(uploadBytes(ref(anon(), 'uploads/12345678/1713456789012_x.exe'), bytes, meta('application/x-msdownload')));
  await assertFails(uploadBytes(ref(anon(), 'uploads/12345678/notatimestamp.pdf'), bytes, meta('application/pdf')));
  await assertFails(uploadBytes(ref(anon(), 'uploads/12345678/1713456789012_big.pdf'), new Uint8Array(11 * 1024 * 1024), meta('application/pdf')));
});
test('public customer files: no listing, no overwrite', async () => {
  await assertFails(listAll(ref(anon(), 'uploads/12345678')));
  await assertFails(uploadBytes(ref(anon(), 'uploads/12345678/1713456789012_cv.pdf'), bytes, meta('application/pdf')));
});
test('KYC: only the agent can upload / read their own four files', async () => {
  await assertSucceeds(uploadBytes(ref(as('agentA'), 'uploads/agentA/id'), bytes, meta('image/jpeg')));
  await assertSucceeds(getBytes(ref(as('agentA'), 'uploads/agentA/id')));
  await assertFails(getBytes(ref(as('agentB'), 'uploads/agentA/id')));
  await assertFails(getBytes(ref(anon(), 'uploads/agentA/id')));
  await assertFails(uploadBytes(ref(as('agentB'), 'uploads/agentA/kra'), bytes, meta('image/jpeg')));
  await assertFails(uploadBytes(ref(as('agentA'), 'uploads/agentA/randomname'), bytes, meta('image/jpeg')));
});
test('conversion images: owner only', async () => {
  await assertSucceeds(uploadBytes(ref(as('agentA'), 'users/agentA/conversions/j1/images/1_a.png'), bytes, meta('image/png')));
  await assertFails(uploadBytes(ref(as('agentB'), 'users/agentA/conversions/j1/images/2_a.png'), bytes, meta('image/png')));
});
test('invoices: signed-in create (no contentType needed), anonymous not; overwrite only by landlord', async () => {
  await assertSucceeds(uploadBytes(ref(as('111'), 'invoices/111/5_unpaid.pdf'), bytes));
  await assertSucceeds(uploadBytes(ref(as('111'), 'invoices/111/5_unpaid.pdf'), bytes));        // landlord overwrite
  await assertSucceeds(uploadBytes(ref(as('agentA'), 'invoices/222/2026-10/invoice_1_r_1.pdf'), bytes, meta('application/pdf')));
  await assertFails(uploadBytes(ref(as('agentA'), 'invoices/222/2026-10/invoice_1_r_1.pdf'), bytes, meta('application/pdf'))); // operator overwrite
  await assertFails(uploadBytes(ref(anon(), 'invoices/111/6_paid.pdf'), bytes));
});
test('server-only paths closed; unknown paths closed', async () => {
  await assertFails(getBytes(ref(as('111'), 'desk-docs/anything')));
  await assertFails(uploadBytes(ref(as('111'), 'deskExports/111/x.csv'), bytes));
  await assertFails(uploadBytes(ref(as('111'), 'passport-results/111/x.png'), bytes));
  await assertFails(uploadBytes(ref(as('111'), 'somethingElse/x.png'), bytes));
});
