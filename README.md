# BYBE Studio — Чех 800 · Монгол интерфэйс

Үндсэн шинэ repository: https://github.com/enkhbat194/bybe-studio-
Энэ нь өмнөх enkhbat194/bybe-studio repository-оос тусдаа шинэ төсөл.

## Хийгдсэн эхний шат
- Монгол React UI: эх видеог browser-д нээх, кадрын OCR, аудионы start/end бүртгэл, эх видеоны сонгосон хэсгийг тоглуулах.
- 4 төрлийн clip, QA-ийн 6 шалгалт, засвар дээр QA reset, JSON импорт/экспорт.
- Gemini OCR болон богино ASR endpoint; нууц API key сервер дээр.
- Live Voice модуль server/liveVoice.ts дотор хадгалсан, default идэвхгүй.
- Ерөнхий чат, газрын зураг, TTS-г үндсэн урсгалаас хассан.

## Одоогоор байхгүй
- 6 цагийн видеоны batch OCR/ASR, автоматаар audio start/end тодорхойлох.
- Бодит WAV таслагч (FFmpeg), waveform редактор, revision SQLite, cloud backup.
- Browser-оос гаргасан JSON нь WAV файл биш. Хүний QA-г AI өөрөө батлахгүй.

## Google AI Studio хоёр чиглэлтэй GitHub sync
1. Build → Add files (+) → Import from GitHub: enkhbat194/bybe-studio-.
2. Эсвэл одоогийн app-ийн Settings → GitHub цэсээс Link existing repository / Pull changes сонго.
3. docs/GOOGLE_AI_STUDIO_PROMPT_MN.md файлыг Google AI Studio дахь prompt болгон өг.
4. ChatGPT GitHub-д засвар хийсний дараа AI Studio GitHub → Pull changes.
5. AI Studio засварын дараа GitHub → Push changes. Conflict гарвал diff шалга.
6. Бүх медиа файл ба API түлхүүр public repo-д огт нэмэхгүй.

GitHub шинэчлэлт бүр AI Studio-д автоматаар татагдана гэж үзэхгүй — Pull changes шаардлагатай.

## Локал ажиллуулах
- Node.js 22 суулгана.
- npm install
- .env.example файлыг .env нэрээр хуулж GEMINI_API_KEY-гаа тохируулна.
- npm run dev
- http://localhost:3000

Шалгалт: npm run check; npm run test; npm run build.

## Хадгалалт, аюулгүй байдал
- Эх видео browser blob URL-д нээгдэнэ, OCR-д зөвхөн сонгосон кадр илгээгдэнэ.
- QA localStorage-д хадгалагдана; JSON backup авбал төхөөрөмж/кэш солиход сэргээж болно.
- Дэлгэцийн OCR timestamp бол ярианы бодит start/end биш.
- Жинхэнэ WAV хараахан үүсгэдэггүй — бэлэн WAV гэж худал мэдэгдэл гаргахгүй.
