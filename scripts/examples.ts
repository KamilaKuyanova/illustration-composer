// Собирает примеры композиций через тот же код, что и приложение (автосборка + экспорт SVG).
import fs from 'node:fs'
import { matchObjects, type Library, type LibObject } from '../src/lib/library'
import { FORMATS, autoCompose, exportSvg, sortByDepth } from '../src/lib/compose'
import { Resvg } from '@resvg/resvg-js'
import { SCHEMES } from '../src/lib/palette'

const objects = JSON.parse(fs.readFileSync('public/library.json', 'utf8')).objects as LibObject[]
const lib: Library = { objects, byId: new Map(objects.map(o => [o.id, o])) }

const jobs = [
  { file: 'finansovaya-bezopasnost', query: 'финансовая безопасность', format: 'og', scheme: 'violet', size: 'S' as const },
  { file: 'ideya-dlya-startapa', query: 'идея для стартапа', format: 'sq', scheme: 'peach', size: 'L' as const },
  { file: 'obuchenie-onlayn', query: 'обучение онлайн', format: 'wide', scheme: 'teal', size: 'S' as const },
  { file: 'komandnaya-rabota', query: 'командная работа над проектом', format: 'portrait', scheme: 'violet', size: 'L' as const },
  { file: 'tvorchestvo-i-muzyka', query: 'творчество и музыка', format: 'og', scheme: 'peach', size: 'S' as const },
]
fs.mkdirSync('examples', { recursive: true })
for (const j of jobs) {
  const top = matchObjects(lib, j.query).slice(0, 4)
  const c = autoCompose(top.map(m => m.obj), FORMATS.find(f => f.id === j.format)!, SCHEMES.find(s => s.id === j.scheme)!, top.length >= 4 ? 2 : 1, j.size)
  const svg = exportSvg(lib, { ...c, items: sortByDepth(c.items) })
  fs.writeFileSync(`examples/${j.file}.svg`, svg)
  // PNG-превью ровно того же размера, что и SVG
  fs.writeFileSync(`examples/${j.file}.png`, new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng())
  console.log(j.file, '←', top.map(m => m.obj.name).join(', '))
}
