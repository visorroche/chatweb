export type ChatSettings = {
  companyId: string
  customerPhone: string
  customerName?: string
  /**
   * Opcional. Se vazio, usa proxy do Vite (recomendado).
   * Ex: http://localhost:8000
   */
  apiBaseUrl?: string
}

export type ChatRole = 'user' | 'assistant' | 'system'

export type ApiTrace = {
  request: {
    url: string
    method: 'POST'
    payload: Record<string, unknown>
  }
  response: {
    status: number
    ok: boolean
    /**
     * JSON do backend quando parseável; caso contrário `null`.
     */
    json: unknown | null
    /**
     * Texto bruto quando a resposta não for JSON (ou em caso de erro de parsing).
     */
    rawText: string | null
  }
  timingMs: number
}

export type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  createdAt: number
  trace?: ApiTrace
}

export type DisparoAnswerItem =
  | {
      type: 'text'
      message: string
    }
  | {
      type: string
      [key: string]: unknown
    }

export type AiFrameworkResponse = {
  success: boolean
  provider: string
  data?: {
    assistant_response?: {
      answer?: unknown
      actions?: unknown
      conversation_id?: unknown
      success?: unknown
      metadata?: unknown
    }
    disparo?: {
      answer?: unknown
      close?: unknown
      next_step?: unknown
      next_assistant?: unknown
    }
    [key: string]: unknown
  }
  error?: string
  platform_response?: unknown
}

