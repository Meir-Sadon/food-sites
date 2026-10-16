import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapZone {
  name: string
  isBlocked: boolean
  polygon: [number, number][]
}

const ISRAEL_CENTER: [number, number] = [31.5, 34.9]

/**
 * A map of Israel (OpenStreetMap) with every zone drawn on it. Clicking the map adds a corner to the selected zone, and
 * the selected zone's corners can be dragged. Colours come from the site's theme through the CSS classes in index.css.
 */
export default function ZonesMap({
  zones,
  selected,
  onAddPoint,
  onMovePoint,
}: {
  zones: MapZone[]
  selected: number | null
  onAddPoint: (point: [number, number]) => void
  onMovePoint: (index: number, point: [number, number]) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const fitted = useRef(false)
  // The latest callbacks, so the map is created once and never re-bound.
  const handlers = useRef({ onAddPoint, onMovePoint, selected })
  useEffect(() => {
    handlers.current = { onAddPoint, onMovePoint, selected }
  })

  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { center: ISRAEL_CENTER, zoom: 8 })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance)
    instance.on('click', (e: L.LeafletMouseEvent) => {
      if (handlers.current.selected !== null) handlers.current.onAddPoint([e.latlng.lat, e.latlng.lng])
    })
    layer.current = L.layerGroup().addTo(instance)
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const group = layer.current
    if (!group || !map.current) return
    group.clearLayers()
    zones.forEach((zone, index) => {
      if (zone.polygon.length === 0) return
      const chosen = index === selected
      const className = `zones-map__zone${zone.isBlocked ? ' zones-map__zone--blocked' : ''}${chosen ? ' zones-map__zone--selected' : ''}`
      const shape = zone.polygon.length >= 3 ? L.polygon(zone.polygon, { className }) : L.polyline(zone.polygon, { className })
      shape.bindTooltip(zone.name || '—', { sticky: true })
      group.addLayer(shape)
      if (chosen) {
        zone.polygon.forEach((point, pointIndex) => {
          const marker = L.marker(point, {
            draggable: true,
            icon: L.divIcon({ className: 'zones-map__corner', iconSize: [16, 16] }),
          })
          marker.on('dragend', () => {
            const { lat, lng } = marker.getLatLng()
            handlers.current.onMovePoint(pointIndex, [lat, lng])
          })
          group.addLayer(marker)
        })
      }
    })
    // Show every zone once, when the saved ones arrive.
    if (!fitted.current) {
      const points = zones.flatMap((z) => z.polygon)
      if (points.length > 0) {
        map.current.fitBounds(L.latLngBounds(points), { padding: [24, 24] })
        fitted.current = true
      }
    }
  }, [zones, selected])

  return <div ref={container} className="zones-map" role="application" />
}
