// Sobe um PocketBase local e descartável com as migrations e hooks do
// projeto, para os testes de API (PRD D.8). Nunca aponta para produção.
//
// Variáveis opcionais:
//   PB_BIN      caminho de um binário pocketbase já baixado
//   PB_VERSION  versão a baixar (padrão: a mesma linha usada pelo Skip Cloud)
import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateRawSync } from 'node:zlib'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PB_VERSION = process.env.PB_VERSION || '0.40.4'
export const SETUP_TOKEN = 'teste-token-de-instalacao-0123456789abcdef'

// Extrai um arquivo de um ZIP sem depender de tar/unzip do sistema
// (o pipeline do Skip e o Git Bash no Windows não abrem zip com tar).
function extractFromZip(zip, wanted) {
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('ZIP do PocketBase inválido')
  let p = zip.readUInt32LE(eocd + 16)
  for (let n = zip.readUInt16LE(eocd + 10); n > 0; n--) {
    const method = zip.readUInt16LE(p + 10)
    const size = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28)
    const extraLen = zip.readUInt16LE(p + 30)
    const commentLen = zip.readUInt16LE(p + 32)
    const local = zip.readUInt32LE(p + 42)
    if (zip.toString('utf8', p + 46, p + 46 + nameLen) === wanted) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      const data = zip.subarray(start, start + size)
      if (method === 0) return data
      if (method === 8) return inflateRawSync(data)
      throw new Error(`Compressão ZIP não suportada: ${method}`)
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`${wanted} não encontrado no ZIP do PocketBase`)
}

async function ensureBinary() {
  if (process.env.PB_BIN) return process.env.PB_BIN
  const exe = process.platform === 'win32' ? 'pocketbase.exe' : 'pocketbase'
  const dir = path.join(ROOT, '.pb-test', PB_VERSION)
  const bin = path.join(dir, exe)
  if (existsSync(bin)) return bin

  const os = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform]
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch]
  if (!os || !arch) throw new Error(`Plataforma sem binário do PocketBase: ${process.platform}/${process.arch}`)
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${os}_${arch}.zip`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(bin, extractFromZip(Buffer.from(await res.arrayBuffer()), exe))
  chmodSync(bin, 0o755)
  return bin
}

// Pastas de hooks e migrations de uma instância de teste. `migrationsUpTo`
// (ex.: '0010') sobe o banco só até essa migration, para testar a seguinte
// sobre dados gravados como o sistema antigo gravava.
function pbFlags(work, migrationsUpTo) {
  // O Skip Cloud carrega pocketbase/hooks/*.js; o PocketBase padrão só lê
  // *.pb.js. A cópia com o sufixo reproduz o mesmo conjunto de hooks.
  const hooksDir = path.join(work, 'pb_hooks')
  mkdirSync(hooksDir, { recursive: true })
  for (const f of readdirSync(path.join(ROOT, 'pocketbase', 'hooks'))) {
    if (f.endsWith('.js')) {
      cpSync(path.join(ROOT, 'pocketbase', 'hooks', f), path.join(hooksDir, f.replace(/\.js$/, '.pb.js')))
    }
  }
  // Bibliotecas dos hooks (require), sem o sufixo: não são carregadas como hook.
  cpSync(path.join(ROOT, 'pocketbase', 'hooks', 'lib'), path.join(hooksDir, 'lib'), { recursive: true })

  let migrationsDir = path.join(ROOT, 'pocketbase', 'migrations')
  if (migrationsUpTo) {
    const subset = path.join(work, 'pb_migrations')
    rmSync(subset, { recursive: true, force: true })
    mkdirSync(subset)
    for (const f of readdirSync(migrationsDir)) {
      if (f.endsWith('.js') && f.slice(0, migrationsUpTo.length) <= migrationsUpTo) {
        cpSync(path.join(migrationsDir, f), path.join(subset, f))
      }
    }
    migrationsDir = subset
  }

  return [`--dir=${path.join(work, 'pb_data')}`, `--hooksDir=${hooksDir}`, `--migrationsDir=${migrationsDir}`]
}

// `dir` reaproveita os dados de uma instância parada com stop({ keepData: true }).
export async function startPocketBase({ dir, migrationsUpTo } = {}) {
  const bin = await ensureBinary()
  const work = dir || mkdtempSync(path.join(tmpdir(), 'nw-pb-test-'))

  const port = 18090 + Math.floor(Math.random() * 1000)
  const baseUrl = `http://127.0.0.1:${port}`
  const proc = spawn(bin, ['serve', `--http=127.0.0.1:${port}`, ...pbFlags(work, migrationsUpTo)], {
    env: { ...process.env, SETUP_TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  proc.stdout.on('data', (d) => (log += d))
  proc.stderr.on('data', (d) => (log += d))

  const deadline = Date.now() + 30000
  for (;;) {
    try {
      const r = await fetch(`${baseUrl}/api/health`)
      if (r.ok) break
    } catch {}
    if (proc.exitCode !== null || Date.now() > deadline) {
      throw new Error(`PocketBase não subiu.\n${log}`)
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  return {
    baseUrl,
    dir: work,
    log: () => log,
    async stop({ keepData = false } = {}) {
      if (proc.exitCode === null) {
        const exited = new Promise((r) => proc.once('exit', r))
        proc.kill()
        await exited
      }
      await new Promise((r) => setTimeout(r, 300))
      if (keepData) return
      try {
        rmSync(work, { recursive: true, force: true })
      } catch {}
    },
  }
}

// Roda um comando do PocketBase (ex.: `migrate down 1`) sobre os dados de uma
// instância parada.
export async function runPocketBase(dir, args, { migrationsUpTo } = {}) {
  const bin = await ensureBinary()
  const res = spawnSync(bin, [...args, ...pbFlags(dir, migrationsUpTo)], {
    env: { ...process.env, SETUP_TOKEN },
    encoding: 'utf8',
    input: 'y\n',
  })
  const output = `${res.stdout || ''}${res.stderr || ''}`
  if (res.status !== 0) throw new Error(`pocketbase ${args.join(' ')} falhou (${res.status}).\n${output}`)
  return output
}

export function client(baseUrl) {
  return async function api(method, urlPath, { token, body, form } = {}) {
    const headers = {}
    if (token) headers.Authorization = token
    let payload
    if (form) {
      payload = form
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    const res = await fetch(baseUrl + urlPath, { method, headers, body: payload })
    const text = await res.text()
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }
    return { status: res.status, json, text }
  }
}
