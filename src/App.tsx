import { useEffect, useMemo, useState } from 'react'
import Chat from './components/Chat'
import Onboarding from './components/Onboarding'
import type { ChatSettings } from './types'
import { clearSettings, loadSettings, saveSettings } from './utils/storage'

export default function App() {
  const saved = useMemo(() => loadSettings(), [])
  const [settings, setSettings] = useState<ChatSettings | null>(saved)
  const [autoLoading, setAutoLoading] = useState(false)
  const [autoError, setAutoError] = useState<string | null>(null)

  function clearThreadIdFromLocation() {
    try {
      if (typeof window === 'undefined') return
      const url = new URL(window.location.href)
      if (url.searchParams.has('thread_id')) url.searchParams.delete('thread_id')
      if (url.searchParams.has('threadId')) url.searchParams.delete('threadId')
      window.history.replaceState({}, '', url.toString())
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrapFromThreadIdIfNeeded() {
      try {
        if (settings) return
        if (typeof window === 'undefined') return

        const url = new URL(window.location.href)
        const tid = (url.searchParams.get('thread_id') || url.searchParams.get('threadId') || '').trim()
        if (!tid) return

        setAutoLoading(true)
        setAutoError(null)

        // Sem settings salvas, assumimos DEV (proxy do Vite) para buscar contexto.
        const base = ''

        const tResp = await fetch(`${base}/v1/threads/${encodeURIComponent(tid)}/messages`)
        const tText = await tResp.text()
        if (!tResp.ok) throw new Error(`HTTP ${tResp.status}: ${tText}`)
        const tJson = tText ? (JSON.parse(tText) as any) : null
        const thread = tJson?.thread
        const companyId = (thread?.company_id || '').trim()
        const customerId = (thread?.customer_id || '').trim()
        if (!companyId || !customerId) {
          throw new Error('Não foi possível resolver company_id/customer_id a partir da thread')
        }

        const cResp = await fetch(`${base}/v1/customers/${encodeURIComponent(customerId)}`)
        const cText = await cResp.text()
        if (!cResp.ok) throw new Error(`HTTP ${cResp.status}: ${cText}`)
        const cJson = cText ? (JSON.parse(cText) as any) : null
        const phoneRaw = (cJson?.phone || cJson?.customer?.phone || '').toString()
        const customerPhone = phoneRaw.replace(/[^\d]/g, '')
        const customerName = (cJson?.name || cJson?.customer?.name || '').toString().trim() || undefined

        const next: ChatSettings = {
          companyId,
          customerPhone,
          customerName,
          apiBaseUrl: '',
        }

        if (cancelled) return
        saveSettings(next)
        setSettings(next)
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Falha ao abrir thread pela URL'
        setAutoError(msg)
      } finally {
        if (!cancelled) setAutoLoading(false)
      }
    }

    void bootstrapFromThreadIdIfNeeded()
    return () => {
      cancelled = true
    }
  }, [settings])

  return (
    <div className="container">
      <div className="card">
        <div className="header">
          <h1>ChatWeb (teste do ai-framework)</h1>
        </div>

        {settings ? (
          <Chat
            settings={settings}
            onReset={() => {
              clearSettings()
              setSettings(null)
              setAutoError(null)
              clearThreadIdFromLocation()
            }}
          />
        ) : (
          <>
            {autoLoading ? (
              <div className="content">
                <div className="helper">Abrindo thread pela URL…</div>
              </div>
            ) : null}
            {autoError ? (
              <div className="content">
                <div className="error">{autoError}</div>
              </div>
            ) : null}
            {!autoLoading ? (
              <Onboarding
                initial={saved}
                onStart={(s) => {
                  saveSettings(s)
                  setSettings(s)
                }}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

