// Código de barras das etiquetas (src/lib/code128.ts): o que o sistema gera
// tem que ser lido pelo mesmo leitor da Nova venda (@zxing/library).
// Uso: node --test tests/unit/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const ts = require('typescript')
const zx = require('@zxing/library')

const source = readFileSync(path.join(ROOT, 'src', 'lib', 'code128.ts'), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const mod = { exports: {} }
new Function('module', 'exports', js)(mod, mod.exports)
const { code128Widths } = mod.exports

// Desenha as faixas (3 pixels por módulo, margem branca de 10 módulos) e lê.
function decode(text) {
  const widths = code128Widths(text)
  const scale = 3
  const quiet = 10
  const height = 40
  const width = (widths.reduce((a, b) => a + b, 0) + quiet * 2) * scale
  const pixels = new Uint8ClampedArray(width * height).fill(255)
  let x = quiet * scale
  widths.forEach((w, i) => {
    if (i % 2 === 0) {
      for (let y = 0; y < height; y++) pixels.fill(0, y * width + x, y * width + x + w * scale)
    }
    x += w * scale
  })
  const bitmap = new zx.BinaryBitmap(
    new zx.HybridBinarizer(new zx.RGBLuminanceSource(pixels, width, height)),
  )
  const hints = new Map([[zx.DecodeHintType.POSSIBLE_FORMATS, [zx.BarcodeFormat.CODE_128]]])
  return new zx.MultiFormatReader().decode(bitmap, hints).getText()
}

test('cada símbolo tem 11 módulos e o fim tem 13', () => {
  const patterns = js.match(/'[0-9]{6,7}'/g).map((s) => s.slice(1, -1))
  assert.equal(patterns.length, 107)
  assert.equal(new Set(patterns).size, 107)
  for (const p of patterns.slice(0, 106)) assert.equal([...p].reduce((a, b) => a + +b, 0), 11, p)
  assert.equal([...patterns[106]].reduce((a, b) => a + +b, 0), 13)
})

test('o leitor da Nova venda lê os códigos gerados', () => {
  for (const sku of ['NW-G4', 'NAV-V40-01', 'ACS-CAP-01', 'A', '0123456789', 'Z9-ABCDEFGHIJKLMNOP', 'patinete 1/2 ~']) {
    assert.equal(decode(sku), sku)
  }
})

test('caractere fora do teclado é recusado', () => {
  assert.throws(() => code128Widths('CHASSI-Ç1'), /Caractere fora do código de barras/)
})
