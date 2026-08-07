/**
 * INTEGRATION TESTING
 * Target: interaksi antar modul (Auth -> Students -> Journal -> BK) melalui
 * REST endpoint sungguhan (server.js dijalankan sebagai child process, koneksi
 * ke SQLite database asli), termasuk pengujian RBAC lintas-role & error handling.
 *
 * Framework: node:test + fetch bawaan Node (tanpa dependency eksternal).
 * Jalankan:
 *   node --test tests/integration/
 *
 * Catatan: setiap test-run menggunakan DB_PATH sementara agar tidak
 * mengganggu database development (db/school.db).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 3777;
const BASE = `http://localhost:${PORT}`;
const TEST_DB = path.join(__dirname, 'integration-test.db');

let serverProcess;

function waitForServer(retries = 30) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      fetch(BASE + '/login').then(() => resolve()).catch((e) => {
        if (n <= 0) return reject(e);
        setTimeout(() => attempt(n - 1), 200);
      });
    };
    attempt(retries);
  });
}

// extract "sid=xxx" cookie value from a Set-Cookie header
function sidFrom(res) {
  const raw = res.headers.get('set-cookie') || '';
  const m = raw.match(/sid=([^;]+)/);
  return m ? m[1] : null;
}

async function loginAs(email, password = 'password123') {
  const res = await fetch(BASE + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
    redirect: 'manual',
  });
  const sid = sidFrom(res);
  return { status: res.status, sid, location: res.headers.get('location') };
}

test.before(async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(PORT), DB_PATH: TEST_DB },
    stdio: 'pipe',
  });
  await waitForServer();
});

test.after(async () => {
  if (serverProcess) {
    serverProcess.kill();
    await new Promise((resolve) => {
      serverProcess.once('exit', resolve);
      setTimeout(resolve, 1500);
    });
  }
  for (let i = 0; i < 5; i++) {
    try {
      if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
      break;
    } catch (err) {
      if (i === 4) {
        console.warn('Peringatan: gagal menghapus database sementara (tidak fatal):', err.message);
      } else {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }
});

// ---------------------------------------------------------------
// INT-01..03: Auth -> Session -> Dashboard (data flow antar modul)
// ---------------------------------------------------------------
test('INT-01 Login dengan kredensial valid membuat session & redirect ke /dashboard', async () => {
  const { status, sid, location } = await loginAs('admin@sekolah.test');
  assert.equal(status, 302);
  assert.equal(location, '/dashboard');
  assert.ok(sid, 'session cookie harus dibuat');
});

test('INT-02 Login dengan password salah TIDAK membuat session valid (redirect ke /login)', async () => {
  const { status, location } = await loginAs('admin@sekolah.test', 'password-salah');
  assert.equal(status, 302);
  assert.equal(location, '/login');
});

test('INT-03 Akses /dashboard tanpa session ditolak (redirect ke /login)', async () => {
  const res = await fetch(BASE + '/dashboard', { redirect: 'manual' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
});

test('INT-04 Session valid dapat mengakses /dashboard (200 OK) - data flow Auth->Dashboard module', async () => {
  const { sid } = await loginAs('admin@sekolah.test');
  const res = await fetch(BASE + '/dashboard', { headers: { Cookie: `sid=${sid}` } });
  assert.equal(res.status, 200);
});

// ---------------------------------------------------------------
// INT-05..07: RBAC lintas modul - Manajemen Pengguna & Data Kesiswaan
// ---------------------------------------------------------------
test('INT-05 Role guru DITOLAK (403) mengakses modul /users (khusus admin)', async () => {
  const { sid } = await loginAs('guru@sekolah.test');
  const res = await fetch(BASE + '/users', { headers: { Cookie: `sid=${sid}` } });
  assert.equal(res.status, 403);
});

test('INT-06 Role admin DIIZINKAN mengakses modul /users', async () => {
  const { sid } = await loginAs('admin@sekolah.test');
  const res = await fetch(BASE + '/users', { headers: { Cookie: `sid=${sid}` } });
  assert.equal(res.status, 200);
});

test('INT-07 Role siswa DITOLAK (403) mengakses modul /students (data kesiswaan agregat)', async () => {
  const { sid } = await loginAs('siswa@sekolah.test');
  const res = await fetch(BASE + '/students', { headers: { Cookie: `sid=${sid}` } });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------
// INT-08..10: Modul Jurnal Mengajar - create -> persist -> read back
//             (integration antara route layer <-> db layer <-> view layer)
// ---------------------------------------------------------------
test('INT-08 Guru dapat membuat jurnal mengajar baru (data tersimpan & alur redirect benar)', async () => {
  const { sid } = await loginAs('guru@sekolah.test');
  const res = await fetch(BASE + '/journal/create', {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      class_id: '1', subject_id: '1', date: '2026-07-30',
      material: 'Integration Test Material', method: 'Diskusi', notes: 'Auto test',
    }),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/journal');
});

test('INT-09 Jurnal yang baru dibuat MUNCUL saat guru membaca kembali daftar /journal (data flow write->read)', async () => {
  const { sid } = await loginAs('guru@sekolah.test');
  const res = await fetch(BASE + '/journal', { headers: { Cookie: `sid=${sid}` } });
  const body = await res.text();
  assert.match(body, /Integration Test Material/);
});

test('INT-10 Guru LAIN tidak dapat mengedit jurnal milik guru lain (ownership check / error handling)', async () => {
  // guru_bk tidak punya jurnal, tapi kita pakai user guru ke-2 jika ada; jika tidak, uji lewat guru_bk sbg negative role
  const { sid } = await loginAs('bk@sekolah.test');
  const res = await fetch(BASE + '/journal/1/edit', { headers: { Cookie: `sid=${sid}` }, redirect: 'manual' });
  assert.equal(res.status, 403);
});

// ---------------------------------------------------------------
// INT-11: Modul BK - data sensitif hanya untuk role berwenang
// ---------------------------------------------------------------
test('INT-11 Guru (non-BK, non-wali, non-admin) DITOLAK mengakses modul /bk (isolasi data sensitif)', async () => {
  const { sid } = await loginAs('guru@sekolah.test');
  const res = await fetch(BASE + '/bk', { headers: { Cookie: `sid=${sid}` } });
  assert.equal(res.status, 403);
});

test('INT-12 Guru BK dapat mencatat kasus baru & langsung terlihat pada /bk (module BK end-to-end)', async () => {
  const { sid } = await loginAs('bk@sekolah.test');
  const create = await fetch(BASE + '/bk/create', {
    method: 'POST', redirect: 'manual',
    headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ student_id: '1', case_type: 'konseling', date: '2026-07-30', description: 'Kasus uji integrasi', status: 'Baru' }),
  });
  assert.equal(create.status, 302);
  const list = await fetch(BASE + '/bk', { headers: { Cookie: `sid=${sid}` } });
  const body = await list.text();
  assert.match(body, /Kasus uji integrasi/);
});

// ---------------------------------------------------------------
// INT-13: Akun nonaktif tidak dapat login (Manajemen Pengguna <-> Auth)
// ---------------------------------------------------------------
test('INT-13 Admin menonaktifkan user -> user tsb tidak bisa login lagi (cross-module effect)', async () => {
  const admin = await loginAs('admin@sekolah.test');
  // toggle user id 2 (guru) menjadi nonaktif
  await fetch(BASE + '/users/2/toggle', { method: 'POST', redirect: 'manual', headers: { Cookie: `sid=${admin.sid}` } });
  const attemptLogin = await loginAs('guru@sekolah.test');
  assert.equal(attemptLogin.location, '/login'); // gagal login karena nonaktif
  // kembalikan status semula agar tidak mengganggu test lain
  await fetch(BASE + '/users/2/toggle', { method: 'POST', redirect: 'manual', headers: { Cookie: `sid=${admin.sid}` } });
});

// ---------------------------------------------------------------
// INT-14 (REGRESI DEF-01): validasi panjang maksimum field jurnal
// ---------------------------------------------------------------
test('INT-14 (REGRESI DEF-01) Jurnal dengan teks >10.000 karakter DITOLAK (BVA - upper boundary)', async () => {
  const { sid } = await loginAs('guru@sekolah.test');
  const teksTerlaluPanjang = 'x'.repeat(10001);
  const res = await fetch(BASE + '/journal/create', {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      class_id: '1', subject_id: '1', date: '2026-07-31',
      material: teksTerlaluPanjang, method: 'Diskusi', notes: 'x',
    }),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/journal/create'); // ditolak, kembali ke form
});

test('INT-15 (REGRESI DEF-01) Jurnal dengan teks tepat 10.000 karakter DITERIMA (BVA - on boundary)', async () => {
  const { sid } = await loginAs('guru@sekolah.test');
  const teksPasBatas = 'y'.repeat(10000);
  const res = await fetch(BASE + '/journal/create', {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      class_id: '1', subject_id: '1', date: '2026-07-31',
      material: teksPasBatas, method: 'Diskusi', notes: 'ok',
    }),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/journal'); // diterima -> redirect sukses
});

// ---------------------------------------------------------------
// INT-16 (REGRESI DEF-02): validasi range poin pelanggaran BK
// ---------------------------------------------------------------
test('INT-16 (REGRESI DEF-02) Poin pelanggaran NEGATIF DITOLAK (EP - invalid class)', async () => {
  const { sid } = await loginAs('bk@sekolah.test');
  const res = await fetch(BASE + '/bk/violations/create', {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ student_id: '1', date: '2026-07-31', description: 'Uji poin negatif', point: '-10' }),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/bk/violations/create'); // ditolak, kembali ke form
});

test('INT-17 (REGRESI DEF-02) Poin pelanggaran > 100 DITOLAK (BVA - upper boundary)', async () => {
  const { sid } = await loginAs('bk@sekolah.test');
  const res = await fetch(BASE + '/bk/violations/create', {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ student_id: '1', date: '2026-07-31', description: 'Uji poin >100', point: '101' }),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/bk/violations/create');
});

test('INT-18 (REGRESI DEF-02) Poin pelanggaran valid (0-100) DITERIMA (EP - valid class)', async () => {
  const { sid } = await loginAs('bk@sekolah.test');
  const res = await fetch(BASE + '/bk/violations/create', {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: `sid=${sid}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ student_id: '1', date: '2026-07-31', description: 'Uji poin valid', point: '15' }),
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/bk/violations'); // diterima -> redirect sukses
});

// ---------------------------------------------------------------
// INT-19 (REGRESI DEF-03): endpoint /login mengembalikan 429 & pesan
// lockout setelah 5 kali percobaan gagal beruntun untuk email yang sama
// ---------------------------------------------------------------
test('INT-19 (REGRESI DEF-03) /login mengunci akun & membalas 429 setelah 5x percobaan gagal beruntun', async () => {
  const email = 'lockout-test@sekolah.test'; // email tidak terdaftar -> selalu gagal, tidak mengganggu akun lain
  let lastStatus;
  for (let i = 0; i < 5; i++) {
    const r = await loginAs(email, 'password-salah');
    lastStatus = r.status;
  }
  assert.equal(lastStatus, 302); // percobaan ke-5 masih diproses sbg gagal biasa (redirect ke /login)
  const res = await fetch(BASE + '/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: 'password-salah-lagi' }),
  });
  assert.equal(res.status, 429); // percobaan ke-6 ditolak karena terkunci
});
