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
