import { useMemo, useState } from 'react'
import Chat from './components/Chat'
import Onboarding from './components/Onboarding'
import type { ChatSettings } from './types'
import { clearSettings, loadSettings, saveSettings } from './utils/storage'

export default function App() {
  const saved = useMemo(() => loadSettings(), [])
  const [settings, setSettings] = useState<ChatSettings | null>(saved)

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
            }}
          />
        ) : (
          <Onboarding
            initial={saved}
            onStart={(s) => {
              saveSettings(s)
              setSettings(s)
            }}
          />
        )}
      </div>
    </div>
  )
}

