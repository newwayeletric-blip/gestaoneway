import { useEffect, useState, type FormEvent } from 'react'
import { BlingService, type BlingNatureza, type BlingStatus } from '@/services/api'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  Link2,
  PlugZap,
  RefreshCw,
  Unplug,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

const when = (ms: number) => (ms > 0 ? new Date(ms).toLocaleString('pt-BR') : '—')

// Configurações → Bling (só o administrador): as chaves do aplicativo criado
// no Bling e a autorização da conta. O Bling emite a NF-e das vendas.
export default function BlingSettings() {
  const { toast } = useToast()
  const [current, setCurrent] = useState<BlingStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState('')
  const callbackUrl = BlingService.callbackUrl()

  useEffect(() => {
    BlingService.status()
      .then(setCurrent)
      .catch((err) => console.error('Error loading Bling status:', err))
  }, [])

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what)
    try {
      await fn()
    } catch (err: any) {
      toast({ title: 'Não deu certo', description: err.message, variant: 'destructive' })
    } finally {
      setBusy('')
    }
  }

  const handleSave = (e: FormEvent) => {
    e.preventDefault()
    run('save', async () => {
      setCurrent(
        await BlingService.saveCredentials({ client_id: clientId, client_secret: clientSecret }),
      )
      setClientId('')
      setClientSecret('')
      toast({ title: 'Chaves salvas!', description: 'Agora clique em "Conectar ao Bling".' })
    })
  }

  // Vai para o Bling na mesma aba; depois de "Autorizar", o Bling volta para
  // /configuracoes?bling=conectado (ou =erro).
  const handleConnect = () =>
    run('connect', async () => {
      window.location.href = await BlingService.connectUrl()
    })

  const handleTest = () =>
    run('test', async () => {
      setCurrent(await BlingService.test())
      toast({ title: 'O Bling respondeu!', description: 'A conexão está funcionando.' })
    })

  const handleDisconnect = () => {
    if (
      !window.confirm('Desconectar o Bling? As notas fiscais param de sair até conectar de novo.')
    )
      return
    run('disconnect', async () => {
      setCurrent(await BlingService.disconnect())
      toast({ title: 'Bling desconectado' })
    })
  }

  const copyCallback = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl)
      toast({ title: 'Link copiado!' })
    } catch {
      toast({ title: 'Copie o link à mão', description: callbackUrl })
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-white border-0 shadow-sm rounded-xl p-6">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-base text-[#111111] flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Conexão com o Bling
          </CardTitle>
          <CardDescription>
            O Bling emite a nota fiscal das vendas que o administrador liberar. O sistema continua
            sendo o cadastro principal de produtos, clientes e estoque.
          </CardDescription>
        </CardHeader>

        {current &&
          (current.connected ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-[#E8F7EF] px-3 py-2 text-sm text-[#0A8F5C]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  Conectado{current.companyName ? `: ${current.companyName}` : ''}
                  {current.companyCnpj ? ` (CNPJ ${current.companyCnpj})` : ''}
                </p>
                <p className="text-xs">
                  Desde {when(current.connectedAt)} · chave de acesso renovada em{' '}
                  {when(current.lastRefreshAt)} (o sistema renova sozinho)
                </p>
              </div>
            </div>
          ) : (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <XCircle className="h-4 w-4 shrink-0" />
              {current.configured
                ? 'Chaves salvas, mas o Bling ainda não foi conectado.'
                : 'Não conectado: as notas fiscais ainda não saem pelo Bling.'}
            </div>
          ))}
        {current?.lastError && (
          <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {current.lastError}
          </div>
        )}

        <div className="mt-2 mb-5 max-w-2xl rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <p className="font-semibold text-gray-900">Como conectar:</p>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li>
              No Bling, abra o aplicativo que você criou (Central de Extensões → Área do
              Integrador). O <strong>Link de redirecionamento</strong> dele tem que ser exatamente:
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-white px-2 py-1 text-xs text-gray-900 border border-gray-200">
                  {callbackUrl}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={copyCallback}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                </Button>
              </div>
            </li>
            <li>
              Copie do aplicativo o <strong>Client ID</strong> e o <strong>Client Secret</strong>,
              cole abaixo e salve.
            </li>
            <li>
              Clique em <strong>Conectar ao Bling</strong>, entre na conta do Bling e clique em{' '}
              <strong>Autorizar</strong>. Você volta para esta tela já conectado.
            </li>
          </ol>
        </div>

        <form onSubmit={handleSave} className="grid max-w-2xl grid-cols-1 gap-4">
          <div className="space-y-1">
            <Label htmlFor="blingClientId" className="text-xs font-semibold text-gray-700">
              Client ID
            </Label>
            <Input
              id="blingClientId"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder={
                current?.configured
                  ? `Já salvo (termina em ${current.clientIdEnd}): cole outro só para trocar`
                  : 'Cole aqui o Client ID do aplicativo'
              }
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="blingClientSecret" className="text-xs font-semibold text-gray-700">
              Client Secret
            </Label>
            <Input
              id="blingClientSecret"
              type="password"
              autoComplete="new-password"
              required={!current?.configured}
              placeholder={
                current?.configured
                  ? 'Já salvo: deixe em branco para manter'
                  : 'Cole aqui o Client Secret do aplicativo'
              }
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="submit"
              disabled={!!busy}
              variant={current?.configured ? 'outline' : 'default'}
              className={current?.configured ? '' : 'bg-[#0A8F5C] hover:bg-[#087A4D] text-white'}
            >
              {busy === 'save'
                ? 'Salvando...'
                : current?.configured
                  ? 'Trocar as chaves'
                  : 'Salvar chaves'}
            </Button>
          </div>
        </form>

        <div className="mt-6 flex max-w-2xl flex-wrap gap-2 border-t border-gray-100 pt-5">
          <Button
            type="button"
            onClick={handleConnect}
            disabled={!current?.configured || !!busy}
            className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
          >
            <PlugZap className="h-4 w-4 mr-2" />
            {busy === 'connect'
              ? 'Abrindo o Bling...'
              : current?.connected
                ? 'Conectar de novo'
                : 'Conectar ao Bling'}
          </Button>
          {current?.connected && (
            <>
              <Button type="button" variant="outline" onClick={handleTest} disabled={!!busy}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {busy === 'test' ? 'Testando...' : 'Testar conexão'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDisconnect}
                disabled={!!busy}
                className="text-red-700 hover:text-red-800"
              >
                <Unplug className="h-4 w-4 mr-2" /> Desconectar
              </Button>
            </>
          )}
        </div>
      </Card>
      {current?.connected && <NfeSettingsCard current={current} onSaved={setCurrent} />}
    </div>
  )
}

// Como as notas saem (dono, 11/11/2026): direto para a Sefaz quando o
// administrador libera a venda, com a natureza de operação e o NCM padrão
// escolhidos aqui. A natureza da última nota emitida no Bling vem sugerida.
function NfeSettingsCard({
  current,
  onSaved,
}: {
  current: BlingStatus
  onSaved: (s: BlingStatus) => void
}) {
  const { toast } = useToast()
  const [items, setItems] = useState<BlingNatureza[] | null>(null)
  const [lastUsedId, setLastUsedId] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [naturezaId, setNaturezaId] = useState(
    current.nfeNaturezaId ? String(current.nfeNaturezaId) : '',
  )
  const [ncm, setNcm] = useState(current.nfeNcmDefault || '8711.60.00')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    BlingService.naturezas()
      .then((res) => {
        setItems(res.items)
        setLastUsedId(res.lastUsedId)
        if (!current.nfeNaturezaId && res.lastUsedId) setNaturezaId(String(res.lastUsedId))
      })
      .catch((err) => setLoadError(err.message))
  }, [])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const saved = await BlingService.saveNfeSettings({
        natureza_id: Number(naturezaId),
        natureza_name: items?.find((n) => String(n.id) === naturezaId)?.name || '',
        ncm_default: ncm,
      })
      onSaved(saved)
      toast({
        title: 'Notas configuradas!',
        description: 'A venda liberada pelo administrador já sai com nota fiscal.',
      })
    } catch (err: any) {
      toast({ title: 'Não foi possível salvar', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="bg-white border-0 shadow-sm rounded-xl p-6">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-base text-[#111111] flex items-center gap-2">
          <FileText className="h-4 w-4" /> Nota fiscal (NF-e)
        </CardTitle>
        <CardDescription>
          Quando o administrador libera a venda, a nota vai direto para a Sefaz com o chassi na
          observação. O PDF e o XML ficam guardados na venda.
        </CardDescription>
      </CardHeader>

      {current.nfeNaturezaId ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-[#E8F7EF] px-3 py-2 text-sm text-[#0A8F5C]">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> Notas saindo com a natureza "
          {current.nfeNaturezaName || current.nfeNaturezaId}" e NCM padrão {current.nfeNcmDefault}.
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Escolha a natureza de operação e salve: sem
          ela, as notas não saem.
        </div>
      )}
      {loadError && (
        <p className="mb-3 text-sm text-red-700">
          Não consegui ler as naturezas do Bling: {loadError}
        </p>
      )}

      <form onSubmit={handleSave} className="grid max-w-2xl grid-cols-1 gap-4">
        <div className="space-y-1">
          <Label htmlFor="nfeNatureza" className="text-xs font-semibold text-gray-700">
            Natureza de operação (cadastrada no Bling)
          </Label>
          {/* Lista nativa: o Select do Radix perde o valor escolhido quando as
              opções chegam junto com ele (a sugestão da última nota). */}
          <select
            id="nfeNatureza"
            value={naturezaId}
            onChange={(e) => setNaturezaId(e.target.value)}
            disabled={!items}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{items ? 'Escolha a natureza' : 'Carregando do Bling...'}</option>
            {(items || []).map((n) => (
              <option key={n.id} value={String(n.id)}>
                {n.name}
                {n.id === lastUsedId ? ' (a da última nota no Bling)' : ''}
                {!n.active ? ' (inativa)' : ''}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500">
            É a natureza que vocês já usam nas notas do Bling. O Bling calcula CFOP e impostos por
            ela.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="nfeNcm" className="text-xs font-semibold text-gray-700">
            NCM padrão dos produtos
          </Label>
          <Input
            id="nfeNcm"
            inputMode="numeric"
            value={ncm}
            onChange={(e) => setNcm(e.target.value)}
            placeholder="8711.60.00"
          />
          <p className="text-[11px] text-gray-500">
            Vale para o produto sem NCM próprio (Produtos → Editar). Patinete elétrico: 8711.60.00.
          </p>
        </div>
        <div className="pt-1">
          <Button
            type="submit"
            disabled={saving || !naturezaId}
            className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
          >
            {saving ? 'Salvando...' : 'Salvar configuração das notas'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
