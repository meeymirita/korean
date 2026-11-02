/** Монетки Юны: награды. Те же числа лежат на сервере (`COINS` в backend/src/progress/progress.service.ts): менять в обоих. */
export const COIN_RULES = {
  answer: 2, // за верный ответ
  dayCap: 300, // потолок монеток за ответы в день
  combo: { 5: 3, 10: 7 } as Record<number, number>, // за 5 и 10 верных подряд (один раз за серию)
  round: 5, // за завершённую серию заданий
  gift: 100, // подарок при первом запуске
  wrongXp: 3, // ошибка отнимает очки, но не ниже начала текущего уровня
}

/** Следующая награда за серию: сколько ещё верных подряд и сколько монеток. */
export function nextCombo(combo: number): { left: number; coins: number } | null {
  const at = Object.keys(COIN_RULES.combo).map(Number).sort((a, b) => a - b).find(n => n > combo)
  return at ? { left: at - combo, coins: COIN_RULES.combo[at]! } : null
}
