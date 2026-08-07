/**
 * UI / END-TO-END AUTOMATION - Cypress
 * ASTQA Final Project - SISTER (Sistem Informasi Sekolah Terintegrasi)
 *
 * CARA MENJALANKAN (di komputer kelompok, BUKAN di sandbox dokumen ini):
 *   1. cd ke folder proyek aplikasi (sister-web-sekolah)
 *   2. npm install cypress --save-dev
 *   3. Jalankan aplikasi: node server.js   (di terminal terpisah, port 3000)
 *   4. Copy file ini ke cypress/e2e/sister.cy.js
 *   5. npx cypress open     (mode interaktif, untuk rekam video demo)
 *      atau
 *      npx cypress run      (headless, untuk CI/laporan otomatis)
 *
 * Kredensial memakai akun demo bawaan aplikasi (lihat README aplikasi):
 * semua akun demo password = "password123"
 */

const BASE_URL = 'http://localhost:3000';

function login(email, password = 'password123') {
  cy.visit(`${BASE_URL}/login`);
  cy.get('input[name="email"]').type(email);
  cy.get('input[name="password"]').type(password);
  cy.get('form').submit();
}

describe('E2E-01 Login & Authentication', () => {
  it('E2E-01.1 Admin berhasil login dan melihat dashboard', () => {
    login('admin@sekolah.test');
    cy.url().should('include', '/dashboard');
    cy.contains('Dashboard');
  });

  it('E2E-01.2 Login gagal dengan password salah menampilkan pesan error', () => {
    login('admin@sekolah.test', 'password-salah');
    cy.url().should('include', '/login');
    cy.contains(/salah|error|invalid/i);
  });
});

describe('E2E-02 RBAC Navigation per Role', () => {
  it('E2E-02.1 Admin dapat mengakses menu Manajemen Pengguna', () => {
    login('admin@sekolah.test');
    cy.visit(`${BASE_URL}/users`);
    cy.url().should('include', '/users');
    cy.get('body').should('not.contain', '403');
  });

  it('E2E-02.2 Guru TIDAK dapat mengakses menu Manajemen Pengguna (403)', () => {
    login('guru@sekolah.test');
    cy.visit(`${BASE_URL}/users`, { failOnStatusCode: false });
    cy.contains('403');
  });

  it('E2E-02.3 Guru BK dapat mengakses menu BK', () => {
    login('bk@sekolah.test');
    cy.visit(`${BASE_URL}/bk`);
    cy.url().should('include', '/bk');
  });
});

describe('E2E-03 Transaksi Utama: Jurnal Mengajar (Guru)', () => {
  beforeEach(() => login('guru@sekolah.test'));

  it('E2E-03.1 Guru dapat membuat jurnal mengajar baru end-to-end', () => {
    cy.visit(`${BASE_URL}/journal/create`);
    cy.get('select[name="class_id"]').select(1);
    cy.get('select[name="subject_id"]').select(1);
    cy.get('input[name="date"]').type('2026-07-30');
    cy.get('textarea[name="material"], input[name="material"]').type('Materi hasil E2E Cypress');
    cy.get('form').submit();
    cy.url().should('include', '/journal');
    cy.contains('Materi hasil E2E Cypress');
  });
});

describe('E2E-04 Transaksi Utama: BK (Guru BK)', () => {
  beforeEach(() => login('bk@sekolah.test'));

  it('E2E-04.1 Guru BK dapat mencatat kasus baru end-to-end', () => {
    cy.visit(`${BASE_URL}/bk/create`);
    cy.get('select[name="student_id"]').select(1);
    cy.get('select[name="case_type"]').select('konseling');
    cy.get('input[name="date"]').type('2026-07-30');
    cy.get('textarea[name="description"], input[name="description"]').type('Kasus hasil E2E Cypress');
    cy.get('form').submit();
    cy.url().should('include', '/bk');
    cy.contains('Kasus hasil E2E Cypress');
  });
});

describe('E2E-05 Data Kesiswaan (Admin) - CRUD Boundary/Equivalence', () => {
  beforeEach(() => login('admin@sekolah.test'));

  it('E2E-05.1 Admin menambah siswa baru dengan data valid', () => {
    cy.visit(`${BASE_URL}/students/create`);
    cy.get('input[name="nis"]').type('2026777');
    cy.get('input[name="name"]').type('Siswa E2E Cypress');
    cy.get('select[name="class_id"]').select(1);
    cy.get('form').submit();
    cy.url().should('include', '/students');
    cy.contains('Siswa E2E Cypress');
  });

  it('E2E-05.2 Admin gagal menambah siswa dengan NIS duplikat (negative EP case)', () => {
    cy.visit(`${BASE_URL}/students/create`);
    cy.get('input[name="nis"]').type('2026777'); // sama dengan test sebelumnya
    cy.get('input[name="name"]').type('Siswa Duplikat');
    cy.get('select[name="class_id"]').select(1);
    cy.get('form').submit();
    cy.contains(/gagal|error|unique/i);
  });
});
