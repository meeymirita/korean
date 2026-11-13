# Тренажёры: описания и правила работы с ними

В этой папке по одному файлу на каждый тренажёр и режим. Они написаны по коду (на 2026-11-08, обновлены 2026-11-09: тексты в играх, длина «5 минут», фразы и диктовка, наборы «Найди пары»), а не по памяти.
Каталог одной таблицей лежит в `docs/games-catalog.md`; здесь подробности: файлы, как собирается набор, что сохраняется, что пишется в прогресс.

## Правило работы (решение владельца, 2026-11-08)

Просьба владельца «добавь/измени что-то в таком-то режиме» делается так:
1. **Сначала изучить**: прочитать файл описания режима из этой папки, потом файлы режима из раздела «Файлы» (экран, данные, `lib`), а не только то место, о котором просят. Без этого править нельзя.
2. Если описание расходится с кодом, верить коду и сразу поправить описание.
3. После правки **обновить файл описания** (и строку в `docs/games-catalog.md`, если изменилось то, что в ней сказано; для движка «Хлебушек» ещё `docs/game.md`).
4. Новый тренажёр: файл в этой папке по шаблону ниже, строка в таблице ниже, строка в `docs/games-catalog.md`.

## Список

| Файл | Тренажёр | id / адрес | Экран |
|---|---|---|---|
| [`bread-game.md`](bread-game.md) | «Хлебушек»: игра на 24 режима, в 21 из них уровни-тексты | `/game/home?game=<id режима>` | `GameHomeView.vue` + `src/game/` |
| [`match.md`](match.md) | Найди пару | `?game=match` (`&mode=match`) | `TrainersView.vue` → `MatchGame.vue` |
| [`typing.md`](typing.md) | Напиши перевод | `?game=match&mode=type` | `TrainersView.vue` → `TypingQuiz.vue` |
| [`quick.md`](quick.md) | 5 минут | `?game=quick` | `QuickView.vue` |
| [`particles.md`](particles.md) | Частицы и окончания | `?game=particles` | `ParticlesView.vue` |
| [`pairs.md`](pairs.md) | Похожие, но разные | `?game=pairs` | `PairsView.vue` |
| [`translate.md`](translate.md) | Переведи предложение | `?game=translate` | `TranslateView.vue` |
| [`explain.md`](explain.md) | Переведи и объясни | `?game=explain` | `ExplainTranslateView.vue` |
| [`speech.md`](speech.md) | Определи часть речи | `?game=speech` | `PartOfSpeechView.vue` |
| [`chain.md`](chain.md) | Цепочки слов | `?game=chain` | `ChainView.vue` |
| [`rule.md`](rule.md) | Потренировать правило | `?game=rule&g=<id карточки>` | `RuleView.vue` |
| [`syllables.md`](syllables.md) | Собери по слогам | `?game=syllables` | `SyllablesView.vue` |
| [`keyboard.md`](keyboard.md) | Печать на корейском | `?game=keyboard` | `KeyboardView.vue` |
| [`mistakes.md`](mistakes.md) | Мои ошибки | `/korean/mistakes` | `MistakesView.vue` |

Все пути `src/...` считаются от `frontend/`; все адреса `?game=` это `/game/home?game=...`.

## Что общее у тренажёров

**Серия «вопрос → варианты»** (`quick`, `particles`, `pairs`, `translate`, `rule`, `mistakes`) собирается из `Task` (`data/korean/tasks.ts`) и показывается одним компонентом `components/korean/TaskSession.vue`.
Новый режим такого вида строй на нём, не пиши цикл заданий заново. У `Task`: `id, kind, title, prompt, hint?, options, answer, word?, gram?, sentence?, pairOf?`.
`word` нужен для прогресса по слову, `gram` для разбора ошибки, `sentence` включает разбор предложения после ответа, `pairOf` объясняет, чему соответствовал неверный вариант.
С 2026-11-08 `sentence` заполнен у всех заданий со словом (`tr`, `back`, `read`, `blank` берут пример слова `d.s`; «Похожие» тоже), поэтому после ответа во всех этих сериях виден разбор «Как собрано». Пропуск `＿＿＿` в `prompt` заполняется верным вариантом после ответа. `TaskSession` сам умеет: клавиши 1–9 и Enter, перетаскивание варианта на вопрос, предметы магазина (подсказка, 50/50, повтор, второй шанс; только владельцу), секундомер, итог со списком ошибок, отметку «как прошло». На итоге есть «Ещё раз ошибки этой серии» (только задания, оставшиеся неверными, список показан выше; итог и монетки считаются от их числа, монетки только от 3 заданий; кнопки нет, если ошибок нет; тест `frontend/test/task-retry-missed.spec.ts`).
Свои компоненты вне `TaskSession`: `match`, `typing`, `syllables`, `keyboard`, движок «Хлебушек».

**Что уходит в прогресс** (`stores/progress.ts`): `progress.record({ word, ok, source, mode, detail? })`: очки слова (+1/−1, выучено на 5, `KNOWN_STREAK`), опыт, ответ в историю кабинета и отчёт по режиму (`mode`).
Монетки за серию: `progress.roundDone(id, size, right)` (серия от 3 заданий, один раз на `id`); вызывает только `TaskSession`, поэтому у `match`, `typing`, `syllables`, `keyboard` и «Хлебушка» монеток за серию нет, а предметы магазина там не работают (`docs/shop.md`).
Гость ничего не сохраняет (`record` и `roundDone` его не пишут).

**Регистрация нового тренажёра** (чтобы он появился): id в `TOOL_IDS` и карточка в `data/games.ts`; компонент в `TOOLS` в `views/GameHomeView.vue`; страница в `data/korean/sections.ts`;
строка в шторке `data/guide.ts`; запись в `data/history.ts`; тест в `tests/`. Состояние, которое должно пережить обновление, держи в `usePersisted` (sessionStorage) или `?параметре` (`useQueryParam`).
Код выполняется и на сервере (Nuxt SSR): `window`, `localStorage` только в `onMounted`; случайное на открытых страницах только от зерна. Подробности правил: `CLAUDE.md`.

## Шаблон файла описания

```
# Название (id)
Что это · Где открыть · Файлы · Как собирается набор · Состояние и хранение · Прогресс и награды · Тесты · Как расширять · Ограничения и подводные камни
```
