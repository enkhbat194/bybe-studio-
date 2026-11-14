# Google AI Studio Build — BYBE Studio master prompt (MN)

АЖЛЫН ҮНДСЭН REPO: https://github.com/enkhbat194/bybe-studio-
Branch: main. Өмнөх bybe-studio репог үндсэн source болгон бүү сонго.

ЭХЛЭЭД: Google AI Studio Build → Settings → GitHub → Pull changes from GitHub (эсвэл Build → Add files (+) → Import from GitHub) ашиглан ЭНЭ repository-ийн хамгийн сүүлийн кодыг ав. Одоогийн AI Studio апп өөр repository-тай холбогдсон бол эхлээд ZIP backup хийгээд зөв repository-г импортол. Шинэ repository үүсгэхгүй.

ЗОРИЛГО: Чех 800-ийн урт видеог боловсруулах Монгол UI: эх видео сонгох → Чех үг, өгүүлбэрийн OCR → Чех/Англи ASR → 4 Чех клипийн start/end санал → хүн сонсож шалгах/засах → revision хадгалах → 6 QA шалгалт → app-ready экспорт.

16 ШААРДЛАГА
1. Одоо байгаа React/TypeScript/Express кодын архитектурыг хадгал; бүтнээр нь дахин rewrite бүү хий.
2. Хэрэглэгчид харагдах бүх нэршил Монгол кирилл. Нэгдсэн src/i18n/mn.ts dictionary ашигла.
3. Чех үг, өгүүлбэрийн эх текстийн č, ř, š, ž, ě, ů тэмдэгтийг өөрчилж болохгүй; Монголчилж орчуулахгүй.
4. Үндсэн цэс: Хяналтын самбар, Эх видео, Аудионы зааг, Чанарын шалгалт, Экспорт, Шууд дуут яриа (ирээдүй).
5. Ерөнхий AI Chat, Google Maps, TTS, олон хэлний subtitle зэрэг QA-д хамаарахгүй үйлчилгээг буцаан үндсэн дэлгэцэд нэмэхгүй.
6. LIVE VOICE-ИЙГ УСТГАЖ БОЛОХГҮЙ. server/liveVoice.ts код хадгал; BYBE_ENABLE_LIVE_VOICE=false default; тусдаа ирээдүйн хэсэг.
7. Дэлгэцийн OCR үе шат = ярианы эхлэл/төгсгөлийн үнэн зөв хугацаа биш.
8. OCR/ASR/VAD/forced alignment-ийн санал бүр REVIEW_REQUIRED; хуурамч confidence:0.95 болон тогтмол 1.2 секундээс багагүй хугацаа ашиглахгүй.
9. Англи аудио экспортлохгүй. 4 role: word_normal, word_slow, sentence_normal, sentence_slow.
10. Нэг role дотор удаан үеэр хэлсэн үгийг олон таслахгүй; эхний ба сүүлийн авиаг хадгал.
11. Start/end өөрчлөгдвөл өмнөх QA баталгаа reset; 6 шалгалтыг дахин хийнэ.
12. Эх видео/хуучин WAV overwrite хийхгүй; шинэ revision ID, хадгалсан WAV-ийн SHA-256 хэш, эх source ID тусдаа бүртгэл.
13. APP_READY зөвхөн агуулга, аудио, хадгалсан revision, QA бүгд баталгаажсаны дараа.
14. 6 цагийн видеог base64 JSON-д нэг дор илгээхгүй; chunk upload/streaming, async worker, progress, cancel, resume архитектур хэрэгтэй.
15. GEMINI_API_KEY зөвхөн серверт. PUBLIC GitHub-д видео, WAV, хэрэглэгчийн өгөгдөл, .env огт push хийхгүй.
16. Build/Check/Test-ийг ажиллуулж шалгаад GitHub-д синхрончил. Conflict гарвал diff-г хүнээр шийдүүл.

ЭХНИЙ ГҮЙЦЭТГЭХ АЖИЛ
A. Одоо байгаа Монгол UI-ийн бүх товчлуур, гарчиг, алдаа, статус, mobile харагдацыг шалгаж дуусга.
B. Source part, global word no, clip role, OCR frame time, audio start/end бүгд ялгаатай model-той болго.
C. WaveSurfer regions/zoom болон non-destructive FFmpeg revision pipeline-д чиглэсэн дараагийн алхмыг implementation-д оруулах.
D. Бодит видеоныхоо frame OCR болон аудионы time-ийг тулгахгүйгээр автоматаар APPROVED болгохгүй.
E. Czech diacritics, QA reset, invalid boundaries, import/export roundtrip, Live Voice off-by-default тестүүдийг нэм.
F. Google AI Studio Preview-д ажиллуулж шалга; өөрчлөлтөө зөвхөн enkhbat194/bybe-studio- repository-ийн main салбар руу Push changes хий.

GITHUB SYNC
ChatGPT энэ repository-д commit хийсний дараа AI Studio GitHub табаас Pull changes авна. AI Studio-ийн засварыг Push changes-ээр ижил repo-д буцаана. Автоматаар бодит цагт шинэчлэгдэнэ гэж бүү тооц. Өмнө нь AI Studio workspace-д хадгалагдсан боловч GitHub-д push хийгээгүй код байгаа бол эхлээд ZIP backup ав.
