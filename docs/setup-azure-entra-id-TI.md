# Configuração Azure Entra ID — CRM Peças

**Para:** Equipe de TI
**Solicitante:** Fabiano Luz
**Objetivo:** Habilitar login corporativo Microsoft (SSO) no CRM Peças

---

## Contexto

O CRM Peças (aplicação web interna) precisa permitir login dos colaboradores Bouwman através das contas Microsoft corporativas (`@bouwman.com.br`). A autenticação será intermediada pelo Supabase Auth, que atua como cliente OAuth/OIDC do Microsoft Entra ID.

**Resultado esperado deste setup:** um App Registration dedicado ao CRM Peças, dentro do tenant Bouwman, que entregue 3 credenciais ao desenvolvedor.

---

## O que precisa ser entregue ao desenvolvedor

Ao final do processo, repassar **3 valores**:

| Valor | Onde aparece | Sensibilidade |
|-------|--------------|---------------|
| **Application (client) ID** | Tela "Overview" do App Registration | Pode ser compartilhado por canal interno |
| **Directory (tenant) ID** | Tela "Overview" do App Registration | Pode ser compartilhado por canal interno |
| **Client Secret (Value)** | Gerado em "Certificates & secrets" | ⚠️ **Confidencial** — usar cofre de senhas / canal seguro |

---

## Passo a passo

### 1. Acessar o Azure Portal

1. Abrir [portal.azure.com](https://portal.azure.com)
2. Login com conta administradora do tenant **Bouwman**
3. Barra de busca → **"Microsoft Entra ID"**
4. Menu lateral → **"App registrations"**
5. Clicar em **"+ New registration"**

### 2. Registrar o aplicativo

Preencher exatamente assim:

| Campo | Valor |
|-------|-------|
| **Name** | `CRM Pecas - Bouwman` |
| **Supported account types** | ✅ **Accounts in this organizational directory only (Bouwman only - Single tenant)** |
| **Redirect URI – Platform** | `Web` |
| **Redirect URI – URL** | `https://kpvznpegolvxlkrypdgq.supabase.co/auth/v1/callback` |

> ⚠️ A Redirect URI **deve ser exatamente** essa string (copiar e colar). Qualquer diferença, mesmo de `/` no final, faz o login falhar com erro `redirect_uri_mismatch`.

Clicar em **"Register"**.

### 3. Anotar Client ID e Tenant ID

Na tela "Overview" do app recém-criado, copiar:

- **Application (client) ID**
- **Directory (tenant) ID**

### 4. Gerar o Client Secret

1. Menu lateral do app → **"Certificates & secrets"**
2. Aba **"Client secrets"**
3. Clicar em **"+ New client secret"**
4. Preencher:
   - **Description:** `CRM Pecas - Producao`
   - **Expires:** `24 months` (máximo permitido)
5. Clicar em **"Add"**

⚠️ **Atenção crítica:** após criado, a coluna **"Value"** mostra o segredo **uma única vez**. Copiar imediatamente e guardar em cofre seguro. Se a tela for fechada/recarregada, o valor fica mascarado para sempre e é necessário gerar um novo secret.

> 📅 **Anotar no calendário corporativo** a data de expiração (24 meses à frente) com lembrete 30 dias antes, para renovação. Quando o secret expira, o login para de funcionar **para todos os usuários**.

### 5. Configurar permissões de API

1. Menu lateral do app → **"API permissions"**
2. As permissões delegadas padrão do Microsoft Graph já incluem:
   - `User.Read`
   - `openid`
   - `profile`
   - `email`
3. Adicionar `offline_access` (necessária para refresh token):
   - Clicar em **"+ Add a permission"**
   - **Microsoft Graph** → **Delegated permissions**
   - Marcar `offline_access`
   - Clicar em **"Add permissions"**
4. (Opcional, mas recomendado) Clicar em **"Grant admin consent for Bouwman"** para que os usuários não vejam a tela de consentimento no primeiro login.

### 6. (Opcional) Restringir acesso por grupo

Se desejarem limitar quais usuários do tenant podem entrar no app (além da whitelist por domínio que será feita no código):

1. Menu lateral do app → **"Enterprise applications"** (link no topo da Overview)
2. Aba **"Properties"**
3. Marcar **"Assignment required?"** como **Yes**
4. Aba **"Users and groups"** → adicionar grupos/usuários autorizados

Sem isso, qualquer conta `@bouwman.com.br` do tenant consegue iniciar login (e o app filtra no callback). Com isso, só os atribuídos passam pelo Azure.

---

## Resumo do que enviar ao desenvolvedor

Depois de concluir os passos 1-5, encaminhar uma mensagem assim:

```
App Registration CRM Peças criado.

AZURE_CLIENT_ID:     <valor copiado no passo 3>
AZURE_TENANT_ID:     <valor copiado no passo 3>
AZURE_CLIENT_SECRET: <valor copiado no passo 4 — enviar por canal seguro>

Expiração do secret: <dd/mm/aaaa>
```

---

## Observações sobre domínios

A Redirect URI configurada aponta para o **Supabase** (`kpvznpegolvxlkrypdgq.supabase.co`), não para o domínio do app. Isso significa que **não é necessário atualizar o Azure** quando o app for migrado do domínio Vercel atual para o domínio definitivo da Bouwman — esse fluxo será tratado dentro do Supabase Dashboard.

Portanto, o App Registration aqui criado é **uma configuração de vida longa**, que só precisará ser revisitada para:

- Renovar o Client Secret antes da expiração (24 meses)
- Eventual mudança de tenant ou descomissionamento do app
