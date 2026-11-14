# BYBE Studio — 2026-11-15 бодит алдаа засварын тэмдэглэл

## Хэрэглэгчийн Windows screenshot: батлагдсан шинж тэмдэг
1. OCR дууссан 4/4 боловч «0 OCR»; видеон дээр Czech `růžová`, English `pink` харагдаж байсан.
2. Whisper worker `UnicodeEncodeError: 'charmap' codec can't encode characters ... cp1252.py` гэж унасан.
3. Жинхэнэ PCM waveform харагдаж байсан; иймээс WAV/FFmpeg бүхэлдээ эвдэрсэн гэсэн онош буруу.
4. Үндсэн toolbar хэт жижиг, 6+ status хуудас эзэлж, «Хэрэгслүүд» босоо жагсаалт болсон.

## Root cause ба засвар
- **OCR #1 — Tesseract.js v7 headerless TSV:** `server/ocrLocal.ts`-ийн `blocksFromTsv()` нь эхний мөрийг header гэж үргэлж авдаг байв. Tesseract.js-ийн `data.tsv`-д header байдаггүй тул нэг ч мөр уншилгүй `[]` буцаадаг байсан. Header-тай болон header-гүй аль алинд fixed column order танина. Нотолгоо: JS worker `text:'růžová\n\npink\n'` буцааж байсан атлаа манай parser `[]` өгч байсан.
- **OCR #2 — Sparse Text:** CzechClass101 видеоны тарамдсан үг/орчуулгыг default PSM3 сул таньдаг; PSM11/ `PSM.SPARSE_TEXT` нь аль алиныг нь таньж байна. Бодит PART004 эх кадр `10.56s`-т Tesseract CLI `růžová` болон `pink` илрүүлсэн. Гэхдээ browser Windows дээрх бүрэн QA шалгалт үргэлж шаардлагатай.
- **Whisper — CP1252 Unicode:** Windows `py -3.11`-ийн stdout дээр Монгол тэмдэгт агуулсан JSON error message `cp1252`-оор encode хийж чадалгүй worker унадаг байсан. Python stdio `utf-8`, `json.dumps(ensure_ascii=True)`, Node spawn `PYTHONUTF8=1,PYTHONIOENCODING=utf-8` болгосон. Python сан суусан эсэхийг шинээр илрүүлэх `/api/system/capabilities` field `fasterWhisper` нэмэгдсэн.
- **Хуучин OCR job:** `local_data/jobs`-д 4/4 `complete` гэсэн хуучин үр дүн хэвээр байж болно. Шинэ код тэрийг өөрөө дураараа overwrite хийхгүй, «↻ OCR дахин таних» товчоор шинэ job үүсгэнэ. Шинэ зөв OCR snapshot нь ижил хугацаатай хуучин 0-текст snapshot-ыг илүү их text block-оор сольж болно.
- **Ажиллагааны дизайн:** Төлөвийн олон зурвасийг нэг компакт statusline + details diagnostics болгов. `nav`-ийн глобал `flex-direction:column`-ийг BYBE-н specificity-тай хэвтээ toolbar CSS болгон тусгаарласан. Илүү уншигдах текст, тэнцвэртэй 2 багана, доод waveform.
- **Аюулгүй байдал:** QA автоматаар VERIFIED болохгүй; `main` болон Google AI Studio-ийн 40 unpushed өөрчлөлт untouched.

## GitHub шалгалт
- `npm run check`, `npm run test`, `npm run build`.
- `server/ocrLocal.test.ts`: гарчигтай + v7 гарчиггүй TSV-ийн unit regression.
- `tests/ocr-smoke.mjs`: synthesize Czech `růžová` / English `pink` text image with FFmpeg; **actual Tesseract.js** model recognize+coordinate checks, no API key.
- `tests/python-encoding.mjs`: cp1252 env-ийг simulation хийж Mongolian JSON worker-ийг шалгах.
- `tests/media-smoke.mjs`: synthetic MP4 → WAV peaks → WAV revision → six QA → APP_READY manifest.

## Windows дээр дахин шалгах (user acceptance)
1. BYBE-г `Ctrl+C`-ээр зогсоо.
2. `cd /d D:\bybe-studio\BYBE-new`
3. `git pull origin feature/typography-ocr-workstation`
4. `npm install` → `npm run dev`
5. Chrome `http://localhost:3000` → `Ctrl+Shift+R`
6. PART004 видеогоо «Файл нээх» → файл оруулсны дараа «↻ OCR дахин таних» дар. Одоо Tesseract Czech/English text гарч ирэх ёстой; олон цагийн давталт хүсвэл OCR ажиллах явц ба progress-ийг хар.
7. OCR жагсаалт: `růžová`, `pink` зэрэг. Доод waveform-аас хүрээ чирэх → T → видео дээр OCR текст дээр товших → WAV гаргах → сонсож QA.
8. «Хэрэгслүүд»-д Whisper суулгаагүй гэж байвал `INSTALL_WHISPER_WINDOWS.bat` ажиллуулаад серверээ дахин асаана. Error job-аас «↻ Whisper дахин оролдох».
9. Бүхнийг Windows дээр баталгаажуулж амжаагүй; бодит аудионы ярианы олон хэлний төрлийг автоматаар үнэн зөв ангилах ажиллагаа хараахан бүрэн биш.
