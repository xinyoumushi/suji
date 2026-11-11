export default function Highlight({ text, terms }: { text: string; terms: string[] }): JSX.Element {
  const clean = (terms ?? []).filter(Boolean)
  if (!clean.length || !text) return <>{text}</>
  const pattern = clean
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
    .join('|')
  if (!pattern) return <>{text}</>
  const regex = new RegExp(`(${pattern})`, 'gi')
  const parts = text.split(regex)
  const lower = clean.map((t) => t.toLowerCase())
  return (
    <>
      {parts.map((part, index) =>
        lower.includes(part.toLowerCase()) ? (
          <mark key={index} className="hl">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  )
}
