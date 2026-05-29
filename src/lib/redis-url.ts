export function resolveRedisUrl(component: string): string {
  const explicitUrl = process.env.REDIS_URL?.trim()
  if (explicitUrl) return explicitUrl

  const password = process.env.REDIS_PASSWORD?.trim()
  if (password) {
    return `redis://:${encodeURIComponent(password)}@redis:6379/0`
  }

  throw new Error(`${component}: configuração Redis ausente. Defina REDIS_URL ou REDIS_PASSWORD.`)
}
