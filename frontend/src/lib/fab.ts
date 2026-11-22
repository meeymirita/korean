/**
 * Закреплённые кнопки плеера и голоса (правый верхний угол): где они показываются.
 * Нет на `/` (решение владельца 2026-11-17), `/growth` (2026-11-19), `/about`, `/history`, `/dict*` (2026-11-22); в разделе `/korean` и играх `/game` они стоят в шапке.
 */
const NO_FAB = ['/about', '/history', '/dict', '/growth', '/korean', '/game']
export const showFixedFab = (path: string) => path !== '/' && !NO_FAB.some(p => path === p || path.startsWith(p + '/'))
