/**
 * CFG-01: toda loja tem um identificador (slug) único na rede inteira. Se
 * ninguém informar, o servidor gera um a partir do nome ("Loja Batel" →
 * "loja-batel"; se "cajuru" já existir, a nova fica "cajuru-2"). Um slug
 * informado não é alterado. Loja nova sem situação nasce "ativa".
 * Hook de modelo: vale para a API, para rotas e para o painel.
 */
onRecordValidate((e) => {
  const rec = e.record
  if (rec.isNew() && !rec.getString('status')) rec.set('status', 'ativa')
  if (rec.getString('slug').trim()) return e.next()

  const accented = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
  const plain = 'aaaaaeeeeiiiiooooouuuucn'
  const base =
    rec
      .getString('name')
      .toLowerCase()
      .replace(/[áàâãäéèêëíìîïóòôõöúùûüçñ]/g, (ch) => plain[accented.indexOf(ch)])
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 50)
      .replace(/^-+|-+$/g, '') || 'loja'

  // e.app é a transação em curso, quando houver: duas lojas com o mesmo
  // nome cadastradas juntas recebem identificadores diferentes.
  let slug = base
  for (let n = 2; ; n++) {
    const taken = e.app.findRecordsByFilter('stores', 'slug = {:slug} && id != {:id}', '', 1, 0, {
      slug: slug,
      id: rec.id,
    })
    if (taken.length === 0) break
    slug = base + '-' + n
  }
  rec.set('slug', slug)
  return e.next()
}, 'stores')
