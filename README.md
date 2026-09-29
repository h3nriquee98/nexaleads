# NexaLeads · Nexa Agency

Aplicação web de uso interno da **Nexa Agency** para encontrar empresas e possíveis clientes **por cidade e nicho**, usando a API do **Apify** (Google Maps Scraper). O foco são os melhores leads para vender sites: **empresas sem site próprio** aparecem primeiro.

> Sem cadastro, pagamento nem banco de dados. O acesso é protegido por **uma senha** (variável `NEXALEADS_PASSWORD`). Os leads e status ficam salvos **apenas no navegador deste dispositivo** (localStorage).

---

## Funcionalidades

- **Busca** por cidade, estado (UF) e país, com um ou vários nichos populares ou um nicho personalizado. Também aceita digitar “Franca, SP” direto no campo cidade.
- **Buscar apenas empresas sem site**: opção no formulário que envia o filtro `website: "withoutWebsite"` ao Google Maps Scraper. O Apify traz só empresas sem site, e o servidor confere de novo antes de mostrar os resultados.
- **Apenas empresas com WhatsApp**: opção ao lado da anterior. Descarta leads sem WhatsApp confirmado e sem celular (fixos e sem telefone). O Google Maps não tem esse filtro, então o app busca o dobro de empresas no Apify e entrega até a quantidade pedida. Isso consome mais créditos.
- **Quantidade de leads** configurável, com limite máximo por busca para controlar custos.
- **Integração segura com Apify**: o token fica só no servidor (variáveis de ambiente) e nunca vai para o navegador.
- **Google Places API (opcional)**: segunda fonte de dados, oficial do Google e com resposta em segundos. Com as duas configuradas, você escolhe na busca entre **Apify + Google** (padrão), **Só Google Places** ou **Só Apify**. Os resultados são unidos pelo ID do lugar no Google, então a mesma empresa nunca aparece duas vezes.
- **Pontuação de 0 a 100** e ordenação automática, com etiqueta **“Sem site”**.
- **Cards ou tabela** com nome, categoria/nicho, endereço, telefone, WhatsApp, nota, avaliações, site, Google Maps, Instagram, status do site, pontuação e data da coleta.
- **Filtros**: apenas sem site, com telefone, com WhatsApp, nota mínima, avaliações mínimas, nicho, cidade, status, pontuação mínima, texto livre, somente a última busca e descartados.
- **Ações por lead**: abrir no Google Maps, ligar, abrir WhatsApp (link `wa.me`, **sem envio automático**), copiar dados, marcar como contatado/interessado e descartar/restaurar.
- **Gerar abordagem**: cada lead tem um botão que cria uma mensagem de primeiro contato personalizada, com nome da empresa, cidade, nicho, avaliações e situação do site (sem site, só Instagram ou site próprio). São 3 versões, a mensagem pode ser editada e você pode colocar seu nome. Dá para copiar ou abrir no WhatsApp com o texto já preenchido; o envio é sempre manual. Os modelos ficam em `src/lib/pitch.ts`.
- **Status de funil**: Novo, Contatar, Contatado, Interessado, Sem interesse e Cliente, salvos localmente.
- **Exportação**: CSV (padrão Excel BR: `;` e UTF-8 com BOM), Excel (.xlsx), copiar todos os filtrados e baixar somente os leads sem site.
- **Dashboard**: total de leads, leads sem site, média das notas, pontuação média, leads por nicho e por status (clique para filtrar).
- **Modo demonstração** com dados **fictícios** (sinalizados como “Fictício”) quando o Apify ainda não está configurado.
- Interface escura com a identidade da Nexa, responsiva para computador e celular, toda em português do Brasil.

## Pontuação do lead

| Critério | Pontos |
| --- | --- |
| Não tem site | +40 |
| Tem telefone | +20 |
| Tem WhatsApp | +15 |
| Mais de 20 avaliações | +10 |
| Nota igual ou superior a 4 | +10 |
| Endereço completo (rua, cidade e UF/CEP) | +5 |

Os resultados são ordenados pela maior pontuação. Em caso de empate, vêm primeiro os leads sem site, depois os com mais avaliações e depois os de maior nota. Passe o mouse sobre a pontuação para ver quais critérios o lead atendeu.

### Como os dados são interpretados (sem inventar nada)

- **Status do site**
  - **Sem site**: o Google Maps não informa site, ou o “site” informado é só uma rede social ou agregador (Instagram, Facebook, Linktree, wa.me, iFood…). Nesse caso aparece “só Instagram”, por exemplo.
  - **Possui site**: há um domínio próprio.
  - **Não identificado**: a fonte não traz nenhuma informação sobre site. Nesse caso o lead **não** ganha os +40 pontos.
- **WhatsApp**
  - **Confirmado**: a fonte trouxe um link ou número de WhatsApp.
  - **Provável (celular)**: o telefone é um celular brasileiro (DDD + 9 dígitos começando com 9). É uma inferência, e está sinalizada assim na tela.
  - Números fixos também geram o link `wa.me` (muitas empresas usam WhatsApp Business em fixo), mas não somam pontos.
- **Outra cidade**: se o Google Maps retornar uma empresa de outra cidade, ela recebe a etiqueta “Outra cidade”.
- Empresas **fechadas permanentemente** são descartadas. As fechadas temporariamente recebem uma etiqueta.
- **Instagram** só aparece quando a fonte fornece o link.

---

## Rodando localmente

Pré-requisito: **Node.js 20 ou superior**.

```bash
npm install
cp .env.example .env.local   # preencha o token (opcional para testar em modo demo)
npm run dev
```

Acesse http://localhost:3000. Sem token configurado, o app entra automaticamente em **modo demonstração**.

## Google Places API (opcional)

1. No [Google Cloud Console](https://console.cloud.google.com/), ative a **Places API (New)** no projeto (o faturamento precisa estar ativo).
2. Em **APIs e serviços → Credenciais**, crie uma chave de API e **restrinja-a à Places API (New)**.
3. Cadastre a chave na variável `GOOGLE_MAPS_API_KEY` (na Vercel: Settings → Environment Variables) e faça um novo deploy.

Como funciona:
- Usa o endpoint Text Search (`places:searchText`) com a busca “{nicho} em {cidade}, {UF}, {país}”, em português. Pede apenas os campos necessários: nome, endereço, telefone, site, nota, avaliações, link do Maps e status.
- Cada requisição traz até 20 empresas, e cada consulta chega a no máximo 60. Com “apenas sem site”, pede mais resultados, porque o Google não filtra por site e o servidor descarta os que têm site.
- **Apify + Google**: o Google responde em segundos e os leads já aparecem na lista. O Apify continua em segundo plano e completa a lista quando termina. Cada fonte traz até a quantidade pedida.
- Custo: o Text Search com telefone e site é cobrado no nível “Enterprise” da Places API. Confira a cota gratuita mensal e os preços atuais na [página de preços do Google Maps Platform](https://mapsplatform.google.com/pricing/).

## Senha de acesso (login sem banco de dados)

Para que ninguém use o app (e seus créditos do Apify) sem autorização, todas as páginas e a API exigem login com uma senha única:

- A senha fica na variável de ambiente `NEXALEADS_PASSWORD`. Opcionalmente, defina também `NEXALEADS_SESSION_SECRET` (uma chave aleatória, ex.: `openssl rand -base64 32`).
- Depois de entrar, o navegador recebe um cookie assinado (HMAC-SHA256, `HttpOnly`, válido por 30 dias). Nada é salvo em banco de dados.
- Sem login, as páginas redirecionam para `/login` e a API responde `401`. A verificação acontece no `src/proxy.ts` e de novo dentro de cada rota de API.
- Depois de 5 senhas erradas em 1 minuto, o IP fica bloqueado por 1 minuto.
- **Trocar a senha:** altere `NEXALEADS_PASSWORD` na Vercel e faça um novo deploy. Todos os dispositivos conectados são desconectados.
- Em produção sem `NEXALEADS_PASSWORD`, o app fica **bloqueado** e mostra como configurar. No `npm run dev` sem senha, o acesso é liberado para facilitar o desenvolvimento.
- O botão **Sair** fica no topo da página.

## Configurando o Apify

1. Crie uma conta em https://apify.com (o plano gratuito inclui créditos mensais).
2. Copie seu token em **Console → Settings → API & Integrations → Personal API tokens**.
3. Escolha o Actor. O recomendado é o **Google Maps Scraper**: `compass/crawler-google-places` (https://apify.com/compass/crawler-google-places). Abra a página do Actor uma vez no Console e aceite os termos, se for pedido.
4. Preencha o `.env.local` (local) ou as variáveis de ambiente da Vercel:

```env
APIFY_API_TOKEN=apify_api_xxxxxxxxxxxxxxxxx
APIFY_ACTOR_ID=compass/crawler-google-places
```

### Variáveis opcionais

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `APIFY_MAX_LEADS` | `100` | Máximo de leads por busca (entre 1 e 500). Protege contra custos altos. |
| `APIFY_LANGUAGE` | `pt-BR` | Idioma dos resultados do Google Maps. |
| `APIFY_RUN_TIMEOUT_SECS` | `600` | Tempo máximo de execução do Actor. |
| `APIFY_MAX_CHARGE_USD` | vazio | Teto de gasto por execução em Actors cobrados por evento. |
| `APIFY_ACTOR_INPUT_JSON` | vazio | JSON mesclado ao input do Actor, ex.: `{"scrapeContacts":true}` para tentar obter Instagram/WhatsApp a partir dos sites (gera custo extra). |
| `NEXALEADS_DEMO_MODE` | `false` | `true` força o modo demonstração mesmo com token. |

Input enviado ao Actor (arquivo `src/server/apify.ts`, função `buildActorInput`):

```json
{
  "searchStringsArray": ["Pizzarias", "Docerias"],
  "locationQuery": "Franca, SP, Brasil",
  "maxCrawledPlacesPerSearch": 10,
  "language": "pt-BR",
  "countryCode": "br",
  "skipClosedPlaces": true,
  "scrapePlaceDetailPage": false,
  "scrapeContacts": false,
  "maxImages": 0,
  "maxReviews": 0
}
```

Com a opção **“Buscar apenas empresas sem site”** ligada, o input também leva `"website": "withoutWebsite"` (filtro do próprio Google Maps Scraper). O servidor ainda descarta qualquer resultado que não seja “Sem site”. Empresas que só têm Instagram cadastrado como site podem ficar de fora nesse modo, porque o Google Maps as trata como “com site”.

O limite total informado na tela é dividido entre os nichos. A execução também recebe `maxItems`, que limita a cobrança em Actors “pay per result”. Se trocar de Actor, a normalização (`src/lib/normalize.ts`) já aceita nomes de campos comuns (`title`/`name`, `website`/`websiteUrl`, `totalScore`/`rating`…). Ajuste ali se o novo Actor usar campos diferentes.

### Como a busca funciona

1. O navegador chama `POST /api/search-leads` com cidade, UF, país, nichos e quantidade.
2. O servidor valida os campos, bloqueia chamadas de outras origens, aplica limite de frequência e inicia a execução do Actor no Apify.
3. O navegador acompanha o andamento por `GET /api/search-leads?runId=...` a cada 5 segundos, com indicador de carregamento e botão **Cancelar** (que aborta a execução no Apify).
4. Ao terminar, o servidor busca os itens do dataset, normaliza, calcula a pontuação e devolve a lista ordenada.

Buscas idênticas feitas em sequência (duplo clique, recarregar a página) reaproveitam a mesma execução por 10 minutos. Antes de repetir uma busca recente, o app também pede confirmação para evitar custo duplicado.

## Publicando na Vercel

1. Envie o repositório para o GitHub.
2. Na Vercel: **Add New → Project** → importe o repositório. O framework **Next.js** é detectado automaticamente.
3. Em **Settings → Environment Variables**, cadastre `APIFY_API_TOKEN`, `APIFY_ACTOR_ID`, `GOOGLE_MAPS_API_KEY` (opcional) e `NEXALEADS_PASSWORD` (e, se quiser, `NEXALEADS_SESSION_SECRET` e as opcionais).
4. Faça o deploy. Cada chamada da API é curta, pois o acompanhamento é feito por polling, e funciona no plano Hobby.

> O app já exige senha própria. Se quiser uma camada extra, a Vercel também oferece **Vercel Authentication** (Settings → Deployment Protection).

---

## Segurança e privacidade

- Acesso protegido por senha, com cookie assinado e limite de tentativas (veja “Senha de acesso”).
- O token do Apify só é lido no servidor (`src/server/config.ts`, com `import "server-only"`). Os testes E2E verificam que ele não aparece no HTML, nos bundles JavaScript nem nas respostas da API.
- Validação dos campos no navegador e no servidor (tamanho, caracteres permitidos, UF válida, número de nichos, limite de leads).
- Bloqueio de requisições de outras origens, limite de 8 buscas por minuto por IP, reaproveitamento de buscas idênticas e cancelamento de execuções.
- Links externos abrem com `rel="noopener noreferrer"`. URLs recebidas da fonte são aceitas só se forem `http`/`https`.
- Exportação CSV protegida contra injeção de fórmulas.
- Nenhuma mensagem é enviada automaticamente: WhatsApp e ligação abrem apenas os aplicativos, e o contato é manual.
- Só são exibidos dados públicos de empresas fornecidos pela fonte. Respeite os termos de uso do Apify e do Google Maps e a LGPD ao abordar empresas.

## Testes

```bash
npm test            # testes unitários (pontuação, telefone/WhatsApp, normalização, validação, exportação)
npm run lint        # checagem de tipos TypeScript
npm run build
npm run test:e2e    # testes E2E com Playwright (usa uma API do Apify simulada em e2e/mock-apify.mjs)
```

Os testes E2E cobrem: busca por cidade e nicho, estado de carregamento, polling do Apify, filtro de sem site, ordenação por pontuação, links (Maps, `tel:` e `wa.me`), cópia, exportação CSV/Excel/sem site, salvamento de status após recarregar, descarte, layout no celular (sem rolagem horizontal), erros de limite de requisições, ausência de resultados, validação e bloqueio de outras origens. Se o Playwright não encontrar o Chromium, defina `CHROMIUM_PATH` apontando para o executável.

## Estrutura

```
src/
  app/
    api/search-leads/route.ts   # rota segura: inicia, acompanha e cancela buscas
    api/status/route.ts         # informa modo demo/Apify (sem expor o token)
    layout.tsx, page.tsx, globals.css
  components/                   # interface (busca, dashboard, filtros, cards, tabela, toasts)
  lib/                          # regras compartilhadas: pontuação, normalização, telefone, filtros, exportação, storage
  server/                       # somente servidor: config, cliente Apify, dados demo, proteções
tests/                          # testes unitários (Vitest)
e2e/                            # testes E2E (Playwright) + API do Apify simulada
```
