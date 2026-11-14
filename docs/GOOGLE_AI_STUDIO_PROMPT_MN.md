# BYBE Studio — Google AI Studio ↔ GitHub аюулгүй нэгтгэх MASTER PROMPT
Огноо: 2026-11-15

## Одоогийн бодит төлөв
- Google AI Studio Build нь enkhbat194/bybe-studio- repository-ийн main салбартай холбогдсон.
- AI Studio GitHub sync самбарт "Changes in Google AI Studio are ready to be pushed" ба "40 changed files" байна.
- Эдгээр 40 файл AI Studio дотор өөрчлөгдсөн, GitHub руу push хийгдээгүй. Устгах, reset хийх, blindly overwrite хийхийг ХОРИГЛОНО.
- Нөгөө талд ChatGPT GitHub main-д Монгол React интерфэйс, QA, OCR backend, optional Live Voice, тестийн код commit хийсэн.
- GitHub дээр main-ийн хамгаалалтын нөөц салбар: backup/pre-aistudio-sync-2026-11-15
- Өмнөх enkhbat194/bybe-studio бол өөр repo. Хөгжүүлэх шинэ repo ганцхан enkhbat194/bybe-studio-.

## Чиний үүрэг
Эхлээд 40 файлыг GitHub-ийн main дахь кодтой харьцуулан АЮУЛГҮЙ НЭГТГЭХ. Зүгээр л шинээр rewrite хийх, 40 файлыг хаях, GitHub дахь Монгол кодыг дарах, force push хийхгүй.

## 1-р шат: аудит ба backup
1. AI Studio дахь одоогийн src/App.tsx, UI components, index.css, server.ts, package.json болон бүх 40 modified/added файлыг шалга. Бодит агуулгаар нь боломжуудыг тодорхойл.
2. GitHub main-тай дараах файлуудыг тулга: src/App.tsx, src/styles.css, src/i18n/mn.ts, src/lib/clipRules.ts, src/lib/clipRules.test.ts, server.ts, server/liveVoice.ts, package.json, index.html, metadata.json, tsconfig.json, vite.config.ts, README.md, .github/workflows/ci.yml.
3. Тулгалтын хүснэгт: файл, AI Studio-ийн сайн код, GitHub-ийн сайн код, зөрчил, нэгтгэх шийдэл.
4. AI Studio-ийн 40 файлыг Download App (ZIP) хэлбэрээр эхлээд нөөцлөх шаардлагатай. Үүнийг автоматаар хийх эрхгүй бол хэрэглэгчид ZIP татуулах алхмыг үзүүл.
5. GitHub хоёр чиглэлийн sync-ийг ашигла. Зөрчил гарвал Resolve conflicts диалог доторх side-by-side diff-ээр тус бүрийг шийд. Нэг талыг бүхэлд нь сонгохгүй.
6. Одоохондоо GitHub руу PUSH БҮҮ ХИЙ. Audit report ба build/test-ийг эхлээд үзүүл.

## 2-р шат: Монгол интерфэйс
- Бүх меню, товч, field, tooltip, modal, toast, warning, loading, error, empty state, accessibility label Монгол кирилл байна.
- Орчуулгын нэгдсэн эх сурвалж: src/i18n/mn.ts.
- Англи техникийн нэр хэрэгтэй бол Монгол тайлбартай: Waveform (дууны долгион), Revision (засварын хувилбар), QA (чанарын баталгаажуулалт).
- Чех үг, өгүүлбэр, диакритикийг эх хувилбараар хадгал: č, ř, š, ž, ě, ů, á, é, í. Эх Чех текстийг Монгол болгохгүй.
- Desktop audio QA workstation хамгийн чухал, iPhone responsive UI нэмэлт.

## 3-р шат: хадгалах ба тусгаарлах функцүүд
Үндсэн workflow: эх видео → OCR дэлгэцийн бичвэр → ASR аудио яриа → Чех/Англи ялгах → 4 Чех аудионы start/end санал → waveform редактор → human QA → revision → app export.
Заавал үлдээх: video playback, OCR, transcription, waveform/timeline, zoom, fine trim, QA, экспорт, чухал сайн UI компонентууд.
Live Voice-ийг УСТГАХГҮЙ. AI Studio-ийн бүрэн Live Voice implementation-ийг preserve хийж, GitHub дахь server/liveVoice.ts-тай нэгтгэ. Энэ нь ирээдүйд ашиглах тусдаа модуль бөгөөд default BYBE_ENABLE_LIVE_VOICE=false.
Ерөнхий AI Chat, Google Maps, тусдаа TTS, ерөнхий subtitle service зэрэг үндсэн QA-д хэрэггүй зүйлсийг үндсэн цэснээс хас. Dependency байвал module-ийг устгахаас өмнө нөлөөг шалга.

## 4-р шат: клип ба QA дүрэм
- Нэг Чех үгт 4 role: word_normal, word_slow, sentence_normal, sentence_slow. Англи audio хасагдана.
- Дэлгэцийн текстийн харагдах хугацаа нь ярианы start/end биш; OCR + ASR + VAD + context-ийг тулгана.
- Хуурамч confidence 0.95/0.96, start/end-ийг хүчээр 1.2 sec болгохыг хориглоно.
- Үеэр уншсан бүтэн үгийг тус тусад нь таслахгүй. Эхний сул авиа, сүүлийн авиа бүтэн.
- №61 knír: эхний k, сүүлийн r; №94 zlatá: Англи Gold-ийг Чех аудио гэж хадгалахгүй; №95 růžová: аудио ба Чех текстийг тулгах.
- QA 6 checks: start_heard, end_heard, whole_heard, language_correct, text_correct, role_correct.
- Start/end/text/role засагдсан тохиолдол бүрт QA баталгааг reset хийх.
- Эх видео, хуучин WAV дарж устгахгүй. Revision ID, SHA-256, source file ID, start/end, file path бүртгэнэ.
- APP_READY зөвхөн бодит WAV хадгалсан, зөв Чех агуулгатай, QA баталгаажсан үед.
- 6 цагийн видеог base64 JSON-д нэг дор илгээхгүй; streaming/chunking, resume/retry/cancel, task progress төлөвлөнө.
- Server-only API key; .env, media/WAV/MP3/MKV, хувийн JSON-ийг public GitHub руу бүү push хий.

## 5-р шат: тест ба аюулгүй sync
1. npm run check, npm run test, npm run build амжилттай.
2. Чех Unicode/filename; 4 role; буруу хугацаа; QA reset; JSON import/export; Live Voice default OFF; server secrets; responsive UI тест.
3. Зөвхөн хийсэн бодит функцийг DONE гэж бич; waveform editor, FFmpeg actual WAV extraction, audio-to-text alignment зэрэг байхгүй зүйлсийг бэлэн гэж худал мэдэгдэхгүй.
4. Аудитын тайланг Монгол хэлээр гарга: 40 файлын ялгаа, хадгалсан боломж, хассан зүйл, тестийн үр дүн, үлдсэн ажил, зөрчил.
5. Хэрэглэгч diff/тайланг хараад зөвшөөрсний дараа л Push changes to GitHub. Зөрчилгүй үед л main-ийг update хийнэ. Force push эсвэл overwrite бүү хий.
6. Бүх өөрчлөлт ганц repo: enkhbat194/bybe-studio-. GitHub дээр ChatGPT шинэ commit хийвэл AI Studio GitHub хэсгээс Pull changes хийж авах ёстой; realtime auto-sync гэж үзэхгүй.
