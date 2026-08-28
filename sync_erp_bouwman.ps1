<#
.SYNOPSIS
    Script de Sincronização Unidirecional: ERP Protheus (SQL Server) -> Nuvem (CRM Preditivo)
.DESCRIPTION
    Este script foi desenhado para ser executado via Windows Task Scheduler.
    Ele conecta ao banco de dados SQL Server (PRD2410), extrai os dados via query (somente-leitura),
    converte os resultados para JSON e envia de forma segura via POST HTTPS (Porta 443) para a API do CRM.
    Zero necessidade de liberação de portas Inbound no Firewall da empresa.
#>

# ==========================================
# 1. CONFIGURAÇÕES GERAIS (Preencher pelo TI)
# ==========================================

# Configurações de Banco de Dados local (SQL Server)
$SqlServerName = "SRV-103"      # Pode ser o IP, nome do servidor ou "localhost" / "SRV-103\Instancia"
$DatabaseName  = "PRD2410"      # O banco de dados do Protheus

# Credenciais do SQL
# Como solicitado, o script usará um banco de dados e um login SQL de leitura.
$SqlUser       = "leitura"
$SqlPassword   = "" # O TI deve preencher com a senha do usuário 'consulta'

# Configurações de API (Nuvem / CRM na Vercel)
# Este é o nosso Edge Hub que receberá os dados.
$ApiEndpoint = "https://crm-pecas.bouwman.com.br/api/sync" # URL nova (conta Vercel corporativa) — a antiga crm-pecas.vercel.app morreu na migração de 23/06/2026
$ApiKey      = "bouwman_sync_ak_7a8b9c0d1e2f3g4h5i" # Chave segura gerada pela equipe de desenvolvimento do CRM

# Log Local do Servidor 
$LogFolder   = "$PSScriptRoot\Logs" # Usará a mesma pasta onde o script está salvo
$LogFile     = "$LogFolder\sync_crm_$(Get-Date -Format 'yyyyMMdd').log"

# ==========================================
# 2. FUNÇÕES AUXILIARES DE LOG
# ==========================================

# Cria a pasta de log se não existir
if (!(Test-Path -Path $LogFolder)) {
    New-Item -ItemType Directory -Path $LogFolder | Out-Null
}

Function Write-Log {
    Param([string]$Message)
    $Stamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $LogLine = "[$Stamp] $Message"
    Write-Host $LogLine
    Add-Content -Path $LogFile -Value $LogLine
}

# ==========================================
# 3. QUERIES SQL (A Extração de Dados)
# ==========================================
# Aqui estão as três entidades (Tabelas) fundamentais que o CRM Preditivo requer.
# Ajustem o número (Ex: SA1010 para a filial 01) se usarem multi-empresa.

$Queries = @{
    "Clientes" = @"
SELECT [FILIAL], [CODIGO_CLIENTE], [LOJA_CLIENTE], [NOME_CLIENTE], [CNPJ_CPF], [CIDADE], [UF], [COD_IBGE], [VENDEDOR_RESP], [NOME_VENDEDOR_RESP], [DDD], [TELEFONE], [CELULAR_WHATSAPP_CONTATO], [EMAIL], [DIAS_SEM_COMPRA], [DATA_ULT_COMPRA], [NF_12M], [STATUS_BASE]
FROM [dbo].[CLIENTE]
"@
    # Nova fonte (e-mail Edilson/TI 27/08/2026): 3 views de BI, uma por estado.
    # O status e derivado da view de origem - a view antiga [dbo].[ORCAMENTO]
    # congelava o STATUS e cancelamentos nao chegavam ao CRM.
    # Abertos e vencidos vem de views SEPARADAS, com as MESMAS colunas
    # (confirmado pelo Edilson em 29/08/2026). O CRM grava as duas como
    # ABERTO e deriva VENCIDO pela validade (getStatusVivo), que e como o
    # app ja trabalha - por isso as duas usam o mesmo processador.
    # Garantias fora do funil - decisao do Vanderlei, 28/08/2026.
    "OrcamentosAbertos" = @"
SELECT [ORCAMENTO_FILIAL], [ORCAMENTO_COD_CLI], [ORCAMENTO_LOJ_CLI], [ORCAMENTO_NOME_CLIENTE], [ORCAMENTO_EMISSAO], [ORCAMENTO_VALIDADE], [ORCAMENTO_PRODUTO], [ORCAMENTO_NUMERO], [ORCAMENTO_QUANTIDADE], [ORCAMENTO_PRECO], [ORCAMENTO_TOTAL], [ORCAMENTO_CUSTO], [ORCAMENTO_CODIGO_VENDEDOR], [ORCAMENTO_NOME_VENDEDOR], [ORCAMENTO_TIPO_OPERACAO]
FROM [dbo].[V_BI_SUPRIMENTOS_ORCAMENTOS]
WHERE [ORCAMENTO_TIPO_OPERACAO] NOT LIKE '%GARANTIA%'
"@
    "OrcamentosVencidos" = @"
SELECT [ORCAMENTO_FILIAL], [ORCAMENTO_COD_CLI], [ORCAMENTO_LOJ_CLI], [ORCAMENTO_NOME_CLIENTE], [ORCAMENTO_EMISSAO], [ORCAMENTO_VALIDADE], [ORCAMENTO_PRODUTO], [ORCAMENTO_NUMERO], [ORCAMENTO_QUANTIDADE], [ORCAMENTO_PRECO], [ORCAMENTO_TOTAL], [ORCAMENTO_CUSTO], [ORCAMENTO_CODIGO_VENDEDOR], [ORCAMENTO_NOME_VENDEDOR], [ORCAMENTO_TIPO_OPERACAO]
FROM [dbo].[V_BI_SUPRIMENTOS_ORCAMENTOS_VENC]
WHERE [ORCAMENTO_TIPO_OPERACAO] NOT LIKE '%GARANTIA%'
"@
    # OBS do TI: considerar apenas Status_orcamento = 'Cancelado'.
    "OrcamentosCancelados" = @"
SELECT [Codigo_Filial], [Num_orc], [Codigo_item], [Codigo_cliente], [Loja_cliente], [Nome_cliente], [Data_orcamento], [Quantidade], [Valor], [Codigo_vendedor], [Nome_vendedor], [Descricao_motivo], [Data_Cancelamento], [Status_orcamento]
FROM [dbo].[V_BI_ORCAMENTOS_CANCELADOS]
WHERE [Status_orcamento] = 'Cancelado'
"@
    # OBS do TI: considerar somente registros com NUMERO_ORCAMENTO preenchido.
    "OrcamentosFaturados" = @"
SELECT [FILIAL], [CLIENTE], [LOJA], [A1_NOME], [DATA_ORCAMENTO], [CODIGO], [NUMERO_ORCAMENTO], [QUANTIDADE], [UNITARIO], [TOTAL], [CUSTO], [COD_VENDEDOR], [VENDEDOR]
FROM [dbo].[V_BI_SUPRIMENTOS_VENDAS]
WHERE [NUMERO_ORCAMENTO] IS NOT NULL AND LTRIM(RTRIM([NUMERO_ORCAMENTO])) <> ''
"@
    "Maquinas" = @"
SELECT [FILIAL], [FABRICANTE], [MODELO], [CATEGORIA], [ESTADO], [CODIGO], [CHASSI], [REGIAO], [QUANTIDADE], [COD_VENDEDOR], [NOME_VENDEDOR], [EMISSAO], [NOTA_FISCAL], [SERIE], [UF_NOTA], [COD_CLIENTE], [LOJA_CLIENTE], [NOME_CLIENTE], [UF_CLIENTE], [ENDERECO], [COD_MUN], [MUNICIPIO], [UF_MUN_CLIENTE], [DDD], [TELEFONE], [PRIMEIRA_COMPRA], [ULTIMA_COMPRA], [NUMERO_DE_COMPRAS], [EMAIL], [TOTAL], [TIPO_VENDA]
FROM [dbo].[PARQUEDEMAQUINAS]
"@
}

# ==========================================
# 4. INÍCIO DA EXECUÇÃO
# ==========================================

Write-Log "Iniciando processo de sincronizacao ERP -> CRM Nuvem..."

try {
    # Garante negociação de cifras de rede seguras no Powershell mais antigo (TLS 1.2)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    # A) Montando a String de Conexão com o SQL Server
    if ([string]::IsNullOrWhiteSpace($SqlUser)) {
        Write-Log "Usando Autenticacao do Windows (Integrated Security=True)"
        $ConnectionString = "Server=$SqlServerName;Database=$DatabaseName;Integrated Security=True;"
    } else {
        Write-Log "Usando Autenticacao via Usuario SQL Server"
        $ConnectionString = "Server=$SqlServerName;Database=$DatabaseName;User Id=$SqlUser;Password=$SqlPassword;"
    }
    
    # B) Conectando
    $Connection = New-Object System.Data.SqlClient.SqlConnection
    $Connection.ConnectionString = $ConnectionString
    
    Write-Log "Tentando conexao com o banco: $SqlServerName (DB: $DatabaseName)"
    $Connection.Open()

    $PayloadObj = @{}
    $TotalExtracted = 0

    # C) Executando e Processando as Queries (Clientes, Orcamentos, Maquinas)
    foreach ($Key in $Queries.Keys) {
        $QueryText = $Queries[$Key]
        
        $Command = $Connection.CreateCommand()
        $Command.CommandText = $QueryText
        $Command.CommandTimeout = 180 # TimeOut longo caso a tabela seja muito grande
        
        $DataAdapter = New-Object System.Data.SqlClient.SqlDataAdapter $Command
        $DataTable = New-Object System.Data.DataTable
        $DataAdapter.Fill($DataTable) | Out-Null

        $RowCount = $DataTable.Rows.Count
        Write-Log "Extracao SQL de '$Key' Concluida! Linhas encontradas: $RowCount"
        $TotalExtracted += $RowCount

        # Converte em array de objetos formatados
        $DataList = @()
        foreach ($Row in $DataTable) {
            $RowObj = New-Object PSObject
            foreach ($Col in $DataTable.Columns) {
                $RowObj | Add-Member -MemberType NoteProperty -Name $Col.ColumnName -Value $Row.$($Col.ColumnName)
            }
            $DataList += $RowObj
        }
        
        # Adiciona a lista extraída no nó Mestre do objeto JSON
        $PayloadObj[$Key] = $DataList
    }
    
    $Connection.Close()

    # D) Enviando em LOTES (evita o limite de 4.5MB da Vercel)
    $BatchSize = 500  # Registros por envio

    if ($TotalExtracted -gt 0) {
        Write-Log "Iniciando envio em lotes (max $BatchSize registros por requisicao)..."
        
        $Headers = @{
            "Authorization" = "Bearer $ApiKey"
            "Content-Type"  = "application/json; charset=utf-8"
        }

        foreach ($Key in $PayloadObj.Keys) {
            $AllRecords = $PayloadObj[$Key]
            $Total = $AllRecords.Count
            
            if ($Total -eq 0) { continue }

            $Batches = [Math]::Ceiling($Total / $BatchSize)
            Write-Log "Enviando '$Key': $Total registros em $Batches lote(s)..."

            for ($i = 0; $i -lt $Total; $i += $BatchSize) {
                $End = [Math]::Min($i + $BatchSize - 1, $Total - 1)
                $Chunk = $AllRecords[$i..$End]
                $BatchNum = [Math]::Floor($i / $BatchSize) + 1

                # Monta o payload parcial (só a entidade atual)
                $PartialPayload = @{}
                $PartialPayload[$Key] = $Chunk

                $JsonPayload = $PartialPayload | ConvertTo-Json -Depth 6 -Compress

                # Garante codificação UTF-8 no Body do POST (Impede que ç, á, ó virem ?)
                $JsonBytes = [System.Text.Encoding]::UTF8.GetBytes($JsonPayload)

                Write-Log "  -> Lote $BatchNum/$Batches de '$Key' ($($Chunk.Count) registros)..."
                
                $Response = Invoke-RestMethod -Uri $ApiEndpoint -Method Post -Headers $Headers -Body $JsonBytes
                Write-Log "  -> OK! Resposta: $($Response.message)"
                
                Start-Sleep -Milliseconds 300  # Pequena pausa para não sobrecarregar
            }
        }

        Write-Log "Todos os lotes enviados com sucesso!"

        # E) Cleanup de fantasmas: orcamentos no Supabase que o ERP nao devolve mais.
        # Na nova fonte, "ativo" = estar na view de abertos OU na de vencidos.
        # Quem sai das duas ou cancelou (view de cancelados atualiza) ou faturou
        # (view de vendas atualiza) ou foi arquivado - so nesse caso o cleanup apaga.
        if ($PayloadObj.ContainsKey("OrcamentosAbertos") -or $PayloadObj.ContainsKey("OrcamentosVencidos")) {
            $idsAtivos = @()
            foreach ($chave in @("OrcamentosAbertos", "OrcamentosVencidos")) {
                if (-not $PayloadObj.ContainsKey($chave)) { continue }
                foreach ($o in $PayloadObj[$chave]) {
                    $prod = "$($o.ORCAMENTO_PRODUTO)".Trim()
                    $idsAtivos += "$($o.ORCAMENTO_FILIAL)_$($o.ORCAMENTO_NUMERO)_$prod"
                }
            }
            Write-Log "Cleanup: enviando $($idsAtivos.Count) IDs ativos (ABERTO/VENCIDO) ao endpoint de limpeza..."
            $CleanupPayload = @{ OrcamentosAtivos = $idsAtivos } | ConvertTo-Json -Depth 4 -Compress
            $CleanupBytes = [System.Text.Encoding]::UTF8.GetBytes($CleanupPayload)
            try {
                $CleanupResp = Invoke-RestMethod -Uri "$ApiEndpoint/cleanup" -Method Post -Headers $Headers -Body $CleanupBytes
                Write-Log "Cleanup OK: $($CleanupResp.message)"
            } catch {
                Write-Log "AVISO cleanup falhou (sync principal OK): $($_.Exception.Message)"
            }
        }
    } else {
        Write-Log "AVISO: As queries retornaram 0 resultados somados. O POST foi ignorado."
    }

} catch {
    # Em caso de qualquer pane de Banco, Criptografia ou API, é gravado no log local.
    Write-Log "ERRO CRITICO DURANTE A SINCRONIZACAO: $($_.Exception.Message)"
    # Sai retornando erro ao Agendador de Tarefas do Windows
    exit 1
}

Write-Log "Fim da rotina."
exit 0
