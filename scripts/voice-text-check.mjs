// Текстовая проверка инструкции голосового собеседника без микрофона: прогоняет заготовленные вопросы через текстовую модель
// с настоящей инструкцией (backend/src/voice/prompt.ts) и ищет в ответах известные ошибки. Это не голосовая модель:
// ловит ошибки самой инструкции (отказы, противоречия, род, непройденное), но не ошибки распознавания речи.
//
//   npm run server:build                      # свежая инструкция (читается из backend/dist)
//   OPENAI_API_KEY=… MODEL=<текстовая модель OpenAI> node scripts/voice-text-check.mjs [сценка]
//
// Ключ берётся только из окружения и нигде не печатается и не пишется. BASE_URL (по умолчанию https://api.openai.com/v1)
// подходит и для другого OpenAI-совместимого адреса, например OpenRouter (ключ тогда OPENROUTER_API_KEY, а
// MODEL=nvidia/nemotron-3-ultra-550b-a55b:free, как у чата-помощника в docs/chat.md). Сценки: topic, position, noise, future (без аргумента все).
// Расход: около 10 запросов по ~5 тысяч токенов инструкции, то есть несколько центов.
import { fileURLToPath } from 'node:url'

const GENDER = /(?<![а-яё])(рад|рада|выпил|выпила|понял|поняла|уверен|уверена|хотел|хотела|ошибся|ошиблась|сказал|сказала|писал|писала|говорил|говорила|объяснил|объяснила)(?![а-яё])/i
const REFUSE = /уточни у (учителя|Леры)|у учителя на (субботнем )?уроке|не из твоих карточек/i
const LISTEN = /не расслыш|скажи ещё раз|скажи еще раз|повтори(?!ть)|не понял|не поняла/i
const BACK = /вернёмся к пройден|на пройденн|пройденн\S* тем|к пройденному/i

/** Корейские слова с 와/과 на конце, которые на самом деле не частицы. */
const WA_OK = new Set(['사과', '학과', '교과', '과', '와'])
const koTokens = s => s.match(/[가-힣]+/g) ?? []
/** Ответ без цитат в «» и "" (там может стоять фраза ученика, её не проверяем). */
const noQuotes = s => s.replace(/«[^»]*»/g, ' ').replace(/"[^"]*"/g, ' ')

/** Каждая проверка: (ответ, номер реплики) → строка с замечанием или ''. */
const common = [
  r => (GENDER.test(r) ? `род о себе или об ученике: «${r.match(GENDER)[0]}»` : ''),
  r => {
    const bad = koTokens(noQuotes(r)).filter(t => t.length > 1 && /(와|과)$/.test(t) && !WA_OK.has(t))
    return bad.length ? `непройденное 와/과: ${bad.join(', ')}` : ''
  },
  r => (/(에게|한테)/.test(noQuotes(r)) ? 'непройденное 에게/한테' : ''),
  r => (/있고|먹고|가고|싶어요/.test(noQuotes(r)) ? 'непройденное -고 / 싶다' : ''),
  r => (/먹[^.\n]{0,40}(поеду|ехать|поедет|поедем)/i.test(r) ? '먹다 переведено как «ехать»' : ''),
  (r, i) => (i === 0 && /^\s*Верно/i.test(r) ? '«Верно!» в ответ на вопрос, а не на фразу ученика' : ''),
  // ответ читают вслух: таблицы, заголовки, длинные списки и простыни не годятся
  r => (/^\s*\|.*\|/m.test(r) || /^#{1,6}\s/m.test(r) ? 'таблица или заголовок (ответ читают вслух)' : ''),
  r => ((r.match(/^\s*[-*•]\s/gm) ?? []).length >= 4 ? 'длинный список (ответ читают вслух)' : ''),
  r => (/читается/i.test(r) ? 'чтение кириллицей (запрещено)' : ''),
  r => (r.length > 800 ? `слишком длинно для голоса (${r.length} знаков)` : ''),
]

export const SCENARIOS = {
  topic: {
    title: 'Новая тема: -는 것 (отвечать, не отказывать, оставаться на теме, коротко)',
    say: [
      'Расскажи мне про ын нын гот. Эту тему я ещё не проходил.',
      'Как это работает с глаголами?',
      'Нет, мы сейчас только это обсуждаем. Скажи, как это будет в прошедшем времени?',
      'Это связано с 거예요, которое мы проходили?',
    ],
    checks: [
      r => (REFUSE.test(r) ? 'отказ вместо ответа («уточни у учителя»)' : ''),
      (r, i) => (i > 0 && /학교|친구|выберешь|какую форму/.test(r) ? 'тянет назад к пройденному' : ''),
      (r, i) => (i > 0 && BACK.test(r) ? 'предлагает уйти с темы ученика' : ''),
      (r, i) => (i === 1 && !/는 것|먹는/.test(r) ? 'нет объяснения глагол + 는 것' : ''),
      (r, i) => (i === 2 && !/(으)ㄴ 것|ㄴ 것|은 것|먹은|간 것/.test(r) ? 'нет прошедшего времени (-(으)ㄴ 것)' : ''),
      (r, i) => (i === 3 && !/것/.test(r) ? 'не связал 거 с 것' : ''),
      (r, i) => (i === 3 && /(하는|한|하는 거|하는 것)[^.\n]{0,30}(делаю|делал)/i.test(r) && /는 거예요/.test(r) ? 'выдаёт -는 거예요 за простое настоящее (это «дело в том, что…»)' : ''),
    ],
  },
  position: {
    title: 'Слова положения (без 와/과, без чтения кириллицей, без «Верно!» на вопрос, иткоиста)',
    say: ['Расскажи мне про слова положения.', 'Как сказать: у меня на столе книга и телефон?', 'Что такое иткоиста?'],
    checks: [(r, i) => (i === 2 && !/있|расслыш|ещё раз/.test(r) ? 'не понял «иткоиста» (있고 있다) и не переспросил' : '')],
  },
  noise: {
    title: 'Шум и обрывки: переспросить «не расслышал», а не здороваться и не выдумывать',
    say: ['Što takoe i takoe ista?', 'эээ ну это мм'],
    checks: [(r, i) => (!LISTEN.test(r) ? `нет переспроса («не расслышал, скажи ещё раз») в реплике ${i + 1}` : '')],
  },
  future: {
    title: 'Будущее время списком (верные формы и переводы)',
    say: ['Дай мне пару начальных глаголов и поставь их в будущее время, просто списком, 2-5 слов.'],
    checks: [r => (!/거예요/.test(r) ? 'нет форм на -(으)ㄹ 거예요' : '')],
  },
}

/** Замечания к одному ответу: общие проверки и проверки сценки. */
export function checkReply(reply, index, scenario) {
  return [...common, ...scenario.checks].map(f => f(reply, index)).filter(Boolean)
}

async function ask(base, key, model, messages) {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const j = await res.json()
  return String(j.choices?.[0]?.message?.content ?? '').trim()
}

async function main() {
  const key = process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY ?? process.env.API_KEY
  const model = process.env.MODEL
  const base = (process.env.BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  if (key && !/^[\x21-\x7e]+$/.test(key)) {
    console.error('OPENAI_API_KEY содержит не латинские символы или пробелы: вставлена заглушка вместо настоящего ключа?')
    process.exit(2)
  }
  // LIST=1: показать названия моделей аккаунта (только имена, ключ не печатается)
  if (key && process.env.LIST) {
    const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000) })
    if (!r.ok) {
      console.error(`HTTP ${r.status}`)
      process.exit(2)
    }
    const ids = ((await r.json()).data ?? []).map(m => m.id).filter(id => /gpt|^o\d/.test(id) && !/realtime|audio|tts|transcribe|image|embedding|moderation|search|codex/.test(id))
    console.log(`Текстовые модели аккаунта (без голосовых):\n${ids.sort().join('\n')}`)
    process.exit(0)
  }
  if (!key || !model) {
    console.error('Нужны ключ (OPENAI_API_KEY или OPENROUTER_API_KEY) и MODEL (текстовая модель, не realtime; список: LIST=1). Ключ не печатается.')
    process.exit(2)
  }
  if (/realtime|audio/.test(model)) {
    console.error('Это голосовая модель: она не отвечает на текстовые запросы. Возьми текстовую (LIST=1 покажет доступные).')
    process.exit(2)
  }
  let buildPrompt
  try {
    ;({ buildPrompt } = await import(fileURLToPath(new URL('../backend/dist/voice/prompt.js', import.meta.url))))
  } catch {
    console.error('Нет backend/dist: сначала npm run server:build')
    process.exit(2)
  }
  const only = process.argv[2]
  const names = only ? [only] : Object.keys(SCENARIOS)
  const system = buildPrompt('free')
  let bad = 0
  console.log(`Модель: ${model}. Инструкция: ${system.length} знаков.\n`)
  for (const name of names) {
    const sc = SCENARIOS[name]
    if (!sc) {
      console.error(`нет сценки «${name}». Есть: ${Object.keys(SCENARIOS).join(', ')}`)
      process.exit(2)
    }
    console.log(`=== ${name}: ${sc.title}`)
    const messages = [{ role: 'system', content: system }]
    for (const [i, say] of sc.say.entries()) {
      messages.push({ role: 'user', content: say })
      const reply = await ask(base, key, model, messages).catch(e => {
        console.error(`\nОшибка запроса: ${e.message}`)
        process.exit(2)
      })
      messages.push({ role: 'assistant', content: reply })
      const flags = checkReply(reply, i, sc)
      bad += flags.length
      console.log(`\n> ${say}\n${reply}`)
      console.log(flags.length ? flags.map(f => `  ✗ ${f}`).join('\n') : '  ✓ без замечаний')
    }
    console.log('')
  }
  console.log(bad ? `Замечаний: ${bad} (проверь глазами: проверки грубые, возможны ложные)` : 'Все проверки пройдены')
  process.exit(bad ? 1 : 0)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main()
