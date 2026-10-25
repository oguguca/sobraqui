# Sobraqui

Controle financeiro pessoal: contas, cartões e faturas, orçamento, metas, relatórios e importação de extratos (Nubank CSV/OFX).

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 + shadcn/ui · Prisma 7 + Neon (PostgreSQL) · Better Auth · Zod · React Hook Form · Recharts · Vitest.

## Rodar localmente

```bash
npm install                 # também gera o Prisma Client (postinstall)
cp .env.example .env.local  # preencha (veja abaixo)
npm run db:migrate          # aplica as migrações no banco de DIRECT_URL
npm run dev                 # http://localhost:3000
```

Crie sua conta em `/cadastro` com `ALLOW_SIGNUP="true"`. Depois mude para `"false"` e reinicie o servidor.

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Conexão do app (URL do Neon **com** `-pooler`) |
| `DIRECT_URL` | Migrações (URL do Neon **sem** `-pooler`) |
| `BETTER_AUTH_SECRET` | Assina sessões. 32+ caracteres aleatórios |
| `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL` | URL pública do app |
| `ALLOW_SIGNUP` | Libera o cadastro (`true`/`false`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | E-mail de recuperação de senha. Sem eles, em dev o link aparece no terminal |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Login com Google (opcional) |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Gera o Prisma Client e o build de produção |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Testes unitários (regras financeiras, importação, datas, dinheiro) |
| `npm run test:integration` | Testes contra o banco real: RLS, isolamento entre usuários, CHECKs, saldos. Criam usuários `@isolation.example.test` e apagam tudo ao final |
| `npm run db:migrate` | `prisma migrate deploy` |

## Deploy na Vercel

1. Importe o repositório na Vercel. O framework Next.js é detectado sozinho; a região fica em `gru1` (São Paulo, igual ao Neon `sa-east-1`) via `vercel.json`.
2. Em **Settings → Environment Variables**, cadastre as variáveis acima com valores de produção. `BETTER_AUTH_URL` deve ser `https://seu-dominio`.
3. Rode as migrações de forma controlada, antes de publicar a versão que depende delas: `DIRECT_URL=... npm run db:migrate` na sua máquina ou num passo de CI. O build não migra o banco.
4. Google: adicione `https://seu-dominio/api/auth/callback/google` nos URIs de redirecionamento do cliente OAuth.
5. Recuperação de senha: crie uma conta na Resend, verifique o domínio do remetente e preencha `RESEND_API_KEY` e `EMAIL_FROM`.

## Decisões

- **Dinheiro em centavos (`BIGINT`)**, convertidos para `number` só na borda do banco (`src/server/db.ts`). Nenhum cálculo usa ponto flutuante.
- **Regras contábeis** em `src/domain/ledger.ts`. A compra no cartão é a despesa, reconhecida por parcela. O pagamento da fatura (`invoice_payment`) só move dinheiro da conta para o cartão e nunca conta como despesa. Transferências não são receita nem despesa. Estornos abatem a despesa da categoria.
- **Isolamento por usuário em três camadas:**
  1. Toda consulta filtra por `user_id`.
  2. As chaves estrangeiras são compostas `(user_id, id)`, então nada referencia dado de outro usuário.
  3. RLS no Postgres: cada requisição roda numa transação com `SET LOCAL ROLE app_user` e `app.user_id` (`withUser`). Sem o `app.user_id`, nenhuma linha é visível. Os testes de integração comprovam isso.
- **Better Auth** com tabelas no próprio Neon. O cadastro é controlado por `ALLOW_SIGNUP`. Há rate limit no banco e política de senha (10+ caracteres, maiúscula, minúscula, número) validada no servidor.
- **Cache Components desligado:** toda página é autenticada e precisa refletir o banco a cada requisição.
- **Recorrências** viram lançamentos pendentes ao abrir as telas (idempotente). Não há cron.

## Nubank

Duas formas de trazer as movimentações, ambas com deduplicação, revisão antes de gravar e opção de desfazer:

1. **Open Finance (automático)** via [Meu Pluggy](https://meu.pluggy.ai), gratuito para uso pessoal (até 5 conexões, atualização diária).
   - Conecte o Nubank no meu.pluggy.ai.
   - No dashboard.pluggy.ai, crie uma conexão com o conector **MeuPluggy** na sua aplicação.
   - Preencha `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET` e `PLUGGY_ITEM_IDS`.
   - Na tela **Importação**, escolha para qual conta ou cartão cada conta do Open Finance vai e clique em **Buscar transações**.
   - Pix, débito e boleto viram a forma de pagamento certa. Compras no cartão entram na fatura da data, com parcelas agrupadas. O pagamento da fatura não é contado duas vezes. Aplicações e resgates (Caixinhas/RDB) vêm desmarcados.
2. **Arquivos CSV/OFX** exportados pelo app, para outros bancos ou quando não houver conexão.

O Nubank não tem API pública para pessoa física, e nunca pedimos nem guardamos senha bancária.
