/**
 * CFG-01: toda loja tem um identificador (slug) único na rede inteira. Se
 * ninguém informar, o servidor gera um a partir do nome ("Loja Batel" →
 * "loja-batel"; se "cajuru" já existir, a nova fica "cajuru-2"). Um slug
 * informado não é alterado. Loja nova sem situação nasce "ativa".
 * VEN-01: a loja também tem um código curto, único na organização, que
 * numera as vendas ("JP-000123"); sem código, sai das iniciais do nome.
 * Hook de modelo: vale para a API, para rotas, para o painel e para as
 * migrations (por isso confere se o campo "code" já existe).
 */
onRecordValidate((e) => {
  const rec = e.record
  if (rec.isNew() && !rec.getString('status')) rec.set('status', 'ativa')

  const accented = 'áàâãäéèêëíìîïóòôõöúùûüçñ'
  const plain = 'aaaaaeeeeiiiiooooouuuucn'
  const fold = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[áàâãäéèêëíìîïóòôõöúùûüçñ]/g, (ch) => plain[accented.indexOf(ch)])

  if (!rec.getString('slug').trim()) {
    const base =
      fold(rec.getString('name'))
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
  }

  if (rec.collection().fields.getByName('code')) {
    let code = rec.getString('code').trim().toUpperCase()
    if (!code) {
      const words = fold(rec.getString('name'))
        .split(/[^a-z0-9]+/)
        .filter((w) => w && ['loja', 'de', 'da', 'do', 'das', 'dos', 'e'].indexOf(w) === -1)
      const base = (
        words.length >= 2
          ? words
              .slice(0, 3)
              .map((w) => w[0])
              .join('')
          : (words[0] || 'lj').slice(0, 2)
      ).toUpperCase()
      code = base
      for (let n = 2; ; n++) {
        const taken = e.app.findRecordsByFilter(
          'stores',
          'org = {:org} && code = {:code} && id != {:id}',
          '',
          1,
          0,
          { org: rec.getString('org'), code: code, id: rec.id },
        )
        if (taken.length === 0) break
        code = base + n
      }
    }
    rec.set('code', code)
  }
  return e.next()
}, 'stores')
