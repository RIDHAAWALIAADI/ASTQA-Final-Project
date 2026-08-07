# Cara Menjalankan Test Scripts

## 1. Unit & Integration Testing (`unit_and_integration_tests/tests/`)

Folder `tests/` di sini harus disalin ke **root folder aplikasi** hasil MID
(`sister-web-sekolah/tests/`), karena file test melakukan
`require('../../lib/auth')` dan `require('../../db')` yang mengacu ke source
code aplikasi. Struktur setelah disalin:

```
sister-web-sekolah/
├── lib/, db/, routes/, views/, server.js   (source code asli, tidak diubah)
└── tests/
    ├── unit/auth.unit.test.js
    ├── integration/integration.test.js
    └── load/load_test.js
```

Jalankan (butuh Node.js v22.5+, sama seperti prasyarat aplikasi):

```bash
# Unit test + code coverage
node --test --experimental-test-coverage tests/unit/*.test.js

# Integration test (otomatis start/stop server & database sementara)
node --test tests/integration/*.test.js

# Load/performance test (server harus sudah berjalan di terminal lain)
node server.js &
VUS=20 ITER=15 BASE_URL=http://localhost:3000 node tests/load/load_test.js
VUS=100 ITER=10 BASE_URL=http://localhost:3000 node tests/load/load_test.js
```

### Hasil Eksekusi Aktual (dicatat saat penyusunan dokumen ini)

```
UNIT TESTING: 9 passed, 0 failed
INTEGRATION TESTING: 13 passed, 0 failed

LOAD TEST - 20 concurrent users x 15 iterasi:
{
  "total_requests": 300, "duration_sec": 0.59, "throughput_rps": 504.53,
  "avg_response_ms": 35.64, "p95_response_ms": 81.8, "error_rate_pct": 0
}

LOAD TEST - 100 concurrent users x 10 iterasi (stress):
{
  "total_requests": 1000, "duration_sec": 1.76, "throughput_rps": 567.14,
  "avg_response_ms": 166.44, "p95_response_ms": 351.91, "error_rate_pct": 0
}
```

Detail lengkap & analisis ada di `02_Test_Plans_and_Reports/Master_Test_Plan_and_Report.pdf`.

## 2. API / Load Testing - JMeter & Postman (`jmeter_or_postman_scripts/`)

- `SISTER_Postman_Collection.json` — import ke Postman (Import → File). Jalankan
  folder "Auth" dulu agar cookie session tersimpan, baru jalankan folder lain.
  Untuk load test otomatis: `newman run SISTER_Postman_Collection.json -n 50`
  (install dulu: `npm install -g newman`).
- `SISTER_LoadTest.jmx` — buka dengan Apache JMeter GUI (`jmeter -t SISTER_LoadTest.jmx`).
  Berisi 3 Thread Group: Login setup, Normal Load (20 VU), Stress Load (100 VU,
  nonaktif secara default — aktifkan manual saat ingin menjalankan). Tambahkan
  Listener "View Results Tree"/"Summary Report"/"Aggregate Report" untuk grafik.

## 3. UI E2E Automation - Cypress (`ui_automation_katalon_cypress/`)

`sister.cy.js` — salin ke `cypress/e2e/` pada project setelah
`npm install cypress --save-dev`. Jalankan `npx cypress open` untuk mode
interaktif (cocok untuk merekam video demo YouTube) atau `npx cypress run`
untuk mode headless/CI.

> **Catatan jujur:** skrip Cypress ini BELUM dieksekusi dalam proses penyusunan
> dokumen ini karena lingkungan penyusunan tidak memiliki browser
> Chromium/Cypress binary. Skrip sudah ditulis mengikuti struktur HTML form
> yang sebenarnya (nama field `input[name="..."]` diambil langsung dari
> `views/*.js`), tetapi kelompok WAJIB menjalankannya sendiri, memverifikasi
> semua selector cocok dengan HTML aktual, dan merekam hasil eksekusinya
> sebagai bagian dari video YouTube (Live Execution Automated Testing).
