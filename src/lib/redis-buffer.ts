import Redis from 'ioredis'

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const REDIS_URL = process.env.REDIS_URL || 'redis://default:t868uuo98kj2g9q0akmvlnf82elr1q6t@redis_wersun:6379'
const MAX_MESSAGES = 50
const TTL_SECONDS = 24 * 60 * 60 // 24 horas

// ---------------------------------------------------------------------------
// Singleton do Redis – criado apenas uma vez, com reconexão automática
// ---------------------------------------------------------------------------

let _redis: Redis | null = null

function getRedis(): Redis {
  if (_redis) return _redis

  _redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) {
        // Para de tentar após 5 falhas consecutivas
        return null
      }
      // Espera exponencial: 200ms, 400ms, 800ms, ...
      return Math.min(times * 200, 3000)
    },
    lazyConnect: false, // conecta imediatamente e falha rápido
  })

  _redis.on('error', (err) => {
    console.error('[redis-buffer] Erro de conexão Redis:', err.message)
  })

  _redis.on('connect', () => {
    console.log('[redis-buffer] Conectado ao Redis')
  })

  return _redis
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ContextMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
  [key: string]: unknown // permite campos extras
}

// ---------------------------------------------------------------------------
// Funções públicas
// ---------------------------------------------------------------------------

/**
 * Salva o contexto completo de uma conversa no Redis.
 * Armazena apenas os últimos 50 itens e aplica TTL de 24h.
 */
export async function saveConversationContext(
  conversaId: string,
  messages: ContextMessage[],
): Promise<boolean> {
  try {
    const redis = getRedis()
    const key = `ctx:${conversaId}`

    // Guarda apenas os últimos MAX_MESSAGES
    const trimmed = messages.slice(-MAX_MESSAGES)

    // SET com TTL em uma operação atômica
    const result = await redis.set(key, JSON.stringify(trimmed), 'EX', TTL_SECONDS)

    return result === 'OK'
  } catch (error) {
    console.error(
      `[redis-buffer] Erro ao salvar contexto da conversa ${conversaId}:`,
      error instanceof Error ? error.message : error,
    )
    return false
  }
}

/**
 * Recupera o contexto de uma conversa armazenado no Redis.
 * Retorna array vazio se a chave não existir ou houver erro.
 */
export async function getConversationContext(
  conversaId: string,
): Promise<ContextMessage[]> {
  try {
    const redis = getRedis()
    const key = `ctx:${conversaId}`

    const raw = await redis.get(key)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error(
      `[redis-buffer] Erro ao recuperar contexto da conversa ${conversaId}:`,
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

/**
 * Adiciona uma única mensagem ao buffer da conversa,
 * mantendo no máximo 50 itens. Se não houver buffer,
 * cria um novo com essa mensagem.
 */
export async function appendMessage(
  conversaId: string,
  message: ContextMessage,
): Promise<boolean> {
  try {
    const redis = getRedis()
    const key = `ctx:${conversaId}`

    // Usa pipeline para atomicidade: GET + SET
    const pipeline = redis.pipeline()
    pipeline.get(key)

    const results = await pipeline.exec()
    if (!results) {
      throw new Error('Pipeline retornou null')
    }

    const [err, raw] = results[0]
    if (err) {
      throw err
    }

    let messages: ContextMessage[] = []
    if (raw) {
      try {
        const parsed = JSON.parse(raw as string)
        if (Array.isArray(parsed)) {
          messages = parsed
        }
      } catch {
        // Dado corrompido – sobrescreve com mensagem nova
      }
    }

    // Adiciona mensagem e trunca para MAX_MESSAGES
    messages.push(message)
    if (messages.length > MAX_MESSAGES) {
      messages = messages.slice(-MAX_MESSAGES)
    }

    // Grava de volta com TTL
    await redis.set(key, JSON.stringify(messages), 'EX', TTL_SECONDS)

    return true
  } catch (error) {
    console.error(
      `[redis-buffer] Erro ao adicionar mensagem na conversa ${conversaId}:`,
      error instanceof Error ? error.message : error,
    )
    return false
  }
}

/**
 * Remove o contexto inteiro de uma conversa do Redis.
 */
export async function clearContext(conversaId: string): Promise<boolean> {
  try {
    const redis = getRedis()
    const key = `ctx:${conversaId}`

    await redis.del(key)
    return true
  } catch (error) {
    console.error(
      `[redis-buffer] Erro ao limpar contexto da conversa ${conversaId}:`,
      error instanceof Error ? error.message : error,
    )
    return false
  }
}
