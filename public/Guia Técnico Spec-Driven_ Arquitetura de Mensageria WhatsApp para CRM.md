# Guia Técnico Spec-Driven: Arquitetura de Mensageria WhatsApp para CRM

**Versão**: 1.0  
**Data**: Maio 2026  
**Autor**: Manus AI

---

## Sumário Executivo

Este documento descreve a arquitetura, fluxos de dados e especificações técnicas para implementar uma cópia funcional da mensageria do WhatsApp dentro de um CRM empresarial. O sistema será integrado com a **Meta WhatsApp Cloud API** (oficial) e a **Evolution API** (open-source), permitindo que clientes trafeguem mensagens como um CRM completo, com suporte a múltiplos tipos de mídia (áudio, imagem, documento) e rastreamento de status de entrega.

---

## 1. Arquitetura Geral do Sistema

A arquitetura de mensageria baseada no WhatsApp funciona de forma **assíncrona e orientada a eventos**. O fluxo não é uma conexão direta entre os clientes (como em WebSockets puros P2P), mas sim mediado por servidores centrais através de requisições HTTP e Webhooks.

### 1.1. Componentes Principais

| Componente | Descrição | Responsabilidade |
|---|---|---|
| **Frontend (CRM Client)** | Interface web/mobile do CRM | Exibir conversas, permitir envio de mensagens, notificar agentes |
| **Backend (Seu Servidor CRM)** | Servidor Node.js/Python | Orquestrar fluxos, gerenciar BD, integrar com Evolution/Meta |
| **Evolution API** | Middleware open-source | Padronizar comunicação com Meta Cloud API e Baileys [1] |
| **Meta WhatsApp Cloud API** | Infraestrutura oficial Meta | Enviar/receber mensagens, gerenciar números de negócio [2] |
| **Webhooks** | Mecanismo de eventos | Receber notificações de mensagens e status [3] |
| **Storage (S3/MinIO)** | Armazenamento de arquivos | Guardar áudios, imagens, documentos [1] |
| **Banco de Dados** | PostgreSQL/MySQL | Persistir contatos, conversas, mensagens |
| **Redis** | Cache em memória | Sessões, cache de dados, filas de processamento |

### 1.2. Diagrama de Arquitetura

![Arquitetura do Sistema](https://private-us-east-1.manuscdn.com/sessionFile/AiqlOBrisqyJU39tnrRJWN/sandbox/pu7Jd0TLQ6kSm5gqWdhrCD-images_1778804774800_na1fn_L2hvbWUvdWJ1bnR1L3doYXRzYXBwX2FyY2hpdGVjdHVyZQ.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQWlxbE9CcmlzcXlKVTM5dG5yUkpXTi9zYW5kYm94L3B1N0pkMFRMUTZrU201Z3FXZGhyQ0QtaW1hZ2VzXzE3Nzg4MDQ3NzQ4MDBfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwzZG9ZWFJ6WVhCd1gyRnlZMmhwZEdWamRIVnlaUS5wbmciLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=mnwpOwMLptbSqfLW3ue9fbnNlihHvOWgtAqNgxXARg3A341xhs5OZUbEx0ZtCTxJkKgCR1vxWo86XIMHTcjsC84KdlBud4eTlz12mhvKjQhqaYeHKmJSTBvl9jluFtMLYUTgKJ25edeM1WcEHdNF8vEod~kj6sb9OCriGLJGEJhPW79rFR9InKLJlzh1Y~L-31EknaXlgM-1CuoGFUECKcCxfQjAzNaNiHSl8MrMNRIj6e-5KmV31EzOV87ZqVq4Fd0oXYURFIQ-JArltkE5Py5y219lCTAwg6c4iLDLd2ZVJLKmCrqxKrXMPpXVaTtHx150qdnQ8bb998IYiSmHLQ__)

---

## 2. Fluxos de Mensageria (Envio e Retorno)

### 2.1. Fluxo de Recebimento de Mensagem (Inbound)

Quando um cliente (usuário final) envia uma mensagem para o número do WhatsApp da empresa:

1. O cliente envia a mensagem pelo app do WhatsApp.
2. A Meta recebe a mensagem e dispara um evento (POST HTTP) para o Webhook configurado.
3. A Evolution API processa o payload bruto da Meta, padroniza e envia via Webhook/WebSocket para o seu Backend [1].
4. Seu Backend salva a mensagem no banco de dados, extrai o número do remetente e notifica o Frontend (via WebSocket) para atualizar a tela do agente.
5. O agente recebe uma notificação e pode visualizar a conversa.

**Exemplo de Payload de Recebimento (Meta Cloud API)** [3]:
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "102290129340398",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550783881",
          "phone_number_id": "106540352242922"
        },
        "contacts": [{
          "profile": { "name": "João Silva" },
          "wa_id": "5511987654321"
        }],
        "messages": [{
          "from": "5511987654321",
          "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",
          "timestamp": "1749416383",
          "type": "text",
          "text": { "body": "Olá, preciso de ajuda com meu pedido!" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

**Diagrama de Fluxo Inbound**:

![Fluxo de Recebimento](https://private-us-east-1.manuscdn.com/sessionFile/AiqlOBrisqyJU39tnrRJWN/sandbox/pu7Jd0TLQ6kSm5gqWdhrCD-images_1778804774800_na1fn_L2hvbWUvdWJ1bnR1L3doYXRzYXBwX2luYm91bmRfZmxvdw.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQWlxbE9CcmlzcXlKVTM5dG5yUkpXTi9zYW5kYm94L3B1N0pkMFRMUTZrU201Z3FXZGhyQ0QtaW1hZ2VzXzE3Nzg4MDQ3NzQ4MDBfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwzZG9ZWFJ6WVhCd1gybHVZbTkxYm1SZlpteHZkdy5wbmciLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=l5C96kyIld6zYMYIr5gpD4JZen3Gz0va3KZ6ur3bs5v9f21GRf2UroDJaHsh03gpZllMD1NfDGPeFOMo4B~ialH1PO595Q1TEiOHjtzj-PJhOT5xDQeEqE6kWVOl4JYMlW3jijFmJEiCRt5R3xPNbmhnIuIGJv71~U2U9~Y6fauuM5RBs7FzYdoZScL80l4zKOhNbrOUNyATGacvhp~7ks-zg1zKQc6W8-6HdajDRSGPv4EPe2fgA9j-JUXL~YUkPBKOUYGcgDd9R9kjjO8JPqZ2gxgBxsTgPUjkDbWvFgv9vwHE8-2aN4dEl1~cYFIs2h8H7vPAxKgQLZ8-AGpMNg__)

### 2.2. Fluxo de Envio de Mensagem (Outbound)

Quando um agente do CRM envia uma mensagem para o cliente:

1. O agente digita a mensagem no Frontend e clica em enviar.
2. O Frontend envia a requisição para o Backend.
3. O Backend salva a mensagem como "Pendente" e faz uma requisição POST para a Evolution API ou Meta Cloud API [4].
4. A API da Meta envia a mensagem ao cliente.
5. A Meta dispara Webhooks de status (`sent`, `delivered`, `read`) para confirmar o envio [3].
6. O Backend recebe os status e atualiza o Frontend (os famosos "checks" do WhatsApp: 1 check = sent, 2 checks cinzas = delivered, 2 checks azuis = read).

**Exemplo de Payload de Envio (Meta Cloud API)** [4]:
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "5511987654321",
  "type": "text",
  "text": {
    "preview_url": true,
    "body": "Olá! Seu pedido foi confirmado. Acompanhe em: https://seu-site.com/pedido/123"
  }
}
```

**Diagrama de Fluxo Outbound**:

![Fluxo de Envio](https://private-us-east-1.manuscdn.com/sessionFile/AiqlOBrisqyJU39tnrRJWN/sandbox/pu7Jd0TLQ6kSm5gqWdhrCD-images_1778804774800_na1fn_L2hvbWUvdWJ1bnR1L3doYXRzYXBwX291dGJvdW5kX2Zsb3c.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQWlxbE9CcmlzcXlKVTM5dG5yUkpXTi9zYW5kYm94L3B1N0pkMFRMUTZrU201Z3FXZGhyQ0QtaW1hZ2VzXzE3Nzg4MDQ3NzQ4MDBfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwzZG9ZWFJ6WVhCd1gyOTFkR0p2ZFc1a1gyWnNiM2MucG5nIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=wA5svPuZoKJY8BFslT~9vzLwfFDNylbTXSrfXzfNpY7MYIG8UrCriu8nSMWVFQ7Y7qwVvNClhXWDrYaL~VO6rT870R9WVhFp4wjX9xlOC0CrHdWm~opWgoGNvexJArWDoqeVE4cOFkD~OFW-tuggOkWxotg5-UyT1FcVj-3L0DxWnDSvS5xqs4NBIckiBMfflbwsOGuILP72SW0PPGsb7aAPQVgXcnox39H1-VLPaVP4ThGLKkhxcqlYjrf-s2zfQ1jlkkVL-ldskueRjNmxRpBG~jLUNfh6P6iIc1nX49cQ4EWLBlliYsxY7HbwDKb7QrxLYJUXJxrq1LP5VoE-Jw__)

---

## 3. Estrutura de Dados e Tratamento de Mídia

O WhatsApp suporta vários tipos de mensagens. O tratamento de mídia é um dos pontos mais críticos da arquitetura, pois envolve upload/download de arquivos, conversão de formatos e armazenamento seguro.

### 3.1. Identificação do Usuário

Sempre que uma mensagem é recebida, o payload contém o objeto `contacts` com:

- **`wa_id`**: O número de telefone do usuário com DDI (ex: `5511987654321`). Este é o identificador único e imutável no WhatsApp.
- **`profile.name`**: O nome público configurado pelo usuário no WhatsApp. Pode mudar a qualquer momento.

**Recomendação**: Use `wa_id` como chave primária para identificar contatos, não o nome.

### 3.2. Mensagens de Texto

As mensagens de texto são o formato mais simples. O payload contém o campo `type: "text"` e o objeto `text` com o campo `body` contendo o conteúdo da mensagem [4].

**Estrutura de Armazenamento**:
```json
{
  "id": "uuid",
  "conversation_id": "uuid",
  "whatsapp_message_id": "wamid.HBgLMTY1MDM...",
  "direction": "inbound",
  "type": "text",
  "content": "Olá, preciso de ajuda!",
  "status": "received",
  "timestamp": "2026-05-15T10:30:00Z"
}
```

### 3.3. Mensagens de Áudio (Voice Notes)

**Recebimento**: O payload virá com `type: "audio"`. Em vez do arquivo, a Meta envia um `id` da mídia. Seu backend deve fazer uma requisição GET para a Meta usando esse ID para baixar o arquivo `.ogg` ou `.mp4`, salvar no seu S3/MinIO, e enviar a URL pública para o Frontend.

**Envio**: Você faz upload do áudio para a Meta (obtendo um ID) ou envia um link público. A Meta entregará ao cliente. O formato recomendado é `audio/ogg; codecs=opus`.

**Payload de Recebimento**:
```json
{
  "type": "audio",
  "audio": {
    "mime_type": "audio/ogg; codecs=opus",
    "id": "1234567890"
  }
}
```

**Payload de Envio**:
```json
{
  "type": "audio",
  "audio": {
    "link": "https://seu-s3.com/audio_123.ogg"
  }
}
```

### 3.4. Mensagens de Imagem

**Recebimento**: Payload com `type: "image"`. Funciona igual ao áudio: você recebe um ID, baixa a imagem, salva no seu storage e exibe no CRM.

**Envio**: Você envia a imagem via ID (previamente upada) ou link. Pode incluir uma legenda (`caption`).

**Payload de Envio**:
```json
{
  "type": "image",
  "image": {
    "link": "https://seu-s3.com/imagem.jpg",
    "caption": "Confira nosso novo produto!"
  }
}
```

### 3.5. Mensagens de Documento

**Recebimento**: Payload com `type: "document"`. Contém o ID da mídia, o nome do arquivo (`filename`) e o tipo MIME (ex: `application/pdf`).

**Envio**: Semelhante à imagem, mas o campo é `document`.

**Payload de Recebimento**:
```json
{
  "type": "document",
  "document": {
    "mime_type": "application/pdf",
    "id": "1234567890",
    "filename": "contrato_2026.pdf"
  }
}
```

**Payload de Envio**:
```json
{
  "type": "document",
  "document": {
    "link": "https://seu-s3.com/contrato.pdf",
    "caption": "Contrato para assinatura"
  }
}
```

### 3.6. Fluxo de Tratamento de Mídia

![Fluxo de Mídia](https://private-us-east-1.manuscdn.com/sessionFile/AiqlOBrisqyJU39tnrRJWN/sandbox/pu7Jd0TLQ6kSm5gqWdhrCD-images_1778804774800_na1fn_L2hvbWUvdWJ1bnR1L3doYXRzYXBwX21lZGlhX2Zsb3c.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQWlxbE9CcmlzcXlKVTM5dG5yUkpXTi9zYW5kYm94L3B1N0pkMFRMUTZrU201Z3FXZGhyQ0QtaW1hZ2VzXzE3Nzg4MDQ3NzQ4MDBfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwzZG9ZWFJ6WVhCd1gyMWxaR2xoWDJac2IzYy5wbmciLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=ItIMfdyvQK7-OdAElWuYzqbfH4sSiehBErxPXh-XuGaRgXEHHYfhLt3pbuxZIC95-9ABVa33DDQJh~V2MuSQzeZC9wpfwYgJziTZIRaot-b5OfzwnZfjspw2XQa9LA-n3qlUed3QpwYNd~N3XfSl5gachoDU~kI6qVBNxvkPgFPC4T1BWZp9pujHNJAJ8ZpeqtpYitclbaOv~ttaTv5kqPszidQZLv4UENbVExp8OqX5c6wkH4WYK~2yypRKNv4ir15LG9A8G2v5JJQmSdfs34tUdvVUUroox9dzxwHgkKqH8EPtKITVhrajaRWQBLLsskTseCtWmi2OOY5ThNvloQ__)

---

## 4. Janela de Atendimento (Customer Service Window)

Uma regra fundamental da Meta Cloud API: **Você só pode enviar mensagens livres (Service Messages) dentro de uma janela de 24 horas após a última mensagem recebida do cliente** [4].

| Cenário | Permissão | Custo |
|---|---|---|
| **Dentro da janela (24h)** | Enviar textos, áudios, imagens, PDFs livremente | Cobra por "conversa" (sessão de 24h) |
| **Fora da janela** | Apenas **Template Messages** pré-aprovadas pela Meta | Cobra por "conversa" |
| **Sem janela aberta** | Nenhuma mensagem sem template | N/A |

**Exemplo de Template Message** [4]:
```json
{
  "messaging_product": "whatsapp",
  "to": "5511987654321",
  "type": "template",
  "template": {
    "name": "order_confirmation",
    "language": { "code": "pt_BR" },
    "components": [{
      "type": "body",
      "parameters": [
        { "type": "text", "text": "123" },
        { "type": "text", "text": "João Silva" }
      ]
    }]
  }
}
```

**Recomendação para o Dev**: Implemente uma lógica que verifica a data da última mensagem recebida e alerta o agente se a janela está fechada.

---

## 5. Integração Meta + Evolution API

Para o seu cenário de CRM, a recomendação é usar a **Evolution API** como middleware, pois ela abstrai a complexidade da Meta Cloud API e permite suporte híbrido (oficial e não oficial) [1].

### 5.1. Passos de Integração para o Dev

#### Passo 1: Setup da Evolution API
- Subir uma instância da Evolution API via Docker (Node.js 20+, PostgreSQL/MySQL, Redis) [1].
- Configurar o `.env` com os dados do banco e Redis.
- Exemplo de `.env`:
```bash
DATABASE_PROVIDER=postgresql
DATABASE_URL=postgresql://user:pass@localhost:5432/evolution_db
REDIS_HOST=localhost
REDIS_PORT=6379
API_KEY=sua_chave_api_secreta
```

#### Passo 2: Configuração da Meta
- Criar um App no [Meta for Developers](https://developers.facebook.com/).
- Configurar o WhatsApp Business Account (WABA) e adicionar um número de telefone [2].
- Gerar o Access Token permanente (System User).
- Anotar: `WABA_ID`, `PHONE_NUMBER_ID`, `ACCESS_TOKEN`.

#### Passo 3: Conexão Evolution <-> Meta
- Na Evolution API, criar uma instância do tipo `cloud-api`.
- Inserir o Access Token, Phone Number ID e WABA ID da Meta.
- A Evolution API irá gerar uma URL de Webhook.
- Ir no painel da Meta e cadastrar essa URL de Webhook com o Verify Token gerado pela Evolution.
- Inscrever-se no evento `messages` na Meta [3].

#### Passo 4: Conexão Evolution <-> Seu Backend (CRM)
- No seu Backend, criar um endpoint de Webhook (ex: `POST /api/webhook/evolution`).
- Na Evolution API, configurar o Webhook global apontando para o seu Backend.
- A Evolution API enviará eventos padronizados (ex: `MESSAGES_UPSERT` para novas mensagens, `MESSAGES_UPDATE` para status de entrega).

### 5.2. Exemplo de Integração com Node.js

```javascript
// Backend CRM - Receber eventos da Evolution API
const express = require('express');
const app = express();

app.post('/api/webhook/evolution', async (req, res) => {
  const { event, data } = req.body;
  
  if (event === 'MESSAGES_UPSERT') {
    // Nova mensagem recebida
    const { key, message } = data;
    const phoneNumber = key.remoteJid.split('@')[0];
    const messageId = key.id;
    
    // Salvar no BD
    await saveMessage({
      whatsapp_message_id: messageId,
      phone_number: phoneNumber,
      type: message.conversation ? 'text' : 'media',
      content: message.conversation || message.mediaMessage,
      status: 'received',
      timestamp: new Date(message.messageTimestamp * 1000)
    });
    
    // Notificar Frontend via WebSocket
    io.emit('message:new', { phoneNumber, message });
  }
  
  if (event === 'MESSAGES_UPDATE') {
    // Status de mensagem atualizado
    const { key, status } = data;
    const messageId = key.id;
    
    // Atualizar status no BD
    await updateMessageStatus(messageId, status);
    
    // Notificar Frontend
    io.emit('message:status', { messageId, status });
  }
  
  res.json({ success: true });
});

// Enviar mensagem via Evolution API
app.post('/api/messages/send', async (req, res) => {
  const { phoneNumber, type, content } = req.body;
  
  const payload = {
    number: phoneNumber,
    type: type, // 'text', 'image', 'audio', 'document'
    [type]: { body: content } // ou { link: url }
  };
  
  try {
    const response = await fetch('http://evolution-api:8080/message/sendText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_API_KEY
      },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000);
```

---

## 6. Modelagem de Banco de Dados Sugerida

Para suportar o CRM, seu Dev precisará desta estrutura básica:

### 6.1. Tabela `Contacts` (Contatos)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `phone_number` | VARCHAR(20) | wa_id (ex: 5511987654321) - UNIQUE |
| `name` | VARCHAR(255) | Nome do contato |
| `profile_picture_url` | TEXT | URL da foto de perfil do WhatsApp |
| `created_at` | TIMESTAMP | Data de primeiro contato |
| `updated_at` | TIMESTAMP | Última atualização |

### 6.2. Tabela `Conversations` (Conversas/Tickets)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `contact_id` | UUID | FK para Contacts |
| `agent_id` | UUID | FK para Agents (agente responsável) |
| `status` | ENUM | open, closed, pending |
| `last_message_at` | TIMESTAMP | Última mensagem (inbound ou outbound) |
| `created_at` | TIMESTAMP | Quando a conversa foi aberta |
| `closed_at` | TIMESTAMP | Quando foi fechada (NULL se aberta) |

### 6.3. Tabela `Messages` (Mensagens)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `conversation_id` | UUID | FK para Conversations |
| `whatsapp_message_id` | VARCHAR(255) | wamid da Meta |
| `direction` | ENUM | inbound, outbound |
| `type` | ENUM | text, image, audio, document, location, contact |
| `content` | TEXT | Conteúdo (texto ou URL da mídia) |
| `status` | ENUM | pending, sent, delivered, read, failed |
| `timestamp` | TIMESTAMP | Quando foi enviada/recebida |
| `created_at` | TIMESTAMP | Quando foi salva no BD |

### 6.4. Script SQL de Criação (PostgreSQL)

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  profile_picture_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id),
  agent_id UUID,
  status VARCHAR(20) DEFAULT 'open',
  last_message_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  whatsapp_message_id VARCHAR(255) UNIQUE,
  direction VARCHAR(20) NOT NULL,
  type VARCHAR(50) NOT NULL,
  content TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contacts_phone ON contacts(phone_number);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_agent ON conversations(agent_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_status ON messages(status);
```

---

## 7. Tratamento de Erros e Rate Limiting

### 7.1. Rate Limits da Meta [2]

- **Mensagens por segundo**: 80 por padrão (pode ser aumentado).
- **Mensagens por usuário**: 1 mensagem a cada 6 segundos (0.17 msg/s).
- **Burst**: Até 45 mensagens em 6 segundos, mas depois aguarda equivalente.

**Recomendação**: Implemente fila de mensagens com retry exponencial.

### 7.2. Códigos de Erro Comuns [2]

| Código | Significado | Ação |
|---|---|---|
| 131056 | Pair rate limit excedido | Aguardar 6 segundos antes de enviar novamente |
| 131000 | Número inválido | Validar formato do número |
| 131008 | Janela de 24h fechada | Usar Template Message |
| 100 | Parâmetro inválido | Verificar payload |

---

## 8. Segurança e Compliance

### 8.1. Autenticação e Autorização

- **Evolution API**: Use API Key no header `apikey`.
- **Meta Cloud API**: Use Bearer Token no header `Authorization`.
- **Seu Backend**: Implemente JWT para autenticar agentes do CRM.

### 8.2. Criptografia

- **Em trânsito**: HTTPS/TLS para todas as comunicações.
- **Em repouso**: Criptografe números de telefone no BD (opcional, mas recomendado).
- **Webhooks**: Valide a assinatura do webhook usando o Verify Token [3].

### 8.3. Conformidade com Políticas da Meta

- Obter opt-in explícito do usuário antes de enviar mensagens [2].
- Respeitar preferências de marketing do usuário.
- Não enviar spam ou mensagens não solicitadas.
- Manter qualidade da conta (quality rating) acima de GREEN.

---

## 9. Checklist de Implementação para o Dev

- [ ] **Setup da Evolution API**: Docker, BD, Redis configurados.
- [ ] **Integração Meta**: WABA criada, Access Token gerado, Webhook cadastrado.
- [ ] **Backend CRM**: Endpoints `/api/messages/send`, `/api/webhook/evolution` implementados.
- [ ] **Banco de Dados**: Tabelas `contacts`, `conversations`, `messages` criadas.
- [ ] **Frontend CRM**: Tela de conversas, envio de mensagens, notificações em tempo real.
- [ ] **Tratamento de Mídia**: Upload/download de áudios, imagens, documentos.
- [ ] **Status de Entrega**: Exibição de checks (sent, delivered, read).
- [ ] **Fila de Mensagens**: Retry exponencial para falhas.
- [ ] **Webhooks**: Validação de assinatura, tratamento de duplicatas.
- [ ] **Testes**: Testes unitários, integração e E2E.
- [ ] **Monitoramento**: Logs, alertas para falhas, métricas de performance.
- [ ] **Documentação**: README, diagrama de arquitetura, guia de deployment.

---

## Referências

[1] Evolution API Repository. "Evolution API is an open-source WhatsApp integration API". GitHub. https://github.com/evolution-foundation/evolution-api

[2] Meta for Developers. "About the WhatsApp Business Platform". https://developers.facebook.com/documentation/business-messaging/whatsapp/about-the-platform

[3] Meta for Developers. "Webhooks". https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview

[4] Meta for Developers. "Service messages". https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages

---

**Fim do Documento**
