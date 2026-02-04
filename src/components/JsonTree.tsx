import { useMemo, useState } from 'react'

type Props = {
  value: unknown
  defaultExpandedDepth?: number
}

type NodeProps = {
  value: unknown
  depth: number
  defaultExpandedDepth: number
  keyLabel?: string
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function sortKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b))
}

function renderPrimitive(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v)
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function getNamedArrayLabel(item: unknown, index: number): string {
  // Prefer "name" when item is an object with { name: string }
  try {
    if (isPlainObject(item)) {
      const nm = item.name
      if (typeof nm === 'string' && nm.trim()) return `[${nm.trim()}]`
      const id = item.id
      if (typeof id === 'string' && id.trim()) return `[${id.trim()}]`
    }
  } catch {
    // ignore
  }
  return `[${index}]`
}

function Node({ value, depth, defaultExpandedDepth, keyLabel }: NodeProps) {
  const expandable = Array.isArray(value) || isPlainObject(value)
  const [open, setOpen] = useState(() => depth < defaultExpandedDepth)

  const indentStyle = useMemo(() => ({ paddingLeft: `${depth * 14}px` }), [depth])

  // Primitive line
  if (!expandable) {
    return (
      <div className="jtLine" style={indentStyle}>
        <span className="jtSpacer" />
        {keyLabel ? (
          <>
            <span className="jtKey">{keyLabel}</span>
            <span className="jtPunct">: </span>
          </>
        ) : null}
        <span className="jtValue">{renderPrimitive(value)}</span>
      </div>
    )
  }

  const isArr = Array.isArray(value)
  const openCh = isArr ? '[' : '{'
  const closeCh = isArr ? ']' : '}'
  const count = isArr ? value.length : Object.keys(value).length

  // Collapsed line
  if (!open) {
    return (
      <div className="jtLine" style={indentStyle}>
        <button
          className="jtToggleInline"
          onClick={() => setOpen(true)}
          aria-label="Expandir"
          title="Expandir"
        >
          ▸
        </button>
        {keyLabel ? (
          <>
            <span className="jtKey">{keyLabel}</span>
            <span className="jtPunct">: </span>
          </>
        ) : null}
        <span className="jtValue">
          {openCh}…{closeCh} <span className="jtDim">({count})</span>
        </span>
      </div>
    )
  }

  // Expanded
  const entries: Array<{ key: string; value: unknown; label: string }> = isArr
    ? (value as unknown[]).map((v, i) => ({ key: String(i), value: v, label: getNamedArrayLabel(v, i) }))
    : sortKeys(Object.keys(value as Record<string, unknown>)).map((k) => ({
        key: k,
        value: (value as any)[k],
        label: k,
      }))

  return (
    <div className="jtBlock">
      <div className="jtLine" style={indentStyle}>
        <button
          className="jtToggleInline"
          onClick={() => setOpen(false)}
          aria-label="Recolher"
          title="Recolher"
        >
          ▾
        </button>
        {keyLabel ? (
          <>
            <span className="jtKey">{keyLabel}</span>
            <span className="jtPunct">: </span>
          </>
        ) : null}
        <span className="jtValue">{openCh}</span>
      </div>

      {entries.map((e) => (
        <Node
          key={`${depth}-${e.key}`}
          value={e.value}
          depth={depth + 1}
          defaultExpandedDepth={defaultExpandedDepth}
          keyLabel={e.label}
        />
      ))}

      <div className="jtLine" style={indentStyle}>
        <span className="jtSpacer" />
        <span className="jtValue">{closeCh}</span>
      </div>
    </div>
  )
}

export default function JsonTree({ value, defaultExpandedDepth = 2 }: Props) {
  return <Node value={value} depth={0} defaultExpandedDepth={defaultExpandedDepth} />
}

