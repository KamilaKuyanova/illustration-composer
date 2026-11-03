import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { matchObjects, parseNames, type Library, type LibObject } from '../src/lib/library'
import { SCHEMES, parsePalette, recolor } from '../src/lib/palette'
import { FORMATS, autoCompose, exportSvg, switchSize } from '../src/lib/compose'

const objects = JSON.parse(fs.readFileSync('public/library.json', 'utf8')).objects as LibObject[]
const lib: Library = { objects, byId: new Map(objects.map(o => [o.id, o])) }
const name = (n: string) => objects.find(o => o.name === n)!

test('в библиотеке 10 объектов, у каждого 2 размера (S, L) × 2 состояния', () => {
  assert.equal(objects.length, 10)
  for (const o of objects) {
    for (const size of ['S', 'L'] as const) {
      const { main, bg } = o.sizes[size]
      assert.ok(main.count > 0 && bg.count > 0, `${o.name} ${size}`)
      assert.ok(Math.abs(main.w - bg.w) < 1 && Math.abs(main.h - bg.h) < 1, `${o.name} ${size}: размеры состояний совпадают`)
    }
    // L крупнее S
    assert.ok(o.sizes.L.main.w > o.sizes.S.main.w * 1.5, `${o.name}: L заметно крупнее S`)
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
  for (const f of FORMATS) for (const size of ['S', 'L'] as const) {
    const c = autoCompose(['Телефон', 'Пазлы', 'Монета', 'Лампа', 'Кошелек'].map(name), f, SCHEMES[0], 2, size)
    assert.equal(c.items.length, 5)
    for (const it of c.items) {
      const v = lib.byId.get(it.objId)!.sizes[size].main
      assert.ok(it.x - (v.w * c.scale) / 2 >= -1 && it.x + (v.w * c.scale) / 2 <= f.w + 1, `${f.id} ${size}: ${it.objId} по ширине`)
      assert.ok(it.y - (v.h * c.scale) / 2 >= -1 && it.y + (v.h * c.scale) / 2 <= f.h + 1, `${f.id} ${size}: ${it.objId} по высоте`)
    }
  }
})

test('экспорт: объекты остаются отдельными группами с исходными path', () => {
  const c = autoCompose(['Телефон', 'Лампа'].map(name), FORMATS[0], SCHEMES[1], 1)
  const svg = exportSvg(lib, c)
  assert.equal((svg.match(/<g id=/g) ?? []).length, 2)
  assert.match(svg, /data-name="Телефон"/)
  assert.equal((svg.match(/<path/g) ?? []).length, name('Телефон').sizes.S.main.count + name('Лампа').sizes.S.bg.count)
  assert.doesNotMatch(svg, /#7864D7/i) // фиолетовый тон заменён бирюзовым
})

test('размер L: в экспорт попадают крупные детальные версии объектов', () => {
  const c = autoCompose(['Телефон'].map(name), FORMATS[0], SCHEMES[0], 1, 'L')
  const svg = exportSvg(lib, c)
  assert.equal((svg.match(/<path/g) ?? []).length, name('Телефон').sizes.L.main.count)
})

test('смена размера S↔L: объекты на кадре крупнее в L и возвращаются обратно', () => {
  const s = autoCompose(['Телефон', 'Лампа'].map(name), FORMATS[0], SCHEMES[0], 1, 'S')
  const toL = switchSize(lib, s, 'L')
  const widthOn = (size: 'S' | 'L', scale: number) => lib.byId.get(s.items[0].objId)!.sizes[size].main.w * scale
  assert.ok(widthOn('L', toL.scale) > widthOn('S', s.scale) * 1.3)
  const back = switchSize(lib, { ...s, ...toL }, 'S')
  assert.ok(Math.abs(back.scale - s.scale) < 1e-9)
})
