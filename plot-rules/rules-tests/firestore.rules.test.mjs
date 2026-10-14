// Run from this folder:  npm i && npm test   (needs Java for the emulators)
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, collectionGroup,
  getDocs, query, where, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-plot',
    firestore: { rules: readFileSync('../firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // landlords
    await setDoc(doc(db, 'users/111'), { email: 'l1@x.com', cyberId: 'COG-1', tier: 'business', type: 'paid', isPremium: true, storage: true, tokens: 50, passwordHash: 'h' });
    await setDoc(doc(db, 'users/222'), { email: 'l2@x.com', cyberId: 'COG-9', tier: 'free', type: 'free', tokens: 0, firebaseAuthUid: 'authB' });
    await setDoc(doc(db, 'users/111/invoices/i1'), { tenantId: 7, isPaid: false, amount: 1000, localId: 7 });
    await setDoc(doc(db, 'users/222/invoices/i2'), { tenantId: 8, isPaid: false, amount: 2000, localId: 8 });
    await setDoc(doc(db, 'users/222/tenants/t8'), { localId: 8, name: 'T8' });
    // operators
    await setDoc(doc(db, 'agents/agentA'), { uid: 'agentA', pId: 'COG-1', name: 'A' });
    await setDoc(doc(db, 'agents/agentB'), { uid: 'agentB', pId: 'COG-2', name: 'B' });
    await setDoc(doc(db, 'cyber-transactions/CYBER_COG-1_1'), { status: 'pending', phone: '254700000000' });
    await setDoc(doc(db, 'transactions/ref1'), { agentId: '111', userId: '7' });
    await setDoc(doc(db, 'subscriptions/s1'), { x: 1 });
    await setDoc(doc(db, 'desk_agents/agentA'), { name: 'A' });
    await setDoc(doc(db, 'desk_config/main'), { x: 1 });
    await setDoc(doc(db, 'conversions/job1'), { userId: 'agentA', status: 'processing' });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const as = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();

// ---------------------------------------------------------------- users
test('users: anonymous cannot read', async () => { await assertFails(getDoc(doc(anon(), 'users/111'))); });
test('users: stranger cannot read', async () => { await assertFails(getDoc(doc(as('zzz'), 'users/111'))); });
test('users: owner (uid==id) reads', async () => { await assertSucceeds(getDoc(doc(as('111'), 'users/111'))); });
test('users: owner via firebaseAuthUid reads', async () => { await assertSucceeds(getDoc(doc(as('authB'), 'users/222'))); });
test('users: owner via custom claim reads', async () => { await assertSucceeds(getDoc(doc(as('rand', { role: 'landlord', agentId: '111' }), 'users/111'))); });
test('users: operator can read a landlord doc (walk-in flow)', async () => { await assertSucceeds(getDoc(doc(as('agentA'), 'users/222'))); });
test('users: PMS login lookup by own email works', async () => {
  await assertSucceeds(getDocs(query(collection(as('111', { email: 'l1@x.com' }), 'users'), where('email', '==', 'l1@x.com'), limit(1))));
});
test('users: cannot look up someone else by email', async () => {
  await assertFails(getDocs(query(collection(as('111', { email: 'l1@x.com' }), 'users'), where('email', '==', 'l2@x.com'))));
});
test('users: operator asset list by own pId works', async () => {
  await assertSucceeds(getDocs(query(collection(as('agentA'), 'users'), where('cyberId', '==', 'COG-1'), where('type', '==', 'paid'))));
});
test('users: operator cannot list another operator\'s assets or all users', async () => {
  await assertFails(getDocs(query(collection(as('agentA'), 'users'), where('cyberId', '==', 'COG-9'))));
  await assertFails(getDocs(collection(as('agentA'), 'users')));
});
test('users: owner may NOT raise tier / tokens / expiry', async () => {
  const d = doc(as('222'), 'users/222');
  await assertFails(updateDoc(d, { tier: 'enterprise' }));
  await assertFails(updateDoc(d, { tokens: 100000 }));
  await assertFails(updateDoc(d, { isPremium: true }));
  await assertFails(updateDoc(d, { subscriptionExpiry: new Date('2099-01-01') }));
});
test('users: owner CAN downgrade and re-send unchanged values (sync)', async () => {
  const d = doc(as('111'), 'users/111');
  await assertSucceeds(updateDoc(d, { tier: 'free', isPremium: false, storage: false, type: 'free' }));
  await assertSucceeds(setDoc(d, { tier: 'free', tokens: 50, name: 'New name' }, { merge: true }));
});
test('users: client-created doc must start free', async () => {
  await assertSucceeds(setDoc(doc(as('333'), 'users/333'), { email: 'n@x.com', tier: 'free', type: 'free' }));
  await assertFails(setDoc(doc(as('444'), 'users/444'), { email: 'n@x.com', tier: 'enterprise', type: 'paid' }));
  await assertFails(setDoc(doc(as('555'), 'users/555'), { email: 'n@x.com', tokens: 99999 }));
});
test('users: cannot create/overwrite another person\'s doc, cannot delete', async () => {
  await assertFails(setDoc(doc(as('999'), 'users/888'), { email: 'x@x.com', tier: 'free' }));
  await assertFails(deleteDoc(doc(as('111'), 'users/111')));
});

// ---------------------------------------------------------------- landlord subcollections
test('invoices: landlord writes own; stranger cannot', async () => {
  await assertSucceeds(setDoc(doc(as('111'), 'users/111/invoices/i9'), { amount: 5, isPaid: false }));
  await assertFails(setDoc(doc(as('zzz'), 'users/111/invoices/i9'), { amount: 5 }));
});
test('invoices: managing operator can create; non-managing cannot', async () => {
  await assertSucceeds(setDoc(doc(as('agentA'), 'users/111/invoices/i10'), { amount: 5 }));
  await assertFails(setDoc(doc(as('agentB'), 'users/111/invoices/i10'), { amount: 5 }));
});
test('invoices: ANY operator may mark paid with whitelisted fields only', async () => {
  const d = doc(as('agentB'), 'users/222/invoices/i2');
  await assertSucceeds(updateDoc(d, { isPaid: true, amountPaid: 2000, arrears: 0, paidDate: serverTimestamp(), pdfUrl: 'u', paymentReference: 'r', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('agentB'), 'users/222/invoices/i2'), { isPaid: true, amount: 1 }));
  await assertFails(updateDoc(doc(as('agentB'), 'users/222/invoices/i2'), { isPaid: false, amountPaid: 0 }));
});
test('tenants: operator may only stamp last-payment fields on others', async () => {
  await assertSucceeds(updateDoc(doc(as('agentB'), 'users/222/tenants/t8'), { lastPaymentDate: serverTimestamp(), lastPaymentAmount: 5, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('agentB'), 'users/222/tenants/t8'), { name: 'hacked' }));
});
test('collection group: signed-in reads tenants/invoices, anonymous does not', async () => {
  await assertSucceeds(getDocs(query(collectionGroup(as('agentA'), 'tenants'), where('localId', '==', 8))));
  await assertSucceeds(getDocs(query(collectionGroup(as('tenantPhoneUid'), 'invoices'), where('tenantId', '==', 7))));
  await assertFails(getDocs(query(collectionGroup(anon(), 'tenants'), where('localId', '==', 8))));
});

// ---------------------------------------------------------------- tenants (accounts)
test('tenants: create own account once, never edit', async () => {
  await assertSucceeds(setDoc(doc(as('tel1'), 'tenants/tel1'), { id: 'tel1', role: 'tenant', idNumber: '123' }));
  await assertFails(setDoc(doc(as('tel1'), 'tenants/other'), { id: 'other', role: 'tenant' }));
  await assertFails(setDoc(doc(as('tel2'), 'tenants/tel2'), { id: 'tel2', role: 'admin' }));
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'tenants/tel3'), { id: 'tel3', role: 'tenant' }));
  await assertFails(updateDoc(doc(as('tel3'), 'tenants/tel3'), { idNumber: '999' }));
});

// ---------------------------------------------------------------- agents
test('agents: public read + lookup by pId', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'agents/agentA')));
  await assertSucceeds(getDocs(query(collection(anon(), 'agents'), where('pId', '==', 'COG-1'))));
  await assertSucceeds(getDocs(query(collection(as('new'), 'agents'), orderBy('pId', 'desc'), limit(1))));
});
test('agents: signup create own only; no payout fields; never updated by client', async () => {
  await assertSucceeds(setDoc(doc(as('newUid'), 'agents/newUid'), { uid: 'newUid', pId: 'COG-0003', isVerified: true }));
  await assertFails(setDoc(doc(as('x1'), 'agents/someoneElse'), { uid: 'someoneElse', pId: 'COG-0004' }));
  await assertFails(setDoc(doc(as('x2'), 'agents/x2'), { uid: 'x2', paymentInfo: { accountId: 'attacker' } }));
  await assertFails(updateDoc(doc(as('agentA'), 'agents/agentA'), { name: 'changed' }));
});
const goodUpload = () => ({ name: 'Jo', phone: '0700', type: 'Printing', notes: '', files: [{ url: 'u' }], status: 'pending', date: serverTimestamp(), time: '10:00 AM', createdAt: serverTimestamp(), cyberId: 'agentA', cyberName: 'A' });
test('uploads: anonymous customer can create a well-formed request', async () => {
  await assertSucceeds(addDoc(collection(anon(), 'agents/agentA/uploads'), goodUpload()));
});
test('uploads: rejects bad status, extra keys, wrong cyberId; anonymous cannot read', async () => {
  await assertFails(addDoc(collection(anon(), 'agents/agentA/uploads'), { ...goodUpload(), status: 'done' }));
  await assertFails(addDoc(collection(anon(), 'agents/agentA/uploads'), { ...goodUpload(), isAdmin: true }));
  await assertFails(addDoc(collection(anon(), 'agents/agentA/uploads'), { ...goodUpload(), cyberId: 'agentB' }));
  await assertFails(getDocs(collection(anon(), 'agents/agentA/uploads')));
});
test('uploads: only the owning agent reads / updates / deletes', async () => {
  const ref = await addDoc(collection(anon(), 'agents/agentA/uploads'), goodUpload());
  await assertSucceeds(getDocs(collection(as('agentA'), 'agents/agentA/uploads')));
  await assertFails(getDocs(collection(as('agentB'), 'agents/agentA/uploads')));
  await assertSucceeds(updateDoc(doc(as('agentA'), ref.path), { status: 'done' }));
  await assertFails(deleteDoc(doc(as('agentB'), ref.path)));
});
test('agent subcollections: products public read / owner write; income owner read, never client write', async () => {
  await assertSucceeds(setDoc(doc(as('agentA'), 'agents/agentA/products/p1'), { name: 'x' }));
  await assertFails(setDoc(doc(as('agentB'), 'agents/agentA/products/p2'), { name: 'x' }));
  await assertSucceeds(getDocs(collection(anon(), 'agents/agentA/products')));
  await assertFails(setDoc(doc(as('agentA'), 'agents/agentA/cyber-income/i1'), { amount: 1e6 }));
});

// ---------------------------------------------------------------- money / server-only
test('cyber-transactions: payer can get by reference, cannot list or write', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'cyber-transactions/CYBER_COG-1_1')));
  await assertFails(getDocs(collection(anon(), 'cyber-transactions')));
  await assertFails(updateDoc(doc(as('agentA'), 'cyber-transactions/CYBER_COG-1_1'), { status: 'success' }));
});
test('transactions: signed-in read only, nobody writes', async () => {
  await assertFails(getDoc(doc(anon(), 'transactions/ref1')));
  await assertSucceeds(getDoc(doc(as('111'), 'transactions/ref1')));
  await assertFails(updateDoc(doc(as('111'), 'transactions/ref1'), { status: 'success' }));
  await assertFails(setDoc(doc(as('111'), 'transactions/new'), { amount: 1 }));
});
test('server-only collections are closed; unknown collections are closed', async () => {
  await assertFails(getDoc(doc(as('111'), 'subscriptions/s1')));
  await assertFails(setDoc(doc(as('111'), 'platform_revenue/x'), { total: 1 }));
  await assertFails(getDoc(doc(as('111'), 'photographers/p')));
  await assertFails(setDoc(doc(as('111'), 'someOtherAppCollection/x'), { a: 1 }));
});
test('screening: signed-in with sourceUserId only, no deletes', async () => {
  await assertSucceeds(setDoc(doc(as('111'), 'screening/7'), { sourceUserId: '111', score: 1 }));
  await assertFails(setDoc(doc(as('111'), 'screening/8'), { score: 1 }));
  await assertFails(setDoc(doc(anon(), 'screening/9'), { sourceUserId: '1' }));
  await assertFails(deleteDoc(doc(as('111'), 'screening/7')));
});
test('conversions: owner only', async () => {
  await assertSucceeds(setDoc(doc(as('agentB'), 'conversions/job2'), { userId: 'agentB', status: 'pending' }));
  await assertFails(setDoc(doc(as('agentB'), 'conversions/job3'), { userId: 'agentA' }));
  await assertSucceeds(getDoc(doc(as('agentA'), 'conversions/job1')));
  await assertFails(getDoc(doc(as('agentB'), 'conversions/job1')));
});
test('plans / forms: public read, nobody writes', async () => {
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'plans/p'), { n: 1 }); });
  await assertSucceeds(getDoc(doc(anon(), 'plans/p')));
  await assertFails(setDoc(doc(as('111'), 'plans/p'), { n: 2 }));
});
test('desk: own desk_agents readable, config closed', async () => {
  await assertSucceeds(getDoc(doc(as('agentA'), 'desk_agents/agentA')));
  await assertFails(getDoc(doc(as('agentB'), 'desk_agents/agentA')));
  await assertFails(getDoc(doc(as('agentA'), 'desk_config/main')));
});
