import { useContext } from 'react'
import { highlightRanges } from './search'
import { SearchQueryContext } from './searchQuery'

/** Text with the searched words wrapped in a yellow `<mark>`; plain text when nothing is being searched. */
export function Highlighted({ text }: { text: string }) {
  const query = useContext(SearchQueryContext)
  const ranges = query ? highlightRanges(text, query) : []
  if (ranges.length === 0) return <>{text}</>
  const parts: React.ReactNode[] = []
  let at = 0
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start))
    parts.push(<mark key={start}>{text.slice(start, end)}</mark>)
    at = end
  }
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}
