# Copia para este computador as copias diarias e mensais do banco do sistema
# de gestao que o VPS gera (deploy/servidor/backup-diario.sh). A pasta fica no
# OneDrive, que tambem a envia para a nuvem da Microsoft: assim existe uma
# copia fora da Hostinger.
# Roda pela tarefa agendada "New Way - copia do sistema" (todo dia as 12h e
# 5 min depois de entrar no Windows; se o PC estava desligado, roda quando
# ligar). So baixa o que ainda nao esta aqui, confere o SHA256 de cada arquivo
# e guarda as 60 diarias mais recentes e todas as mensais.
$ErrorActionPreference = 'Stop'
$Servidor = 'root@187.127.52.64'
$Chave = Join-Path $env:USERPROFILE '.ssh\newway_hostinger_ed25519'
$Destino = Join-Path $env:USERPROFILE 'OneDrive\Backups New Way\Sistema de gestao'
$Ssh = Join-Path $env:WINDIR 'System32\OpenSSH\ssh.exe'
$Scp = Join-Path $env:WINDIR 'System32\OpenSSH\scp.exe'
$Log = Join-Path $Destino 'copias.log'

function Registrar($texto) {
  Add-Content -Path $Log -Value ('{0:yyyy-MM-dd HH:mm} {1}' -f (Get-Date), $texto)
}

try {
  foreach ($tipo in 'dia', 'mes') {
    $pasta = Join-Path $Destino $tipo
    New-Item -ItemType Directory -Force -Path $pasta | Out-Null
    $remotos = & $Ssh -i $Chave -o BatchMode=yes -o ConnectTimeout=20 $Servidor `
      "cd /root/backups/gestaoneway/$tipo 2>/dev/null && sha256sum gestaoneway-*.tar.gz 2>/dev/null; true"
    if ($LASTEXITCODE -ne 0) { throw "nao consegui falar com o servidor ($tipo)" }
    foreach ($linha in $remotos) {
      if ($linha -notmatch '^([0-9a-f]{64})\s+(gestaoneway-\d{8}-\d{4}\.tar\.gz)$') { continue }
      $hash = $Matches[1]
      $nome = $Matches[2]
      if (Test-Path (Join-Path $pasta $nome)) { continue }
      Push-Location $pasta
      try {
        & $Scp -i $Chave -o BatchMode=yes -q "${Servidor}:/root/backups/gestaoneway/$tipo/$nome" "$nome.parcial"
        if ($LASTEXITCODE -ne 0) { throw "falha ao baixar $tipo/$nome" }
        if ((Get-FileHash "$nome.parcial" -Algorithm SHA256).Hash.ToLower() -ne $hash) {
          throw "copia $tipo/$nome chegou diferente do servidor"
        }
        Move-Item "$nome.parcial" $nome
        Registrar "baixada $tipo/$nome"
      } finally {
        Remove-Item "$nome.parcial" -ErrorAction SilentlyContinue
        Pop-Location
      }
    }
  }
  Get-ChildItem (Join-Path $Destino 'dia') -Filter 'gestaoneway-*.tar.gz' |
    Sort-Object Name -Descending | Select-Object -Skip 60 | Remove-Item
  Registrar 'ok'
} catch {
  Registrar "ERRO: $($_.Exception.Message)"
  exit 1
}
