/**
 * SYSTEM TESTING - Performance / Load Test (JMeter-style simulation)
 * -------------------------------------------------------------------
 * Skrip ini mensimulasikan Concurrent Users menekan endpoint kritikal
 * (login, dashboard, students, journal) dan mengukur:
 *   - Response Time (avg/min/max/p95)
 *   - Throughput (requests/sec)
 *   - Error Rate (%)
 *
 * Catatan: skrip ini adalah pengganti LOKAL untuk Apache JMeter/Postman
 * (yang butuh GUI/binary terpisah). Untuk pengumpulan tugas resmi,
 * jalankan skenario yang SAMA di JMeter (lihat .jmx di folder
 * ../../../03_Test_Scripts_and_Automation/jmeter_or_postman_scripts/)
 * agar mendapat grafik & report standar industri.
 *
 * Jalankan:
 *   PORT=3311 node server.js &        # start server di terminal lain
 *   node tests/load/load_test.js
 */
const BASE = process.env.BASE_URL || 'http://localhost:3311';
const CONCURRENT_USERS = Number(process.env.VUS || 20);
const REQUESTS_PER_USER = Number(process.env.ITER || 10);

async function loginAndGetSid() {
  const res = await fetch(BASE + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'admin@sekolah.test', password: 'password123' }),
    redirect: 'manual',
  });
  const raw = res.headers.get('set-cookie') || '';
  const m = raw.match(/sid=([^;]+)/);
  return m ? m[1] : null;
}

async function timedRequest(url, options) {
  const start = performance.now();
  try {
    const res = await fetch(url, options);
    await res.text();
    const ms = performance.now() - start;
    return { ok: res.status < 400, status: res.status, ms };
  } catch (e) {
    return { ok: false, status: 0, ms: performance.now() - start };
  }
}

async function virtualUser(sid, results) {
  const endpoints = ['/dashboard', '/students', '/journal', '/bk'];
  for (let i = 0; i < REQUESTS_PER_USER; i++) {
    const url = BASE + endpoints[i % endpoints.length];
    const r = await timedRequest(url, { headers: { Cookie: `sid=${sid}` } });
    results.push(r);
  }
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

(async () => {
  console.log(`Load Test: ${CONCURRENT_USERS} concurrent users x ${REQUESTS_PER_USER} requests`);
  const sid = await loginAndGetSid();
  if (!sid) {
    console.error('Gagal login untuk load test. Pastikan server berjalan di', BASE);
    process.exit(1);
  }

  const results = [];
  const start = performance.now();
  await Promise.all(
    Array.from({ length: CONCURRENT_USERS }, () => virtualUser(sid, results))
  );
  const totalTime = (performance.now() - start) / 1000; // seconds

  const times = results.map((r) => r.ms);
  const errors = results.filter((r) => !r.ok);
  const report = {
    total_requests: results.length,
    concurrent_users: CONCURRENT_USERS,
    duration_sec: Number(totalTime.toFixed(2)),
    throughput_rps: Number((results.length / totalTime).toFixed(2)),
    avg_response_ms: Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)),
    min_response_ms: Number(Math.min(...times).toFixed(2)),
    max_response_ms: Number(Math.max(...times).toFixed(2)),
    p95_response_ms: Number(percentile(times, 95).toFixed(2)),
    error_count: errors.length,
    error_rate_pct: Number(((errors.length / results.length) * 100).toFixed(2)),
  };

  console.log(JSON.stringify(report, null, 2));
})();
