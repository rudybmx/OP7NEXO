import { Client as MinioClient } from 'minio'

// ---------------------------------------------------------------------------
// Configuração do cliente MinIO (BMK Marketing)
// ---------------------------------------------------------------------------
// As credenciais são injetadas via ambiente em produção, mas mantemos
// valores padrão para desenvolvimento local com Docker Compose.
// ---------------------------------------------------------------------------

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || '10.0.1.35'
const MINIO_PORT = Number(process.env.MINIO_PORT) || 9000
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'op7-nexo_admin'
const MINIO_SECRET_KEY =
  process.env.MINIO_SECRET_KEY || 'J2U9V0Li1JCeMdVkVMQ75qyE76mMfogUExnpYXbG17o='
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true'
const MINIO_BUCKET = process.env.MINIO_BUCKET || 'whatsapp-media'

// ---------------------------------------------------------------------------
// Singleton do cliente MinIO (lazy init)
// ---------------------------------------------------------------------------
let _minioClient: MinioClient | null = null

export function getMinioClient(): MinioClient {
  if (!_minioClient) {
    _minioClient = new MinioClient({
      endPoint: MINIO_ENDPOINT,
      port: MINIO_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
    })
  }
  return _minioClient
}

// ---------------------------------------------------------------------------
// Garante que o bucket existe (cria se necessário)
// ---------------------------------------------------------------------------
let _bucketEnsured = false

export async function ensureBucket(): Promise<void> {
  if (_bucketEnsured) return

  const client = getMinioClient()
  const exists = await client.bucketExists(MINIO_BUCKET)

  if (!exists) {
    await client.makeBucket(MINIO_BUCKET, 'us-east-1')
    console.log(`[MinIO] Bucket "${MINIO_BUCKET}" criado com sucesso.`)
  }

  _bucketEnsured = true
}

// ---------------------------------------------------------------------------
// Retorna o nome do bucket configurado
// ---------------------------------------------------------------------------
export function getBucketName(): string {
  return MINIO_BUCKET
}

// ---------------------------------------------------------------------------
// Gera a URL pública de um objeto no MinIO
// ---------------------------------------------------------------------------
export function getPublicUrl(objectName: string): string {
  const protocol = MINIO_USE_SSL ? 'https' : 'http'
  return `${protocol}://${MINIO_ENDPOINT}:${MINIO_PORT}/${MINIO_BUCKET}/${objectName}`
}
