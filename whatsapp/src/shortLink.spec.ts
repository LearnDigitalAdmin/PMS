import test from "node:test";
import assert from "node:assert/strict";
import {
  attachShortLink, buildShortUrl, isAllowedRedirectTarget, newShortCode, parseShortCode, smsTokens,
} from "./shortLink";

const sanitize = (s: string) => s.replace(/\s+/g, " ").trim();
const LINK = "https://plot.samuhia.co.ke/i/k7m2xq9";
const SIGN = " PLOT YANGU";

test("short urls are tiny compared with a Firebase Storage URL", () => {
  const url = buildShortUrl("k7m2xq9", "https://plot.samuhia.co.ke/i/");
  assert.equal(url, LINK);
  assert.ok(url.length <= 40);
});

test("codes are 7 unambiguous lower-case characters", () => {
  for (let i = 0; i < 200; i++) assert.match(newShortCode(), /^[a-hj-km-np-z2-9]{7}$/);
});

test("parseShortCode handles the hosting path and rejects junk", () => {
  assert.equal(parseShortCode("/i/k7m2xq9"), "k7m2xq9");
  assert.equal(parseShortCode("/i/k7m2xq9/"), "k7m2xq9");
  assert.equal(parseShortCode("/k7m2xq9"), "k7m2xq9");
  assert.equal(parseShortCode("/i/"), null);
  assert.equal(parseShortCode("/i/../etc"), null);
  assert.equal(parseShortCode("/i/K7M2XQ9"), null);
});

test("redirects only to Firebase Storage over https", () => {
  assert.ok(isAllowedRedirectTarget("https://firebasestorage.googleapis.com/v0/b/x/o/a.pdf?alt=media&token=t"));
  assert.ok(isAllowedRedirectTarget("https://x.firebasestorage.app/v0/b/x/o/a.pdf"));
  assert.ok(!isAllowedRedirectTarget("http://firebasestorage.googleapis.com/a"));
  assert.ok(!isAllowedRedirectTarget("https://evil.example.com/a"));
  assert.ok(!isAllowedRedirectTarget("javascript:alert(1)"));
  assert.ok(!isAllowedRedirectTarget(undefined));
});

test("link is added for free when the message still fits the same credits", () => {
  const body = "Dear John, your invoice for October at Sunrise is ready. TOTAL AMOUNT: KES 25,000 Contact Agent on 0712345678 for queries.";
  const base = sanitize(body + SIGN);
  const out = attachShortLink({ base, fullBody: body, compactBody: "Dear John, invoice KES 25,000.", sign: SIGN, label: "Invoice:", link: LINK, maxExtraTokens: 0, sanitize });
  assert.ok(out.includes(LINK));
  assert.equal(smsTokens(out), smsTokens(base));
});

test("compact wording is used when the normal wording would cost another credit", () => {
  const body = "Dear Jo Kamau, your invoice for May at Unit A is ready. TOTAL AMOUNT: KES 25,000 Contact Agent on 0712345678 for queries.";
  const compact = "Dear Jo Kamau, invoice for May at Unit A: KES 25,000. Queries: 0712345678.";
  const base = sanitize(body + SIGN);
  assert.equal(smsTokens(base), 1);
  assert.equal(smsTokens(sanitize(`${body} Invoice: ${LINK}${SIGN}`)), 2); // naive append: +1 credit
  const out = attachShortLink({ base, fullBody: body, compactBody: compact, sign: SIGN, label: "Invoice:", link: LINK, maxExtraTokens: 0, sanitize });
  assert.ok(out.includes(LINK));
  assert.equal(smsTokens(out), 1); // same price as before
  assert.ok(out.endsWith("PLOT YANGU"));
});

test("no link is added when it cannot fit the credit budget", () => {
  const body = "x".repeat(140);
  const base = sanitize(body + SIGN); // 151 chars = 2 credits, 137 left in credit 2 -> fits
  const tight = "y".repeat(143);
  const out = attachShortLink({ base: tight, fullBody: tight, compactBody: tight, sign: "", label: "Invoice:", link: LINK, maxExtraTokens: 0, sanitize });
  assert.equal(out, tight);
  assert.ok(base.length > 0);
});

test("one extra credit is allowed by default", () => {
  const tight = "y".repeat(143);
  const out = attachShortLink({ base: tight, fullBody: tight, compactBody: tight, sign: "", label: "Invoice:", link: LINK, sanitize });
  assert.ok(out.includes(LINK));
  assert.equal(smsTokens(out), smsTokens(tight) + 1);
});
