// Avatares de WhatsApp vêm de CDNs efêmeros (pps.whatsapp.net, fbcdn, fbsbx) cujas
// URLs assinadas EXPIRAM — o browser então recebe HTTP 403 e polui o console. O
// backend re-hospeda essas fotos no nosso storage (/meta/storage/whatsapp-avatars/...);
// enquanto a URL ainda é a crua do CDN, não adianta tentar renderizá-la.
const EPHEMERAL_AVATAR_HOSTS = ['whatsapp.net', 'fbcdn', 'fbsbx']

/**
 * Resolve a URL de avatar para uso em `<img>`/background.
 *
 * Devolve a URL quando é segura de renderizar (nosso storage persistente) ou
 * `undefined` quando é uma URL crua de CDN efêmero (que expira → 403). O
 * `undefined` faz o componente cair no fallback de iniciais SEM disparar a
 * requisição que geraria o erro no console.
 */
export function resolveAvatarSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  const lower = url.toLowerCase()
  if (EPHEMERAL_AVATAR_HOSTS.some(host => lower.includes(host))) return undefined
  return url
}
