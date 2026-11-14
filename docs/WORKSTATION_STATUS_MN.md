# BYBE Studio — шинэ ажлын дэлгэц / Үсгийн хэв маяг OCR
Огноо: 2026-11-15

## Бодитоор бичсэн код
- Одоо нэг дэлгэц: зүүн талд нэг мөр = нэг аудио хэсэг, ▶ / ↻ / ✎; баруун талд видео ба OCR текст дээр товших; доор хэсэгчилсэн хугацааны шугам.
- Тухайн секундын бүртгэгдсэн аудио мөр автоматаар тодорно. Жагсаалтаас сонгоход видео тэр хугацаанд шилжинэ.
- Хугацааны шугам дээр mouse drag хийж эхлэл/төгсгөл сонгоно; T дараад видеоны OCR бичвэр дээр товшвол бичвэр + хугацаа холбогдсон сегмент хадгалагдана. Баталгаажуулалтын төлөв үргэлж REVIEW_REQUIRED.
- Хэрэв хугацаа сонгоогүй бол OCR текст дээр товшиход Clipboard-д хуулна (хөтчийн зөвшөөрлөөс хамаарна).
- Текст тус бүрийн координат, хэмжээ (large/medium/small), жин (bold/regular), өнгө (dark/light/accent), suggested role-ийг Gemini OCR-аар санал болгоно.
- Хэрэглэгч нэг бичвэрийг czech_word / english_word / czech_sentence / english_sentence / ignore гэж ангилснаар хэв маягийн дүрэм үүсгэж зөвхөн тэр видеоны дараагийн OCR snapshot-уудад ашиглана.
- Олон кадраас илэрсэн ижил бичвэрийг хэв маягаар нь давхардахаас хамгаалж зүүн талын нэгдсэн жагсаалтад OCR candidate хэлбэрээр хадгална.
- Видеоны физик эхийг таслахгүйгээр 5 минутын virtual part + 2 секунд давхцах context-ийн metadata тооцож, дараагийн part руу шууд шилждэг.
- Засварлах цонх Enter хадгалж, Esc хаана. Засвар хийсэн сегментийн QA-г reset хийнэ.
- Хадгалалт localStorage + JSON экспорт/импорт; файлын name+size ID-гаар тусгаарлана. Эх медиа экспортод орохгүй.
- Live Voice серверийн код хэвээр, default OFF.
- Тест: npm run check, npm run test, npm run build (GitHub Actions).

## Хийгдээгүй зүйлс — бэлэн гэж нэрлэж болохгүй
1. 6 цагийн видео дээр **бие даасан** (browser хаагдсан ч) хэсэгчилсэн background worker / queue, pause/resume.
2. Видео кадрын өөрчлөлтийг автоматаар илрүүлж нэг цагт олон OCR snapshot үүсгэх scan pipeline. Одоо OCR-ийг кадр тус бүрээр хүсэлт өгч ажиллуулна.
3. Жинхэнэ аудионы waveform peaks; одоогийн доод хэсэг сонгож болох **хугацааны шугам**.
4. Whisper / Qwen3 / VAD / Czech forced alignment engine-ийн локал интеграц.
5. FFmpeg WAV тайрах, SHA256, файлтай холбогдсон revision, SQLite, баталгаажсан APP_READY.
6. Хөтөч MKV container codec-ийг дэмжихгүй байж болно. Local preview conversion хийх шаардлагатай.
7. Chrome/Mac/iPhone бүх хөтөч дээр end-to-end manual acceptance test явуулаагүй.

## Аюулгүй нэгдэл
Google AI Studio-д байгаа 40 unpushed file-ийг дарахгүйн тулд feature/typography-ocr-workstation branch дээр ажилласан.
Тус салбарын PR бол DRAFT. Үүнийг main руу шууд merge хийхээс өмнө Google AI Studio workspace-ийг ZIP backup хийж, diff-ийг тулгаж, хоёр талын өөрчлөлтийг нэгтгэх ёстой.
GitHub: https://github.com/enkhbat194/bybe-studio-/pull/1
