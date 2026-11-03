import type { LibObject, Library, Variant } from './library'

const NS = 'http://www.w3.org/2000/svg'
const SKIP = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'filter', 'symbol'])
const DANGEROUS = 'script, foreignObject, iframe, object, embed'

/** Убирает из загруженного файла всё, что может исполнять код. */
function sanitize(root: Element) {
  root.querySelectorAll(DANGEROUS).forEach(n => n.remove())
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name)
    }
  }
}

const tagsOf = (name: string) => name.toLowerCase().split(/[^a-zа-яё0-9]+/).filter(w => w.length > 1)

/**
 * Загрузка своей SVG-библиотеки: каждый верхний элемент (или группа внутри единственной обёртки)
 * становится объектом. Разметка не меняется. Состояния «главный/фоновый» и размеры S/L у такого
 * объекта одинаковы, так как в загруженном файле их нет.
 */
export function parseSvgLibrary(text: string, fileName: string, startIndex = 0): LibObject[] {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const root = doc.documentElement
  if (root.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error(`«${fileName}» не похож на SVG.`)
  sanitize(root)

  const defs = [...root.querySelectorAll('defs')].map(d => new XMLSerializer().serializeToString(d)).join('')
  const styles = [...root.querySelectorAll('style')].map(d => new XMLSerializer().serializeToString(d)).join('')

  let nodes = [...root.children].filter(c => !SKIP.has(c.localName.toLowerCase()))
  // Figma/Illustrator часто кладут всё в одну обёртку <g>
  while (nodes.length === 1 && nodes[0].localName === 'g' && [...nodes[0].children].filter(c => !SKIP.has(c.localName.toLowerCase())).length > 1) {
    nodes = [...nodes[0].children].filter(c => !SKIP.has(c.localName.toLowerCase()))
  }

  const base = fileName.replace(/\.[^.]+$/, '')
  const host = document.createElementNS(NS, 'svg')
  host.setAttribute('style', 'position:absolute;width:0;height:0;visibility:hidden')
  document.body.appendChild(host)
  const out: LibObject[] = []
  try {
    nodes.forEach((node, i) => {
      const g = document.createElementNS(NS, 'g')
      host.replaceChildren(g)
      g.innerHTML = new XMLSerializer().serializeToString(node).replace(/ xmlns="[^"]*"/g, '')
      let b: DOMRect
      try {
        b = g.getBBox()
      } catch {
        return
      }
      if (!b.width || !b.height) return
      const name = node.getAttribute('data-name') || node.getAttribute('id') || (nodes.length === 1 ? base : `${base} ${i + 1}`)
      const v: Variant = { x: b.x, y: b.y, w: b.width, h: b.height, count: g.querySelectorAll('*').length, svg: `${styles}${defs}${g.innerHTML}` }
      out.push({
        id: `custom-${startIndex + out.length + 1}`,
        name,
        tags: tagsOf(`${name} ${base}`),
        sizes: { S: { main: v, bg: v }, L: { main: v, bg: v } },
      })
    })
  } finally {
    host.remove()
  }
  if (!out.length) throw new Error(`В «${fileName}» не нашлось объектов для библиотеки.`)
  return out
}

export function withObjects(lib: Library, extra: LibObject[]): Library {
  const objects = [...lib.objects, ...extra]
  return { objects, byId: new Map(objects.map(o => [o.id, o])) }
}
