# Sistem Pemantauan Penyelidikan BKP Sabah

Sistem operasi untuk memantau portfolio projek, kelulusan, milestone, dokumen, tindakan dan audit penyelidikan BKP Sabah.

## Seni bina

- **Aplikasi:** Vinext/React dengan API pelayan.
- **Pangkalan data utama:** Google Sheet `HSR BKP Sabah`.
- **API data:** Google Apps Script Web App yang terikat kepada Sheet.
- **Dokumen:** Google Drive, dalam folder yang diwujudkan oleh Apps Script.
- **Kod sumber:** repositori GitHub awam; rahsia tidak disimpan dalam repositori.
- **Hos aplikasi:** hos pelayan yang menyokong environment secrets. GitHub Pages sahaja tidak digunakan kerana ia tidak boleh melindungi kunci API atau menjalankan API pelayan.

Sistem tidak menghantar atau mengubah data pada NMRR, MREC, HSRAC atau sistem luar. Tindakan luar hanya direkodkan sebagai draf sehingga diluluskan manusia.

## Konfigurasi Google Sheets

Struktur Google Sheet:

- `Dashboard`
- `Projects`
- `Approvals`
- `Milestones`
- `Documents`
- `Actions`
- `Audit_Log`
- `Settings`
- `Lists`

Kod API dan arahan pemasangan terdapat dalam [`google-apps-script/`](google-apps-script/README.md).

Tetapkan dua environment secrets pada hos aplikasi:

```text
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
GOOGLE_APPS_SCRIPT_API_KEY=<rahsia-yang-sama-dengan-script-property-API_KEY>
```

Jika dua nilai ini belum tersedia, aplikasi mengekalkan pangkalan data D1 sedia ada sebagai fallback agar perkhidmatan tidak terputus semasa migrasi.

## Pembangunan

```bash
npm ci
npm run lint
npm run build
```

Node.js 22 atau lebih baharu diperlukan.

## Keselamatan

- Jangan commit `.env`, API key, token atau URL pentadbiran sensitif.
- Kekalkan Google Sheet dan folder dokumen sebagai private/restricted.
- Gunakan Apps Script Web App sebagai perantara; pelayar tidak berhubung terus kepada Sheet menggunakan kunci rahsia.
- Semua perubahan penting direkodkan dalam `Audit_Log`.
