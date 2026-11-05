/** Внешние страницы сервисов стека (поддомены в Caddy сервера, см. docs/docker.md). */
export interface ServiceLink {
  id: string
  name: string
  desc: string
  url: string
  /** как войти */
  access: string
}

export const SERVICE_LINKS: ServiceLink[] = [
  { id: 'grafana', name: 'Grafana', desc: 'Нагрузка сервера, запросы, ошибки и последние копии', url: 'https://grafana.korean.meeymirita.ru/d/korean-ops', access: 'логин admin, пароль GRAFANA_PASSWORD из .env' },
  { id: 'prometheus', name: 'Prometheus', desc: 'Сырые метрики: «Targets» показывает, кто отдаёт данные, запрос вводится на вкладке Query', url: 'https://prometheus.korean.meeymirita.ru/targets', access: 'логин и пароль Caddy (docs/docker.md)' },
  { id: 'search', name: 'Meilisearch', desc: 'Состояние поискового сервиса (адрес /health)', url: 'https://search.korean.meeymirita.ru/health', access: 'логин и пароль Caddy (docs/docker.md)' },
]
