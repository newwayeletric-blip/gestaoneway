// E-mail de envio (Configurações → E-mail) e "Esqueci minha senha": só o
// admin da rede configura; o teste de envio vem antes de salvar; o e-mail de
// recuperação leva ao /reset-password do sistema e a senha nova funciona.
// Um servidor SMTP de mentira (só guarda as mensagens) faz o papel do Gmail.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { SETUP_TOKEN, client, startPocketBase } from './harness.mjs'

const PASSWORD = 'SenhaForte!2026'
let pb
let api
let smtp
const ctx = {}

function startFakeSmtp() {
  const messages = []
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8')
    let buffer = ''
    let inData = false
    let data = ''
    const send = (line) => socket.write(line + '\r\n')
    send('220 smtp-de-teste')
    socket.on('data', (chunk) => {
      buffer += chunk
      let idx
      while ((idx = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (inData) {
          if (line === '.') {
            inData = false
            messages.push(data)
            data = ''
            send('250 OK')
          } else {
            data += (line.startsWith('..') ? line.slice(1) : line) + '\n'
          }
          continue
        }
        const cmd = line.slice(0, 4).toUpperCase()
        if (cmd === 'EHLO') socket.write('250-smtp-de-teste\r\n250 AUTH PLAIN\r\n')
        else if (cmd === 'AUTH') send('235 Authentication successful')
        else if (cmd === 'DATA') {
          inData = true
          send('354 Go ahead')
        } else if (cmd === 'QUIT') {
          send('221 Bye')
          socket.end()
        } else send('250 OK')
      }
    })
    socket.on('error', () => {})
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, messages, server }))
  })
}

// O corpo pode vir em quoted-printable ou base64.
function readable(raw) {
  const qp = raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  const b64 = (raw.match(/^[A-Za-z0-9+/=]{20,}$/gm) || []).map((l) => Buffer.from(l, 'base64').toString('utf8'))
  return qp + '\n' + b64.join('')
}

const waitMessage = async (count) => {
  for (let i = 0; i < 50 && smtp.messages.length < count; i++) await new Promise((r) => setTimeout(r, 100))
  assert.equal(smtp.messages.length, count, 'mensagens recebidas pelo SMTP de teste')
  return readable(smtp.messages[count - 1])
}

before(async () => {
  smtp = await startFakeSmtp()
  pb = await startPocketBase()
  api = client(pb.baseUrl)
  const setup = await api('POST', '/backend/v1/setup', {
    body: { token: SETUP_TOKEN, name: 'Dono', email: 'dono@newway.dev', password: PASSWORD, passwordConfirm: PASSWORD },
  })
  assert.equal(setup.status, 200, setup.text)
  ctx.owner = setup.json.token
  const stores = (await api('GET', '/api/collections/stores/records', { token: ctx.owner })).json.items
  const seller = await api('POST', '/api/collections/users/records', {
    token: ctx.owner,
    body: {
      email: 'vendedor@newway.dev',
      name: 'Vendedor Teste',
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      profile: 'vendedor',
      stores: [stores[0].id],
    },
  })
  assert.equal(seller.status, 200, seller.text)
  ctx.seller = (
    await api('POST', '/api/collections/users/auth-with-password', {
      body: { identity: 'vendedor@newway.dev', password: PASSWORD },
    })
  ).json.token
})

after(async () => {
  if (pb) await pb.stop()
  smtp?.server.close()
})

test('só o admin da rede vê e troca o e-mail de envio', async () => {
  for (const token of [ctx.seller, undefined]) {
    assert.equal((await api('GET', '/backend/v1/mail-settings', { token })).status, 403)
    const res = await api('POST', '/backend/v1/mail-settings', {
      token,
      body: { email: 'x@newway.dev', password: 'abc', host: '127.0.0.1', port: smtp.port },
    })
    assert.equal(res.status, 403)
  }
  assert.equal(smtp.messages.length, 0)
})

test('sem configuração, o e-mail aparece desligado', async () => {
  const res = await api('GET', '/backend/v1/mail-settings', { token: ctx.owner })
  assert.equal(res.status, 200, res.text)
  assert.equal(res.json.enabled, false)
  assert.equal(res.json.hasPassword, false)
})

test('se o e-mail de teste não sai, nada é salvo', async () => {
  const closed = net.createServer()
  await new Promise((r) => closed.listen(0, '127.0.0.1', r))
  const port = closed.address().port
  await new Promise((r) => closed.close(r))
  const res = await api('POST', '/backend/v1/mail-settings', {
    token: ctx.owner,
    body: { email: 'envio@newway.dev', password: 'abcd efgh', host: '127.0.0.1', port },
  })
  assert.equal(res.status, 400, res.text)
  assert.match(res.json.message, /Não consegui enviar/)
  assert.equal((await api('GET', '/backend/v1/mail-settings', { token: ctx.owner })).json.enabled, false)
})

test('salva depois de mandar o teste e nunca devolve a senha', async () => {
  const res = await api('POST', '/backend/v1/mail-settings', {
    token: ctx.owner,
    body: { email: 'Envio@NewWay.dev', password: 'abcd efgh ijkl mnop', host: '127.0.0.1', port: smtp.port },
  })
  assert.equal(res.status, 200, res.text)
  const mail = await waitMessage(1)
  assert.match(mail, /dono@newway\.dev/)
  assert.match(mail, /Teste do e-mail do sistema/)

  const got = await api('GET', '/backend/v1/mail-settings', { token: ctx.owner })
  assert.equal(got.json.enabled, true)
  assert.equal(got.json.username, 'envio@newway.dev')
  assert.equal(got.json.hasPassword, true)
  assert.ok(!got.text.includes('abcd') && !res.text.includes('abcd'), 'a senha não volta para a tela')

  // Salvar de novo sem digitar a senha mantém a que já estava.
  const again = await api('POST', '/backend/v1/mail-settings', {
    token: ctx.owner,
    body: { email: 'envio@newway.dev', host: '127.0.0.1', port: smtp.port, senderName: 'New Way' },
  })
  assert.equal(again.status, 200, again.text)
  await waitMessage(2)
})

test('esqueci a senha manda o link do sistema e a senha nova funciona', async () => {
  const req = await api('POST', '/api/collections/users/request-password-reset', {
    body: { email: 'vendedor@newway.dev' },
  })
  assert.equal(req.status, 204, req.text)
  const mail = await waitMessage(3)
  assert.match(mail, /Redefinir sua senha/)
  assert.match(mail, /Vendedor Teste/)
  const token = mail.match(/https:\/\/nwcrmapp\.com\/reset-password\?token=([A-Za-z0-9._-]+)/)?.[1]
  assert.ok(token, 'link para o /reset-password do sistema')

  const confirm = await api('POST', '/api/collections/users/confirm-password-reset', {
    body: { token, password: 'Recuperada!2026', passwordConfirm: 'Recuperada!2026' },
  })
  assert.equal(confirm.status, 204, confirm.text)
  const login = await api('POST', '/api/collections/users/auth-with-password', {
    body: { identity: 'vendedor@newway.dev', password: 'Recuperada!2026' },
  })
  assert.equal(login.status, 200, login.text)
})
