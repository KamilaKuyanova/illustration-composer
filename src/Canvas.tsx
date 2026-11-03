import { memo, useMemo, useRef, type Dispatch } from 'react'
import { itemTransform, variantOf, type Composition } from './lib/compose'
import type { Library, Variant } from './lib/library'
import { recolor, type Scheme } from './lib/palette'
import type { Action } from './state'

/** Исходные path объекта, перекрашенные по схеме. Содержимое не редактируется. */
export const Art = memo(function Art({ v, scheme }: { v: Variant; scheme: Scheme }) {
  const html = useMemo(() => recolor(v.svg, scheme), [v, scheme])
  return <g dangerouslySetInnerHTML={{ __html: html }} />
})

interface Props {
  lib: Library
  comp: Composition
  selected: string | null
  dispatch: Dispatch<Action>
  svgRef: React.RefObject<SVGSVGElement | null>
}

export function Canvas({ lib, comp, selected, dispatch, svgRef }: Props) {
  const drag = useRef<{ uid: string; dx: number; dy: number } | null>(null)
  const { format, scheme, scale, size } = comp

  const toFrame = (e: React.PointerEvent) => {
    const svg = svgRef.current!
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    return pt.matrixTransform(svg.getScreenCTM()!.inverse())
  }

  const onDown = (e: React.PointerEvent, uid: string, x: number, y: number) => {
    e.stopPropagation()
    const p = toFrame(e)
    drag.current = { uid, dx: x - p.x, dy: y - p.y }
    dispatch({ type: 'select', uid })
    dispatch({ type: 'begin' })
    svgRef.current!.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = toFrame(e)
    dispatch({ type: 'update', uid: d.uid, patch: { x: p.x + d.dx, y: p.y + d.dy } })
  }
  const onUp = () => (drag.current = null)

  return (
    <svg
      ref={svgRef}
      className="canvas"
      viewBox={`0 0 ${format.w} ${format.h}`}
      style={{ aspectRatio: `${format.w} / ${format.h}` }}
      onPointerDown={() => dispatch({ type: 'select', uid: null })}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <rect width={format.w} height={format.h} fill={scheme.light} />
      {comp.items.map(it => {
        const v = variantOf(lib, it, size)
        const sel = it.uid === selected
        return (
          <g
            key={it.uid}
            transform={itemTransform(it, v, scale)}
            className="item"
            onPointerDown={e => onDown(e, it.uid, it.x, it.y)}
          >
            {/* прозрачная область захвата по рамке объекта */}
            <rect x={v.x} y={v.y} width={v.w} height={v.h} fill="transparent" />
            <Art v={v} scheme={scheme} />
            {sel && (
              <rect
                x={v.x}
                y={v.y}
                width={v.w}
                height={v.h}
                fill="none"
                stroke="#2b6ef2"
                strokeWidth={2}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
