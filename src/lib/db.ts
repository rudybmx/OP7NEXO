import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL

// Cliente postgres para queries - lazy init pra nao falhar no build
let _sql: ReturnType<typeof postgres> | null = null

export function getSql() {
  if (!_sql) {
    if (!connectionString) {
      throw new Error('DATABASE_URL nao configurada')
    }
    _sql = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    })
  }
  return _sql
}

// Exporta proxy pra usar como sql`...`
export const sql = new Proxy({} as ReturnType<typeof postgres>, {
  get(_, prop) {
    const client = getSql()
    return (client as any)[prop]
  },
})

export async function healthCheck(): Promise<boolean> {
  try {
    const client = getSql()
    const result = await client`SELECT 1 as ok`
    return result[0]?.ok === 1
  } catch {
    return false
  }
}
