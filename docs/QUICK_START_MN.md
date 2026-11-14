# BYBE Studio — Windows дээр бодит ажиллуулах заавар
**Эх код:** https://github.com/enkhbat194/bybe-studio-
**Туршилтын салбар:** feature/typography-ocr-workstation

## 1. Шинэ код авах
Таны компьютерийн хавтас: `D:\bybe-studio\BYBE-new`

1. `npm run dev` ажиллаж буй CMD дээр `Ctrl+C` дарж серверийг зогсоо.
2. Шинэ CMD дээр:
   ```bat
   cd /d D:\bybe-studio\BYBE-new
   git pull origin feature/typography-ocr-workstation
   npm install
   ```
3. `START_BYBE.bat` дээр давхар товш, эсвэл `npm run dev` гэж асаа.
4. Chrome → `http://localhost:3000`.

## 2. FFmpeg шалгах
```bat
ffmpeg -version
ffprobe -version
```
Хэрэв command not found бол FFmpeg-ээ Windows PATH-д оруул. FFmpeg/FFprobe байхгүй үед waveform, WAV таслалт, MKV preview, автомат кадр боловсруулах ажиллахгүй.

## 3. Эх видеогоор турших
1. **Файл нээх** → эх MP4/MKV видео сонго. MKV Chrome-д тоглохгүй байж болно.
2. **Локал аудио холбох** → файлыг зөвхөн энэ компьютерийн `local_data/media` хавтас руу 8 MB-ийн багцаар хуулна. 6 цагийн эх файлд нэмэлт SSD зай хэрэгтэй. Импорт тасарвал дахин дарж үргэлжлүүлнэ.
3. MP4 тоглохгүй бол **MKV → MP4 үзэх**. Энэ нь хөтөч дэмждэг H264+AAC бичлэгт remux (контейнер солих) хийдэг; H265/AV1 мэт зарим кодек дээр ажиллахгүй байж болно.
4. Доод хэсэгт жинхэнэ waveform харагдана.
5. **Бүх видеоны OCR** → 5 минутын хэсгүүдийг арын процесст шинжилнэ; дууссан хэсгийн OCR бичвэрүүд жагсаалтад нэмэгдэнэ. Gemini API хэрэггүй.
6. Доод waveform-аас хэсэг чирж сонго → `T` дар → видеон дээрх текст дээр товш. Нэг аудио хэсэг/текст холбогдоно.
7. Зүүн жагсаалтын **▶** сонсох, **↻** давтах, **✎** засах. Засварын жижиг waveform-ийн хөх/шар шугамыг чирж болно. `Enter` — хадгалах, `Esc` — хаах.
8. Аудионы мөрийн **↓ WAV** товчоор шинэ WAV revision үүсгэнэ. Үүссэн WAV нь QA шаардлагатай. Засвар хийвэл дахин WAV үүсгэх хэрэгтэй.
9. Тухайн мөрийн **✎** → WAV тоглуулах → 6 QA checkbox (шалгах талбар)-ыг батлах → **6 шалгалтаар батлах**.
10. **APP_READY JSON** экспортлоход зөвхөн баталгаажсан WAV-ийн metadata, hash гарна. WAV файлуудыг тусад нь татна.

## 4. Үнэгүй локал Whisper
1. `INSTALL_WHISPER_WINDOWS.bat` дээр давхар товш. Энэ нь Python 3.11-ийн `faster-whisper` санг суулгана.
2. Серверээ дахин асаа.
3. **Энэ хэсгийн яриа таних** — одоогийн 5 минут. **Бүх видеоны Whisper** — бүх хэсгийн арын ASR.
4. Хэл солигдох үед Whisper-ийн танилт, хугацаа баталгаагүй тул үр дүн автоматаар APP_READY болдоггүй.
5. RTX 2070 Super 8 GB дээр загвар `small` анхны тохиргоо; CUDA/cuDNN тохирохгүй бол CPU рүү шилжинэ. CPU дээр 6 цагийн файл удаан боловсруулагдаж болно.
6. Модель `small`-ийг анх татахад интернет шаардагдаж болно.

## 5. Аюулгүй хадгалалт
- Эх видео `local_data/media/<id>/source.bin` дотор дахин хуулагдана; эх хувийг өөрчлөхгүй.
- Бодит WAV revision `local_data/media/<id>/revisions/` дотор хадгалагдана.
- OCR queue `local_data/jobs/`, ASR queue `local_data/asr-jobs/` дотор хадгалагдана.
- Хөтөчийн JSON backup-ийг тогтмол тат; браузерын cache арилахад локал UI-ийн сонгосон текстийн бүртгэл алдагдаж болзошгүй.
- `local_data/` public GitHub-д орохгүй (`.gitignore` хамгаална).
- Локал server default: **127.0.0.1** — нийтийн сүлжээнд зориуд нээхгүй.
- Код өөрчлөгдөх бүрд GitHub ↔ Windows автоматаар sync хийгдэхгүй; `git pull` шаардлагатай.

## 6. Хийгдсэн/хийгдээгүй ялгаа
**Бичсэн код:** Монгол UI, нэгдсэн жагсаалт, FFmpeg WAV/peaks, OCR локал, OCR background queue, optional faster-whisper ба ASR queue, 6 QA checks, hash revision, virtual 5min parts.

**Одоогоор алга / бодит тест хүлээгдэж буй:** Windows дээр 6 цагийн бодит бичлэгийн end-to-end туршилт; автоматаар Чех/Англи аудионы 4 role найдвартай ангилах; WhisperX Czech forced alignment; фонтын bold/color бодит танилт; SQLite индекстэй том хэмжээний persistent database; safe MCP remote integration; AI Studio-д push хийгдээгүй 40 файлыг нэгтгэх.

**GitHub Draft PR:** https://github.com/enkhbat194/bybe-studio-/pull/1 — AI Studio-ийн 40 өөрчлөлтийг дарахаас хамгаалсан.
