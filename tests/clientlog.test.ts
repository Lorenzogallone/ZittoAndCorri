import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIENTLOG_MAX_LINE_CHARS,
  createRateLimiter,
  sanitizeClientLog,
} from "../lib/clientlog/sanitize.ts";

test("clientlog: tiene solo i campi noti, con l'utente della sessione", () => {
  const line = sanitizeClientLog(
    JSON.stringify({ ev: "nav", data: { a: 1 }, url: "/plan", standalone: true, ts: "2026-11-22T10:00:00Z", extra: "x", user: "finto" }),
    "u1",
  );
  assert.ok(line);
  const parsed = JSON.parse(line);
  assert.equal(parsed.user, "u1");
  assert.equal(parsed.ev, "nav");
  assert.equal(parsed.data, '{"a":1}');
  assert.equal(parsed.extra, undefined);
});

test("clientlog: scarta corpi che non sono eventi", () => {
  assert.equal(sanitizeClientLog("non json", "u1"), null);
  assert.equal(sanitizeClientLog("[1,2]", "u1"), null);
  assert.equal(sanitizeClientLog(JSON.stringify({ data: 1 }), "u1"), null);
});

test("clientlog: tronca i contenuti lunghi e toglie gli a capo", () => {
  const line = sanitizeClientLog(
    JSON.stringify({ ev: "a\nb", data: "x".repeat(10_000), url: "/".repeat(1000) }),
    "u1",
  );
  assert.ok(line);
  assert.ok(line.length <= CLIENTLOG_MAX_LINE_CHARS + 1);
  assert.doesNotMatch(line, /\n/);
});

test("clientlog: limite di frequenza per utente con finestra", () => {
  const allow = createRateLimiter(2, 1000);
  assert.equal(allow("u1", 0), true);
  assert.equal(allow("u1", 10), true);
  assert.equal(allow("u1", 20), false);
  assert.equal(allow("u2", 20), true);
  assert.equal(allow("u1", 1000), true);
});
