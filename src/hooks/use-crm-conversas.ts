import {
  MENSAGENS_MOCK,
  CONTATOS_MOCK,
  CONVERSAS_MOCK,
  USUARIO_ATUAL_MOCK,
} from '@/lib/mock-crm'

export function useCrmConversas() {
  return {
    mensagens: MENSAGENS_MOCK,
    contatos: CONTATOS_MOCK,
    conversas: CONVERSAS_MOCK,
    usuarioAtual: USUARIO_ATUAL_MOCK,
  }
}
