## ChatWeb (front básico para testar o `ai-framework`)

Front-end simples (Vite + React + TypeScript) com:

- **Tela de abertura**: informa `companyId`, `customerPhone` e (opcional) `customerName`.
- **Tela de conversa**: lista de mensagens + input no rodapé para enviar texto e ver a resposta da IA.

Ele integra com o backend do `ai-framework` usando o provider existente **`simple`**:

- `POST /v1/messages/simple/{company_id}`
- Body mínimo: `{ "message": "...", "customer_phone": "..." }`

### Requisitos

- Node.js 18+ (recomendado)
- Backend `ai-framework` rodando (por padrão em `http://localhost:8000`)

### Como rodar

No diretório `chatweb/`:

```bash
npm install
npm run dev
```

Abra o navegador no endereço impresso pelo Vite (normalmente `http://localhost:5173`).

### Proxy (evita CORS no dev)

O projeto já vem com proxy no `vite.config.ts`:

- chamadas do front para `/v1/...` são encaminhadas para `http://localhost:8000`

Se seu backend estiver em outra URL/porta, ajuste o `target` em `vite.config.ts`.

### Fluxo de uso

1. Preencha o formulário inicial:
   - **Company ID**: UUID da empresa no seu banco
   - **Telefone**: use somente dígitos (ex: `5511999999999`)
   - **Nome (opcional)**: ajuda a criar o customer no provider `simple`
2. Clique em **Iniciar conversa**
3. Envie mensagens no chat (Enter envia, Shift+Enter quebra linha)

### Observações

- O provider `simple` cria o customer automaticamente se não existir (por `customer_phone`).
- A UI tenta renderizar a resposta usando `data.disparo.answer` (array normalizado) e faz fallback para `data.assistant_response.answer`.

