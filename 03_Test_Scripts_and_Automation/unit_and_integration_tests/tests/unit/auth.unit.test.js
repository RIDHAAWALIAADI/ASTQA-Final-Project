/**
 * UNIT TESTING - Modul Manajemen Pengguna (Security Layer)
 * Target: lib/auth.js
 * Framework: node:test (built-in Node.js test runner, tanpa dependency eksternal)
 * Jalankan:
 *   node --test --experimental-test-coverage tests/unit/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword,
  verifyPassword,
  requireRole,
  isLoginLocked,
  remainingLockoutSeconds,
  recordFailedLogin,
  resetLoginAttempts,
} = require('../../lib/auth');

// ---------------------------------------------------------------
// FR-1: User Authentication - Password Hashing
// ---------------------------------------------------------------
test('UNIT-01 hashPassword() menghasilkan hash berbeda dari plaintext', () => {
  const hash = hashPassword('password123');
  assert.notEqual(hash, 'password123');
  assert.match(hash, /^[0-9a-f]+:[0-9a-f]+$/); // format salt:hash
});

test('UNIT-02 hashPassword() menghasilkan salt acak (dua hash untuk password sama berbeda)', () => {
  const h1 = hashPassword('password123');
  const h2 = hashPassword('password123');
  assert.notEqual(h1, h2); // karena salt random, hash tidak boleh identik
});

test('UNIT-03 verifyPassword() TRUE untuk password benar', () => {
  const stored = hashPassword('rahasia123');
  assert.equal(verifyPassword('rahasia123', stored), true);
});

test('UNIT-04 verifyPassword() FALSE untuk password salah (Equivalence Partitioning - invalid class)', () => {
  const stored = hashPassword('rahasia123');
  assert.equal(verifyPassword('salahpassword', stored), false);
});

test('UNIT-05 verifyPassword() FALSE untuk password kosong (Boundary Value Analysis - empty string)', () => {
  const stored = hashPassword('rahasia123');
  assert.equal(verifyPassword('', stored), false);
});

test('UNIT-06 verifyPassword() case-sensitive terhadap password', () => {
  const stored = hashPassword('Password123');
  assert.equal(verifyPassword('password123', stored), false);
});

// ---------------------------------------------------------------
// FR-2/FR-3: Role-Based Access Control (requireRole middleware)
// ---------------------------------------------------------------
function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
  };
}

test('UNIT-07 requireRole() meloloskan user dengan role yang diizinkan', () => {
  const mw = requireRole('admin', 'guru_bk');
  const req = { user: { role_name: 'admin' } };
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test('UNIT-08 requireRole() menolak (403) user dengan role tidak diizinkan', () => {
  const mw = requireRole('admin');
  const req = { user: { role_name: 'siswa' } };
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('UNIT-09 requireRole() menolak (403) jika req.user tidak ada (belum login/edge case)', () => {
  const mw = requireRole('admin');
  const req = { user: null };
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

// ---------------------------------------------------------------
// REGRESI DEF-03: Rate-limiting / lockout percobaan login (brute-force
// protection). Ditemukan saat System Testing (NFR-Security), diperbaiki
// di lib/auth.js - lihat Defect_Log_and_UAT_Signoff.
// ---------------------------------------------------------------
test('UNIT-10 (REGRESI DEF-03) akun TIDAK terkunci sebelum mencapai batas percobaan gagal', () => {
  const email = 'regresi-def03-a@sekolah.test';
  resetLoginAttempts(email);
  for (let i = 0; i < 4; i++) recordFailedLogin(email); // di bawah ambang batas (5)
  assert.equal(isLoginLocked(email), false);
});

test('UNIT-11 (REGRESI DEF-03) akun TERKUNCI setelah 5 percobaan login gagal beruntun (BVA - batas atas)', () => {
  const email = 'regresi-def03-b@sekolah.test';
  resetLoginAttempts(email);
  for (let i = 0; i < 5; i++) recordFailedLogin(email);
  assert.equal(isLoginLocked(email), true);
  assert.ok(remainingLockoutSeconds(email) > 0);
});

test('UNIT-12 (REGRESI DEF-03) resetLoginAttempts() membuka kembali akun setelah login berhasil', () => {
  const email = 'regresi-def03-c@sekolah.test';
  resetLoginAttempts(email);
  for (let i = 0; i < 5; i++) recordFailedLogin(email);
  assert.equal(isLoginLocked(email), true);
  resetLoginAttempts(email);
  assert.equal(isLoginLocked(email), false);
});
