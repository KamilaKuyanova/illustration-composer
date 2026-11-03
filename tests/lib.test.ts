import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { matchObjects, parseNames, type Library, type LibObject } from '../src/lib/library'
import { SCHEMES, parsePalette, recolor } from '../src/lib/palette'
import { FORMATS, autoCompose, exportSvg } from '../src/lib/compose'

const objects = JSON.parse(fs.readFileSync('public/library.json', 'utf8')).objects as LibObject[]
const lib: Library = { objects, byId: new Map(objects.map(o => [o.id, o])) }
const name = (n: string) => objects.find(o => o.name === n)!

test('в библиотеке 10 объектов, у каждого два состояния', () => {
  assert.equal(objects.length, 10)
  for (const o of objects) {
    assert.ok(o.main.count > 0 && o.bg.count > 0, o.name)
    assert.deepEqual([o.main.w, o.main.h].map(Math.round), [o.bg.w, o.bg.h].map(Math.round), `${o.name}: размеры состояний совпадают`)
  }
})

test('поиск по метафоре находит монету и кошелёк', () => {
  const names = matchObjects(lib, 'Финансовая безопасность').map(m => m.obj.name)
  assert.equal(names[0], 'Монета')
  assert.ok(names.includes('Кошелек'))
})

test('поиск по метафоре умеет формы слов', () => {
  assert.equal(matchObjects(lib, 'новые идеи').at(0)?.obj.name, 'Лампа')
  assert.deepEqual(matchObjects(lib, 'абракадабра'), [])
})

test('разбор названий: порядок, «и», неизвестные слова', () => {
  const { found, unknown } = parseNames(lib, 'телефон, пазлы и лампа, единорог')
  assert.deepEqual(found.map(o => o.name), ['Телефон', 'Пазлы', 'Лампа'])
  assert.deepEqual(unknown, ['единорог'])
})

test('палитра: берутся 3 тона, белый и чёрный игнорируются', () => {
  const s = parsePalette('#fff #000 #112233 #AABBCC #FF8800')
  assert.deepEqual([s.light, s.mid, s.dark], ['#AABBCC', '#FF8800', '#112233'])
  assert.throws(() => parsePalette('#fff #000 #123456'))
})

test('перекраска меняет только три тона схемы', () => {
  const teal = SCHEMES.find(s => s.id === 'teal')!
  const out = recolor('<path fill="#D7CDF5"/><path fill="#7864D7"/><path fill="#F9A3AA"/><path fill="#181817"/>', teal)
  assert.equal(out, '<path fill="#BEEBEB"/><path fill="#5ABEBE"/><path fill="#F9A3AA"/><path fill="#181817"/>')
})

test('автосборка: пропорции объектов сохраняются, всё помещается в кадр', () => {
  for (const f of FORMATS) {
    const c = autoCompose(['Телефон', 'Пазлы', 'Монета', 'Лампа', 'Кошелек'].map(name), f, SCHEMES[0])
    assert.equal(c.items.length, 5)
    for (const it of c.items) {
      const v = lib.byId.get(it.objId)!.main
      assert.ok(it.x - (v.w * c.scale) / 2 >= -1 && it.x + (v.w * c.scale) / 2 <= f.w + 1, `${f.id}: ${it.objId} по ширине`)
      assert.ok(it.y - (v.h * c.scale) / 2 >= -1 && it.y + (v.h * c.scale) / 2 <= f.h + 1, `${f.id}: ${it.objId} по высоте`)
    }
  }
})

test('экспорт: объекты остаются отдельными группами с исходными path', () => {
  const c = autoCompose(['Телефон', 'Лампа'].map(name), FORMATS[0], SCHEMES[1], 1)
  const svg = exportSvg(lib, c)
  assert.equal((svg.match(/<g id=/g) ?? []).length, 2)
  assert.match(svg, /data-name="Телефон"/)
  assert.equal((svg.match(/<path/g) ?? []).length, name('Телефон').main.count + name('Лампа').bg.count)
  assert.doesNotMatch(svg, /#7864D7/i) // фиолетовый тон заменён бирюзовым
})
