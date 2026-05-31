export type WebhookProvider = 'generic' | 'helena' | 'crm_externo_zapi' | string

export interface WebhookHelenaConfig extends Record<string, unknown> {
  api_token_ref?: string
  from_phone?: string
}

export interface WebhookConfig extends Record<string, unknown> {
  provider?: string
  security_mode?: string
  helena?: WebhookHelenaConfig
}

export interface CanalConfig extends Record<string, unknown> {
  webhook?: WebhookConfig
  evolution?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function cloneCanalConfig(config: CanalConfig | null | undefined): CanalConfig {
  return cloneJson(config ?? {})
}

export function sanitizeCanalConfigForEdit(config: CanalConfig | null | undefined): CanalConfig {
  const cloned = cloneCanalConfig(config)

  if (isRecord(cloned.evolution)) {
    delete cloned.evolution.instance_token
  }

  if (isRecord(cloned.webhook)) {
    delete cloned.webhook.hmac_secret
    if (isRecord(cloned.webhook.helena)) {
      delete cloned.webhook.helena.api_token
      delete cloned.webhook.helena.bearer_token
      delete cloned.webhook.helena.access_token
    }
  }

  return cloned
}

export function getWebhookConfig(config: CanalConfig | null | undefined): WebhookConfig {
  const webhook = config?.webhook
  return isRecord(webhook) ? (webhook as WebhookConfig) : {}
}

export function getWebhookProvider(config: CanalConfig | null | undefined): WebhookProvider {
  const provider = getWebhookConfig(config).provider
  const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : ''
  return normalized || 'generic'
}

export function setWebhookProvider(config: CanalConfig, provider: WebhookProvider): CanalConfig {
  const webhook = getWebhookConfig(config)
  return {
    ...config,
    webhook: {
      ...webhook,
      provider,
      security_mode: provider === 'generic' ? 'hmac' : 'provider_token',
    },
  }
}

export function getWebhookHelenaConfig(config: CanalConfig | null | undefined): WebhookHelenaConfig {
  const webhook = getWebhookConfig(config)
  return isRecord(webhook.helena) ? (webhook.helena as WebhookHelenaConfig) : {}
}

export function setWebhookHelenaField(
  config: CanalConfig,
  key: keyof Pick<WebhookHelenaConfig, 'api_token_ref' | 'from_phone'>,
  value: string,
): CanalConfig {
  const webhook = getWebhookConfig(config)
  const helena = getWebhookHelenaConfig(config)
  return {
    ...config,
    webhook: {
      ...webhook,
      helena: {
        ...helena,
        [key]: value,
      },
    },
  }
}

export function hasWebhookHelenaField(
  config: CanalConfig | null | undefined,
  key: keyof Pick<WebhookHelenaConfig, 'api_token_ref' | 'from_phone'>,
): boolean {
  const value = getWebhookHelenaConfig(config)[key]
  return typeof value === 'string' && value.trim().length > 0
}
