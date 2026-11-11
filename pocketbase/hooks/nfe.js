/**
 * NF-e pelo Bling (dono, 11/11/2026): só o administrador libera a nota.
 * A aprovação do administrador já emite (sales_actions.js); estas rotas
 * servem para a venda aprovada pelo gerente (nf_status "aguardando_admin")
 * e para tentar de novo depois de corrigir o que faltou.
 * - POST /backend/v1/sales/{id}/nfe        emite, tenta de novo ou atualiza
 * - GET  /backend/v1/sales/{id}/nfe/check  o que falta para a nota sair
 * - cron nfe_sync: nota na fila da Sefaz é conferida a cada 2 minutos.
 * A lógica fica em pocketbase/hooks/lib/nfe.js.
 */
routerAdd('POST', '/backend/v1/sales/{id}/nfe', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador libera a nota fiscal.')
  }
  let sale = null
  try {
    sale = $app.findRecordById('sales', e.request.pathValue('id'))
  } catch (_) {}
  if (!sale || sale.getString('org') !== auth.getString('org')) {
    throw new NotFoundError('Venda não encontrada.')
  }
  const nfe = require(`${__hooks}/lib/nfe.js`)
  const res = nfe.emit($app, sale.id, auth.id, e.realIP())
  if (res.busy)
    throw new BadRequestError(res.error.charAt(0).toUpperCase() + res.error.slice(1) + '.')
  return e.json(200, res)
})

routerAdd('GET', '/backend/v1/sales/{id}/nfe/check', (e) => {
  const auth = e.auth
  if (
    !auth ||
    auth.collection().name !== 'users' ||
    auth.getString('status') !== 'ativo' ||
    auth.getString('profile') !== 'admin'
  ) {
    throw new ForbiddenError('Só o administrador libera a nota fiscal.')
  }
  let sale = null
  try {
    sale = $app.findRecordById('sales', e.request.pathValue('id'))
  } catch (_) {}
  if (!sale || sale.getString('org') !== auth.getString('org')) {
    throw new NotFoundError('Venda não encontrada.')
  }
  const nfe = require(`${__hooks}/lib/nfe.js`)
  const rec = nfe.connection($app, sale.getString('org'))
  return e.json(200, { connected: !!rec, problems: rec ? nfe.problems($app, sale, rec) : [] })
})

cronAdd('nfe_sync', '*/2 * * * *', () => {
  const nfe = require(`${__hooks}/lib/nfe.js`)
  const now = Date.now()
  for (const sale of $app.findRecordsByFilter(
    'sales',
    "nf_status = 'emitindo' && nf_started_at < {:limit}",
    '',
    50,
    0,
    { limit: now - 60 * 1000 },
  )) {
    try {
      if (sale.getString('nf_bling_id')) {
        const rec = nfe.connection($app, sale.getString('org'))
        if (rec) nfe.sync($app, sale.id, rec, '', '')
      } else if (now - sale.getFloat('nf_started_at') > nfe.STUCK_MS) {
        sale.set('nf_status', 'erro')
        sale.set(
          'nf_error',
          'A emissão foi interrompida antes de chegar ao Bling. Clique em "Tentar de novo".',
        )
        $app.save(sale)
      }
    } catch (err) {
      console.log('nfe_sync ' + sale.id + ': ' + String(err).slice(0, 200))
    }
  }
})
