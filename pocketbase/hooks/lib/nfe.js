/**
 * Emissão da NF-e pelo Bling (dono, 11/11/2026): o administrador libera a
 * venda e a nota vai direto para a Sefaz. Usada por sales_actions.js (aprovar)
 * e pelas rotas de pocketbase/hooks/nfe.js. Não é hook (entra por require).
 * Modelo: as notas que a New Way já emitia no Bling — natureza de operação
 * escolhida na aba Bling, NCM 8711.60.00 por padrão, origem 0, unidade UN,
 * sem parcelas; o Bling calcula CFOP e tributos pela natureza. O chassi de
 * cada unidade vai na observação da nota.
 * Passos: trava a venda (nf_status "emitindo"), cria a nota no Bling (ou
 * corrige a que ficou pendente ou rejeitada), envia para a Sefaz e lê a
 * situação. Autorizada: número, chave, PDF e XML anexados na venda. Qualquer
 * falha vira nf_status "erro" com o motivo; a venda continua confirmada e o
 * administrador corrige e tenta de novo, sem nota duplicada.
 */
const bling = require(`${__hooks}/lib/bling.js`)

const DEFAULT_NCM = '8711.60.00'
// Situações da nota no Bling.
const AUTHORIZED = [5, 6, 7]
const FAILED = {
  2: 'cancelada no Bling',
  4: 'rejeitada',
  9: 'denegada pela Sefaz',
  11: 'bloqueada',
}
const STUCK_MS = 3 * 60 * 1000

const text = (v) => String(v === undefined || v === null ? '' : v).trim()
const digits = (v) => text(v).replace(/\D/g, '')
const round2 = (v) => Math.round(v * 100) / 100

function formatNcm(v) {
  const d = digits(v)
  return d.length === 8 ? d.slice(0, 4) + '.' + d.slice(4, 6) + '.' + d.slice(6) : ''
}

// Data e hora de Brasília (UTC-3, sem horário de verão), como o Bling mostra.
function brNow() {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const p = (n) => (n < 10 ? '0' : '') + n
  return (
    d.getUTCFullYear() +
    '-' +
    p(d.getUTCMonth() + 1) +
    '-' +
    p(d.getUTCDate()) +
    ' ' +
    p(d.getUTCHours()) +
    ':' +
    p(d.getUTCMinutes()) +
    ':' +
    p(d.getUTCSeconds())
  )
}

function connection(app, orgId) {
  const rec = bling.find(app, orgId)
  return rec && rec.getString('refresh_token') ? rec : null
}

// O que falta para a nota sair (lista vazia = pode emitir).
function problems(app, sale, rec) {
  const out = []
  if (!rec) return ['o Bling não está conectado (Configurações → Bling)']
  if (!(rec.getFloat('nfe_natureza_id') > 0)) {
    out.push('escolha a natureza de operação das notas em Configurações → Bling')
  }
  let customer = null
  try {
    customer = app.findRecordById('customers', sale.getString('customer'))
  } catch (_) {}
  if (!customer) return out.concat(['a venda não tem cliente'])
  const doc = digits(customer.getString('document'))
  if (doc.length !== 11 && doc.length !== 14) out.push('CPF ou CNPJ do cliente')
  const missing = []
  if (digits(customer.getString('cep')).length !== 8) missing.push('CEP')
  if (!text(customer.getString('street'))) missing.push('rua')
  if (!text(customer.getString('street_number'))) missing.push('número')
  if (!text(customer.getString('district'))) missing.push('bairro')
  if (!text(customer.getString('city'))) missing.push('cidade')
  if (!/^[A-Z]{2}$/.test(text(customer.getString('uf')).toUpperCase())) missing.push('UF')
  if (missing.length) out.push('endereço do cliente (' + missing.join(', ') + ')')
  const items = app.findRecordsByFilter('sale_items', 'sale = {:sale}', 'created', 0, 0, {
    sale: sale.id,
  })
  if (items.length === 0) out.push('a venda não tem itens')
  return out
}

// Corpo da nota no formato da API v3 do Bling (POST/PUT /nfe).
function payload(app, sale, rec) {
  const customer = app.findRecordById('customers', sale.getString('customer'))
  const doc = digits(customer.getString('document'))
  const fallbackNcm = formatNcm(rec.getString('nfe_ncm_default')) || DEFAULT_NCM
  const items = []
  const serials = []
  let gross = 0
  for (const it of app.findRecordsByFilter('sale_items', 'sale = {:sale}', 'created', 0, 0, {
    sale: sale.id,
  })) {
    let product = null
    try {
      product = app.findRecordById('products', it.getString('product'))
    } catch (_) {}
    const qty = it.getFloat('quantity')
    const unit = it.getFloat('sale_price')
    gross += round2(unit * qty)
    const name = it.getString('product_name')
    items.push({
      codigo: it.getString('sku') || (product ? product.getString('sku') : '') || it.id,
      descricao: name,
      unidade: 'UN',
      quantidade: qty,
      valor: unit,
      tipo: 'P',
      origem: 0,
      classificacaoFiscal: (product && formatNcm(product.getString('ncm'))) || fallbackNcm,
    })
    if (it.getString('serial_number'))
      serials.push(it.getString('serial_number') + ' (' + name + ')')
  }
  const discount = round2(gross - sale.getFloat('total'))
  const notes = ['Venda ' + sale.getString('number') + '.']
  if (serials.length) notes.push('Chassi: ' + serials.join('; ') + '.')
  const body = {
    tipo: 1,
    dataOperacao: brNow(),
    contato: {
      nome: customer.getString('name'),
      tipoPessoa: doc.length === 14 ? 'J' : 'F',
      numeroDocumento: doc,
      contribuinte: 9,
      telefone: digits(customer.getString('phone')),
      email: customer.getString('email'),
      endereco: {
        endereco: text(customer.getString('street')),
        numero: text(customer.getString('street_number')),
        complemento: text(customer.getString('complement')),
        bairro: text(customer.getString('district')),
        cep: digits(customer.getString('cep')),
        municipio: text(customer.getString('city')),
        uf: text(customer.getString('uf')).toUpperCase(),
      },
    },
    naturezaOperacao: { id: rec.getFloat('nfe_natureza_id') },
    finalidade: 1,
    observacoes: notes.join(' '),
    itens: items,
  }
  if (discount > 0) body.desconto = discount
  return body
}

function setSale(app, saleId, fields) {
  const s = app.findRecordById('sales', saleId)
  for (const k in fields) s.set(k, fields[k])
  app.save(s)
  return s
}

function audit(app, sale, userId, ip, reason) {
  if (!userId) return
  const log = new Record(app.findCollectionByNameOrId('audit_logs'))
  log.set('org', sale.getString('org'))
  log.set('entity', 'sales')
  log.set('record_id', sale.id)
  log.set('action', 'alteracao')
  log.set('user', userId)
  log.set('reason', reason)
  log.set('ip_address', ip || '')
  app.save(log)
}

// PDF e XML da nota autorizada vão para os documentos da venda. Só baixa de
// endereços do Bling (BLING_DOC_SOURCES troca a lista, para os testes).
function attachDocuments(app, sale, data, userId) {
  const sources = String(
    $os.getenv('BLING_DOC_SOURCES') || 'https://www.bling.com.br/,https://api.bling.com.br/',
  )
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s)
  const number = text(data.numero)
  const existing = []
  for (const d of app.findRecordsByFilter(
    'sale_documents',
    "sale = {:sale} && doc_type = 'nota_fiscal'",
    '',
    0,
    0,
    { sale: sale.id },
  )) {
    existing.push(d.getString('label'))
  }
  const failures = []
  for (const doc of [
    { url: text(data.linkPDF), ext: 'pdf', label: 'NF-e ' + number + ' (PDF)' },
    { url: text(data.xml), ext: 'xml', label: 'NF-e ' + number + ' (XML)' },
  ]) {
    if (existing.indexOf(doc.label) >= 0) continue
    if (!doc.url || !sources.some((s) => doc.url.indexOf(s) === 0)) {
      failures.push(doc.ext.toUpperCase())
      continue
    }
    try {
      const file = $filesystem.fileFromURL(doc.url, 30)
      file.name =
        'nfe_' + digits(number) + '_' + $security.randomString(6).toLowerCase() + '.' + doc.ext
      file.originalName = 'NF-e ' + number + '.' + doc.ext
      const rec = new Record(app.findCollectionByNameOrId('sale_documents'))
      rec.set('org', sale.getString('org'))
      rec.set('sale', sale.id)
      rec.set('doc_type', 'nota_fiscal')
      rec.set('label', doc.label)
      rec.set('file', file)
      rec.set('file_size', file.size)
      if (userId) rec.set('uploaded_by', userId)
      app.save(rec)
    } catch (err) {
      failures.push(doc.ext.toUpperCase())
    }
  }
  return failures
}

// Lê a nota no Bling e atualiza a venda. Devolve o resultado para a tela.
function sync(app, saleId, rec, userId, ip) {
  let sale = app.findRecordById('sales', saleId)
  const res = bling.call(app, rec, 'GET', '/nfe/' + sale.getString('nf_bling_id'))
  if (res.statusCode !== 200) {
    throw new Error('não consegui ler a nota no Bling (' + bling.describe(res) + ')')
  }
  const data = (res.json && res.json.data) || {}
  const situation = Number(data.situacao)
  if (AUTHORIZED.indexOf(situation) >= 0) {
    const first = sale.getString('nf_status') !== 'autorizada'
    sale = setSale(app, saleId, {
      nf_status: 'autorizada',
      nf_error: '',
      invoice_number: text(data.numero),
      nf_key: text(data.chaveAcesso),
      nf_issued_at: sale.getString('nf_issued_at') || new DateTime(),
    })
    if (first) audit(app, sale, userId, ip, 'NF-e ' + text(data.numero) + ' autorizada pela Sefaz')
    const failures = attachDocuments(app, sale, data, userId)
    if (failures.length) {
      sale = setSale(app, saleId, {
        nf_error:
          'Nota autorizada, mas não consegui guardar o ' +
          failures.join(' e o ') +
          ' na venda. Clique em "Buscar PDF e XML" ou baixe no Bling.',
      })
    }
    return result(sale)
  }
  if (FAILED[situation]) {
    // O motivo da Sefaz vem no envio; aqui fica o que já estava gravado.
    const reason = sale.getString('nf_error') || 'A nota foi ' + FAILED[situation] + '.'
    return result(setSale(app, saleId, { nf_status: 'erro', nf_error: reason }))
  }
  // Pendente ou na fila da Sefaz: a rotina nfe_sync confere de novo.
  return result(setSale(app, saleId, { nf_status: 'emitindo', nf_started_at: Date.now() }))
}

function result(sale) {
  return {
    status: sale.getString('nf_status'),
    number: sale.getString('invoice_number'),
    error: sale.getString('nf_error'),
  }
}

// Emite (ou tenta de novo) a NF-e da venda confirmada. Nunca lança erro:
// a falha fica gravada na venda e volta no resultado.
function emit(app, saleId, userId, ip) {
  let claimedFrom = ''
  try {
    app.runInTransaction((tx) => {
      const s = tx.findRecordById('sales', saleId)
      const st = s.getString('nf_status')
      if (s.getString('status') !== 'confirmada') {
        throw new Error('a nota só sai de venda confirmada')
      }
      // Venda de marketplace: a nota sai pelo Bling, junto do pedido do canal.
      if (s.getString('channel')) {
        throw new Error('venda de marketplace: a nota fiscal sai pelo Bling, no pedido do canal')
      }
      if (st === 'autorizada') {
        claimedFrom = 'autorizada'
        return
      }
      // Já no Bling, na fila da Sefaz: só consulta.
      if (st === 'emitindo' && s.getString('nf_bling_id')) {
        claimedFrom = 'fila'
        return
      }
      if (st === 'emitindo' && Date.now() - s.getFloat('nf_started_at') < STUCK_MS) {
        throw new Error('a nota já está sendo emitida; aguarde e atualize a tela')
      }
      claimedFrom = st
      s.set('nf_status', 'emitindo')
      s.set('nf_started_at', Date.now())
      tx.save(s)
    })
  } catch (err) {
    return { status: '', number: '', error: String(err.message || err), busy: true }
  }

  const sale = app.findRecordById('sales', saleId)
  const rec = connection(app, sale.getString('org'))
  // Já autorizada (confere os anexos, PDF e XML) ou na fila da Sefaz.
  if (claimedFrom === 'autorizada' || claimedFrom === 'fila') {
    if (!rec) return result(sale)
    try {
      return sync(app, saleId, rec, userId, ip)
    } catch (err) {
      return result(sale)
    }
  }
  try {
    const missing = problems(app, sale, rec)
    if (missing.length) throw new Error('Falta para a nota sair: ' + missing.join('; ') + '.')
    const body = payload(app, sale, rec)

    let id = sale.getString('nf_bling_id')
    if (id) {
      const cur = bling.call(app, rec, 'GET', '/nfe/' + id)
      const situation = Number(cur.json && cur.json.data && cur.json.data.situacao)
      if (cur.statusCode === 404 || (cur.statusCode === 200 && situation === 2)) {
        id = '' // apagada ou cancelada no Bling: cria outra
      } else if (cur.statusCode !== 200) {
        // Falha passageira: nunca cria outra nota sem saber da primeira.
        throw new Error('não consegui ler a nota no Bling (' + bling.describe(cur) + ')')
      } else if (AUTHORIZED.indexOf(situation) >= 0) {
        return sync(app, saleId, rec, userId, ip)
      } else if (situation === 1 || situation === 4) {
        // Pendente ou rejeitada: corrige com os dados de agora e reenvia.
        const put = bling.call(app, rec, 'PUT', '/nfe/' + id, body)
        if (put.statusCode >= 300) {
          throw new Error('o Bling não aceitou a correção da nota (' + bling.describe(put) + ')')
        }
      } else {
        // Ainda na fila da Sefaz: só acompanha.
        return sync(app, saleId, rec, userId, ip)
      }
    }
    if (!id) {
      const created = bling.call(app, rec, 'POST', '/nfe', body)
      const cid = created.json && created.json.data && created.json.data.id
      if (created.statusCode >= 300 || !cid) {
        throw new Error('o Bling não aceitou a nota (' + bling.describe(created) + ')')
      }
      id = String(cid)
      setSale(app, saleId, { nf_bling_id: id })
    }

    const sent = bling.call(app, rec, 'POST', '/nfe/' + id + '/enviar')
    if (sent.statusCode >= 300) {
      throw new Error('a Sefaz não autorizou a nota (' + bling.describe(sent) + ')')
    }
    setSale(app, saleId, { nf_error: '' })
    return sync(app, saleId, rec, userId, ip)
  } catch (err) {
    const message = String(err.message || err).slice(0, 600)
    const failed = setSale(app, saleId, {
      nf_status: 'erro',
      nf_error: message.charAt(0).toUpperCase() + message.slice(1),
    })
    audit(app, failed, userId, ip, 'NF-e não saiu: ' + message.slice(0, 300))
    return result(failed)
  }
}

module.exports = {
  connection: connection,
  problems: problems,
  payload: payload,
  emit: emit,
  sync: sync,
  result: result,
  STUCK_MS: STUCK_MS,
}
