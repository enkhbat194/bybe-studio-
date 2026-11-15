# BYBE Studio — Монгол хэлтэй нэг дэлгэцийн аудио боловсруулах систем

**Repo:** https://github.com/enkhbat194/bybe-studio-  
**Туршилтын салбар:** `feature/typography-ocr-workstation`  
**Draft PR:** https://github.com/enkhbat194/bybe-studio-/pull/1

## Товч ойлголт

BYBE Studio нь Chrome дээр `http://localhost:3000` хаягаар харагддаг **локал веб апп**. Түүний Node/Express сервер, FFmpeg, үнэгүй Tesseract OCR болон сонголтоор суулгах faster-whisper нь **энэ компьютерт** ажиллана. Видео, WAV, OCR үр дүнг GitHub руу илгээхгүй. Тусдаа `main` салбар болон Google AI Studio дахь 40 push хийгдээгүй файлыг өөрчлөөгүй.

## Энэ салбарт бичсэн код

- **Нэг дэлгэц:** зүүн талд нэг мөр = нэг аудио хэсэг (▶ сонсох, ↻ давтах, ✎ засах, WAV экспорт), баруун талд видео/OCR текст, доод талд бодит FFmpeg waveform (дууны долгион).
- **Нэг товшилтын холбоос:** үндсэн waveform-аас хугацаа сонгоод `T` → видеоны Чех бичвэр дээр дарж аудионы мөртэй холбох. Аль хэдийн сонгосон ASR мөрийн текстийг ч ингэж засна.
- **Үнэгүй OCR:** `Tesseract.js`, `ces+eng` загвар; кадрын бичвэр + байрлал. Gemini API **шаардлагагүй**. Нэг кадрын OCR болон бүх видео даяарх 5 минутын хэсгүүдийг арын процессоор скан хийж хадгалах queue.
- **Давтагдах хэв маяг:** нэг видеоны харагдах байрлал/хэмжээгээр текстийн ангиллын дүрэм үүсгэнэ. Bold/өнгөний найдвартай автомат илрүүлэлт одоогоор хийгдээгүй.
- **Локал файлтай ажиллах:** 8 MB багцаар тасарвал үргэлжлүүлж хуулна; эх файл дарж устахгүй; FFprobe хугацаа, SHA-256, хүсэлтээр MKV→MP4 preview (video codec дэмжих нөхцөлтэй).
- **FFmpeg WAV:** хугацаагаар 44.1 kHz 16-bit mono WAV шинэ revision (хувилбар) үүсгэнэ, Unicode Чех нэр/файлын хэш хадгална. Засварын popup-д бодит waveform, start/end бариул, WAV сонсох боломж.
- **Хүний 6 QA:** эхний авиа, сүүлийн авиа, бүтэн дуудлага, хэл, бичвэр, төрөл батлагдсан бөгөөд хадгалсан WAV-ийн хэш/хугацаа таарч байвал `MANUALLY_VERIFIED`. `APP_READY JSON` зөвхөн баталгаажсан revision-ийн metadata-г агуулна (бодит WAV-ийг тусад нь татна).
- **Whisper ASR — сонголтоор:** `scripts/local_asr_worker.py` + `faster-whisper`; 5 минутын хэсэг эсвэл бүх видеог background queue-д оруулж, саналыг зүүн жагсаалтад нэмнэ. Анхны модель таталт болон Python суулгалт шаардлагатай.
- **Хадгалалт:** локал `local_data/` дахь эх медиа/revision, OCR/ASR queue-ийн JSON; браузерын localStorage + JSON export/import. Queue-с тасарсан хэсгийг дахин үргэлжлүүлэх логик байна.
- **Live Voice:** код хадгалагдсан, default OFF.

## Компьютертээ шинэчлэх

Урьд нь `D:\bybe-studio\BYBE-new`-ийг clone хийсэн бол сервер ажиллаж буй CMD дээр `Ctrl+C` дарж зогсоогоод:

```bat
cd /d D:\bybe-studio\BYBE-new
git pull origin feature/typography-ocr-workstation
npm install
npm run dev
```

Chrome: `http://localhost:3000`. FFmpeg/FFprobe-г Windows PATH-д суулгасан байх ёстой. Сонголтот ASR: `INSTALL_WHISPER_WINDOWS.bat`.

**Дэлгэрэнгүй:** [Windows quick start](docs/QUICK_START_MN.md), [ажлын төлөвлөгөө](docs/ROADMAP_MN.md), [ажилласан болон дутуу хэсэг](docs/WORKSTATION_STATUS_MN.md).

## Шалгалт ба хязгаарлалт

GitHub Actions: TypeScript check, unit tests, production build, FFmpeg-ээр жишээ видео үүсгээд source upload → PCM peaks → WAV revision → QA/APP_READY manifest тест. Python ASR worker-ийн синтаксийг шалгана. **Энэ нь бодит 6 цагийн Чех видеогоор Windows дээр бүрэн туршсан гэсэн үг биш.**

Одоогоор **WhisperX Czech forced alignment**, Чех/Англи удаан/хурдан/энгийн бүх хэсгийг автоматаар алдаагүй ангилах хөдөлгүүр, найдвартай Bold/өнгөний OCR, SQLite индекс, MCP холболт, AI Studio-ийн 40 файлын safe merge **хийгдээгүй**. Шинжилгээний үр дүн бүгд `REVIEW_REQUIRED`; хиймэл confidence болон хуурамч APP_READY үүсгэхгүй.

## Аюулгүй байдал

Локал сервер анхдагчаар `127.0.0.1` дээр сонсоно. `local_data/`, медиа, WAV, `.env` файлууд `.gitignore`-д оруулсан. Сүлжээнд ил гаргах/remote MCP нэмэхдээ эхлээд authentication (нэвтрэх баталгаажуулалт), зөвшөөрлийн тогтолцоо шаардлагатай. AI Studio-ийн workspace-ийн 40 unpushed файлыг хамгаалахын тулд энэ feature branch-ийг `main` руу шууд merge хийгээгүй.
