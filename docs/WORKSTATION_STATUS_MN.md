# BYBE Studio — хэрэгжүүлэлтийн статус

Огноо: 2026-11-15  
Repository: https://github.com/enkhbat194/bybe-studio-  
Салбар: `feature/typography-ocr-workstation` · Draft PR #1

## Одоогийн кодод БИЙ
- Монгол хэлтэй нэг дэлгэц, нэг аудио = нэг мөр; ▶, ↻, ✎, WAV export; тоглож буй аудионы мөр дагана
- Хулганаар хугацаа сонгох → `T` → видеоны OCR текст дээр дарж холбоно; сонгосон ASR мөрийн бичвэрийг мөн нэг товшилтоор засна
- Үнэгүй локал Tesseract.js OCR (Чех/Англи); кадрын текстийн байрлал, хэмжээ; нэг видеоны style rule
- 5 минутын виртуал хэсгүүд; локал FFmpeg → sampled OCR кадр → хадгалагдсан background queue; pause/resume/restart recovery
- Сонголтоор Python faster-whisper local ASR worker (`small`), бүх 5 минутын хэсэг дээр background queue; GPU тохирохгүй бол CPU
- Том файлын 8 MB streamed upload/resume, FFprobe, source SHA256, сонголтоор MKV→MP4 preview
- FFmpeg-ийн бодит PCM peak waveform, Popup fine-trim wave editor, non-destructive WAV revision
- Хадгалсан WAV-ийг browser-д сонсох, 6 QA checkbox, revision hash/revision metadata нягтлах; баталгаажсан metadata-г APP_READY JSON болгон гаргах
- LocalStorage + JSON экспорт/импорт; локал source/revision болон queue JSON persistence
- Node.js server default localhost `127.0.0.1`; Live Voice module default OFF
- GitHub CI: TypeScript + unit + build + synthetic-MP4→PCM→WAV→QA интеграцийн тест, Python syntax
- Нээлттэй Draft PR: https://github.com/enkhbat194/bybe-studio-/pull/1, main/AI Studio 40 files untouched

## Хараахан ХИЙГДЭЭГҮЙ (бэлэн гэж зарлахгүй)
- Бодит 6 цагийн Чех видео дээр Windows 11 + RTX2070Super end-to-end acceptance/accuracy/performance tests
- WhisperX Чех forced alignment болон Qwen3-ASR загварыг Subtitle Edit-ээс шууд BYBE-д нэгтгэх
- Чех/Англи ярианы дараалал, word_normal/slow/sentence_normal/slow-ийг бүрэн автоматаар **найдвартай** ангилах, ASR/OCR текстийг бүрэн автомат холбох
- Өнгө, фонтын bold/regular-г локал дүрснээс найдвартай таньж ангилах
- Хэсэг бүрийг ярианы яг чимээгүй зааг дээр уян хатан таслах; одоогоор үндсэн боловсруулах core 5 минут тогтмол, OCR/ASR санал нь REVIEW_REQUIRED
- GPU/CPU хэрэглээний адаптив throttle; олон загварын чанарын benchmark
- SQLite database болон transaction/recovery. Одоо atomic JSON файлууд ашиглана
- MCP authenticated remote connection / GitHub AI Studio unpushed 40 files safe merge
- Бодит WAV файлуудыг аппын бүх хичээлтэй bulk package болгон нэг дарж экспортлох

## Үйлдлийн бодит зарчим
1. «Файл нээх» → «Локал аудио холбох» (local_data дотор эх видеоны хамгаалалттай хуулбар)
2. «Бүх видеоны OCR» болон сонголтоор «Бүх видеоны Whisper» дарна
3. Эхний 5 минутын үр дүнг хэрэглэгч шалгаж байхад бусад хэсгүүд сервер ажилласаар боловсруулагдана
4. Аудио хэсэг дээр T+OCR текст, ▶/↻/✎, FFmpeg WAV
5. Шинэ WAV-ийг бодитоор сонсож 6 QA-г батална; APP_READY JSON зөвхөн баталгаажсаныг бүртгэнэ
6. Сервер зогсвол локал queue-ийн manifest-аар unfinished part-аас үргэлжлүүлэх боломжтой, гэхдээ Windows дээр тасалдал сэргээлтийг тусгай тестээр баталгаажуулах ёстой

## Баримт бичиг
- [Windows quick start](QUICK_START_MN.md)
- [Хөгжүүлэлтийн үе шат, шалгуур](ROADMAP_MN.md)
- Draft PR: https://github.com/enkhbat194/bybe-studio-/pull/1
