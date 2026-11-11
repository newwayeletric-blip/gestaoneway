import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { MailSettingsService, type MailSettings as MailSettingsData } from '@/services/api'
import { CheckCircle2, Mail, Send, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

// Configurações → E-mail (só o admin da rede): o e-mail que manda o link de
// "Esqueci minha senha". Padrão: Gmail da empresa com senha de app.
export default function MailSettings() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [current, setCurrent] = useState<MailSettingsData | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [senderName, setSenderName] = useState('New Way Eletric')
  const [host, setHost] = useState('smtp.gmail.com')
  const [port, setPort] = useState('465')
  const [saving, setSaving] = useState(false)

  const show = (data: MailSettingsData) => {
    setCurrent(data)
    if (data.username) setEmail(data.username)
    // Antes de ligar, o nome é o padrão do PocketBase ("Support").
    if (data.enabled && data.senderName) setSenderName(data.senderName)
    if (data.enabled && data.host) setHost(data.host)
    if (data.enabled && data.port) setPort(String(data.port))
  }

  useEffect(() => {
    MailSettingsService.get()
      .then(show)
      .catch((err) => console.error('Error loading mail settings:', err))
  }, [])

  const handleSave = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const saved = await MailSettingsService.save({
        email,
        password,
        host,
        port: Number(port),
        senderName,
      })
      show(saved)
      setPassword('')
      toast({
        title: 'E-mail de envio ligado!',
        description: `Mandamos um e-mail de teste para ${user?.email}. A recuperação de senha já funciona.`,
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
          <Mail className="h-4 w-4" /> E-mail de envio do sistema
        </CardTitle>
        <CardDescription>
          É por este e-mail que o vendedor recebe o link de "Esqueci minha senha" e cria uma senha
          nova sozinho.
        </CardDescription>
      </CardHeader>

      {current &&
        (current.enabled ? (
          <div className="mb-5 flex items-center gap-2 rounded-lg bg-[#E8F7EF] px-3 py-2 text-sm text-[#0A8F5C]">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Ligado: envia por {current.username}
          </div>
        ) : (
          <div className="mb-5 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <XCircle className="h-4 w-4 shrink-0" /> Desligado: "Esqueci minha senha" ainda não
            envia e-mail.
          </div>
        ))}

      <div className="mb-5 max-w-2xl rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        <p className="font-semibold text-gray-900">Com um Gmail da empresa:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Ligue a <strong>verificação em duas etapas</strong> da conta Google
            (myaccount.google.com → Segurança).
          </li>
          <li>
            Abra{' '}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#0A8F5C] underline"
            >
              myaccount.google.com/apppasswords
            </a>
            , crie uma senha de app com o nome "Sistema New Way" e copie as 16 letras.
          </li>
          <li>Cole abaixo e salve. Um e-mail de teste chega para você na hora.</li>
        </ol>
      </div>

      <form onSubmit={handleSave} className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="mailEmail" className="text-xs font-semibold text-gray-700">
            E-mail que envia
          </Label>
          <Input
            id="mailEmail"
            type="email"
            required
            placeholder="empresa@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="mailPassword" className="text-xs font-semibold text-gray-700">
            Senha de app
          </Label>
          <Input
            id="mailPassword"
            type="password"
            autoComplete="new-password"
            required={!current?.hasPassword}
            placeholder={
              current?.hasPassword ? 'Já salva: deixe em branco para manter' : 'abcd efgh ijkl mnop'
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="mailSender" className="text-xs font-semibold text-gray-700">
            Nome que aparece para quem recebe
          </Label>
          <Input
            id="mailSender"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mailHost" className="text-xs text-gray-600">
            Servidor SMTP (Gmail: smtp.gmail.com)
          </Label>
          <Input id="mailHost" value={host} onChange={(e) => setHost(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mailPort" className="text-xs text-gray-600">
            Porta (Gmail: 465)
          </Label>
          <Input
            id="mailPort"
            type="number"
            min="1"
            max="65535"
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </div>
        <div className="pt-2 sm:col-span-2">
          <Button
            type="submit"
            disabled={saving}
            className="bg-[#0A8F5C] hover:bg-[#087A4D] text-white"
          >
            <Send className="h-4 w-4 mr-2" />
            {saving ? 'Enviando teste...' : 'Salvar e enviar e-mail de teste'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
