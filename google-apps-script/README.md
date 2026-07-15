# Google Apps Script API

API ini mesti dipasang sebagai skrip terikat kepada Google Sheet `HSR BKP Sabah`.

1. Buka Google Sheet dan pilih **Extensions → Apps Script**.
2. Gantikan `Code.gs` dengan kandungan fail `Code.gs` dalam folder ini.
3. Salin tetapan daripada `appsscript.json` ke manifest projek.
4. Di **Project Settings → Script properties**, tambah `API_KEY` dengan nilai rahsia rawak sekurang-kurangnya 32 aksara.
5. Pilih **Deploy → New deployment → Web app**. Jalankan sebagai pemilik dan benarkan hanya pengguna yang dibenarkan oleh polisi organisasi.
6. Simpan URL `/exec`. URL itu dan `API_KEY` perlu dimasukkan sebagai rahsia hos aplikasi, bukan ke GitHub.

## Mengaktifkan versi dengan kawalan pasukan

Jika Web App telah pun dicipta, jangan cipta deployment berasingan. Selepas menggantikan `Code.gs`:

1. Pilih **Deploy → Manage deployments**.
2. Klik ikon pensel pada deployment Web App semasa.
3. Di bahagian **Version**, pilih **New version**.
4. Klik **Deploy**. URL `/exec` sedia ada akan kekal sama.

Tab `Users` ialah senarai kebenaran aplikasi. E-mel mesti sama dengan identiti akaun yang digunakan untuk membuka laman ChatGPT Sites.

- `Pentadbir`: urus pengguna, projek, kelulusan, dokumen dan tindakan.
- `Penyelaras`: urus projek, kelulusan, dokumen dan tindakan.
- `Pembaca`: paparan dan eksport sahaja.

Pengguna juga mesti diberi akses kepada laman ChatGPT Sites. Menambah pengguna pada tab `Users` sahaja tidak membuka akses laman.

Folder `Dokumen Penyelidikan BKP Sabah` akan diwujudkan secara automatik pada muat naik pertama. Sistem tidak menghantar atau mengubah rekod NMRR, MREC atau HSRAC.
