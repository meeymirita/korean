/** Состояние контейнера из закрытого API личного кабинета. */
export interface OpsServiceState {
  name: string
  container?: string
  state: string
  health: string
  status: string
  createdAt?: string
  ip?: string | null
  replicas: number
  /** живёт вне Docker (Caddy сервера): журнала контейнера у него нет */
  external?: boolean
}

export interface OpsServicesReply {
  project: string
  checkedAt: string
  services: OpsServiceState[]
}

export interface OpsLogsReply {
  service: string
  container: string
  tail: number
  logs: string
}
