# BYBE Studio — ажлын төлөвлөгөө ба шалгуур
Огноо: 2026-11-15 · Үндсэн repo: https://github.com/enkhbat194/bybe-studio-
Feature: feature/typography-ocr-workstation · Draft PR #1

## 1. Нэг дэлгэцийн UI ба үндсэн редактор
- [x] Зүүн жагсаалт: нэг мөр = нэг бодит аудио хэсэг, ▶/↻/✎/WAV; баруун дээд видео, доод waveform
- [x] Видео явж буй секундийн мөр тодорно, мөр дээр дарахад видео тэр цагт очно
- [x] Timeline mouse drag + T + OCR бичвэр дээр click → аудио/текстийн холбоос
- [x] Төвийн popup waveform (хөх start, шар end)-ийг чирж засах, Enter хадгалах, QA reset
- [x] 5 минутын виртуал part, хэсэг хооронд шилжилт
- [ ] Хэрэглэгчийн компьютер дээр MKV/MP4 playback, бичвэр/аудионы бодит acceptance test

## 2. Үнэгүй текст ба яриа таних
- [x] Tesseract.js Чех+Англи OCR, координат, нэг видеоны style rule (Gemini API шаардлагагүй)
- [x] Локал background OCR, кадр sample, 5 минутын queue, pause/resume/recovery
- [x] Optional faster-whisper Python ASR, per-part/full-video background queue, текст/хугацааны санал
- [x] ASR таньсан мөрийн бичвэрийг OCR сонгож засах UI
- [ ] Чех/Англи яриа хооронд солигдох үед speaker/role-ийг найдвартай автоматаар ангилах
- [ ] WhisperX Czech forced alignment болон Qwen3-ASR-ийг тусгай сонголтоор туршиж нэгтгэх
- [ ] Текстийн font color, bold/regular яг таних; одоогоор OCR хэмжээ/байрлал/хэрэглэгчийн дүрэм
- [ ] OCR/ASR accuracy хэмжилт: PART004 50+ кадр ба 100+ аудио, гар QA reference

## 3. Файл, waveform, WAV, QA
- [x] Том файлыг 8 MB хэсэгчлэн локал серверт оруулах, импорт үргэлжлүүлэх
- [x] FFprobe duration / SHA256 / оригиналыг дарж устгахгүй хадгалалт
- [x] FFmpeg PCM waveform peaks, popup fine trim, WAV 44.1 kHz/16-bit mono
- [x] Шинэ WAV revision бүр тусдаа нэр, hash, playback/download
- [x] 6 хүний QA шалгалт, текст/хугацаа/төрөл хэштэй таарах баталгаажуулалт
- [x] `APP_READY JSON` зөвхөн баталгаажсан revision-ийн metadata
- [x] Optional MKV→MP4 browser preview remux (видео кодек H264 зэрэг дэмжигдэх хэрэгтэй)
- [ ] Олон WAV-ийг bulk ZIP package болгон сургалтын аппад экспортлох
- [ ] SQLite транзакцтай хадгалалт; одоогоор JSON manifests + browser localStorage
- [ ] Windows бодит 6 цагийн видео + 8GB GPU дээр хурд, диск, санах ойн stress test

## 4. Гүйцэтгэл ба тасралтгүй ажиллах найдвартай байдал
- [x] OCR/ASR 5 минутын ажлын queue, part-by-part incremental results
- [x] Тус тусад нь pause/resume; Node сервер ажиллаж байвал browser хаасан ч processing үргэлжлэх
- [x] Job manifest-ыг дискэнд хадгалах, restart-д дуусаагүй part дахин ажиллуулах логик
- [ ] Хэсэглэлийг чимээгүй/хичээл солигдох бодит заагт уян хатан тааруулах
- [ ] GPU/CPU adaptive load, VRAM/RAM хэмжилт, алдаатай part-г эрэмбэлэн retry
- [ ] Алдаатай эх файл, тасалдсан power/network, дүүрсэн диск зэрэг edge case-уудыг Windows дээр турших

## 5. Хөгжүүлэлтийн холболт, баталгаажуулалт
- [x] GitHub тусдаа feature branch, draft PR, `main`/Google AI Studio-ийн 40 unpushed өөрчлөлт хамгаалагдсан
- [x] GitHub Actions: TypeScript, unit, build, FFmpeg synthetic MP4/media API smoke, Python syntax
- [ ] Google AI Studio workspace-ийн 40 файлыг ZIP backup + diff + non-destructive merge
- [ ] Secure MCP remote integration (authentication/permission + backend authorization)
- [ ] Windows local user acceptance; 6 цагийн бичлэг дээр сэргээх, найдвартай export шалгах

## Одоо яг хийх Windows тест
1. `Ctrl+C` ашиглан ажиллаж буй BYBE server-ийг зогсооно.
2. `cd /d D:\bybe-studio\BYBE-new`, `git pull origin feature/typography-ocr-workstation`, `npm install`, `npm run dev`.
3. `ffmpeg -version`, `ffprobe -version` — хоёул ажилладаг байх.
4. Видео сонго → локал аудио холбох → бодит waveform харагдах → нэг clip чирж T+OCR тексттэй холбох.
5. Clip-ийн WAV үүсгэх → WAV-г сонсох → 6 QA → APP_READY JSON-г шалгах.
6. OCR бүх хэсэг → эхний үр дүн гарч ирэхэд бусад хэсэг ард ажиллаж байгаа эсэхийг харах.
7. Optional faster-whisper: `INSTALL_WHISPER_WINDOWS.bat` ажиллуулаад Whisper ASR хэсэг сонгож турших.
8. Компьютер унтраахгүйгээр Node server restart / JSON сэргээх тест.

Тест амжилттай болсон гэсэн дүгнэлт гаргахын өмнө бодит PART004 эх видео, хадгалсан WAV тексттэй таарч байгаа, эхний/сүүлийн авиа бүтэн гэдгийг сонсож шалгах шаардлагатай.

**Заавар:** [QUICK_START_MN.md](QUICK_START_MN.md). **Төлөв:** [WORKSTATION_STATUS_MN.md](WORKSTATION_STATUS_MN.md).
