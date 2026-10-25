import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  FileUp,
  KeyRound,
  Landmark,
  Lock,
  Nfc,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  Wallet,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { BrandAurora } from "@/components/motion/brand-aurora";
import { MoneyCountUp } from "@/components/motion/money-count-up";
import { Reveal } from "@/components/motion/reveal";
import { Spotlight } from "@/components/motion/spotlight";
import BlurText from "@/components/reactbits/BlurText";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Sobraqui · saiba quanto sobra no fim do mês" },
  description:
    "Finanças pessoais em reais: entradas, saídas, cartão e fatura no ciclo certo, categorias automáticas e Nubank via Open Finance, sem pedir sua senha do banco.",
};

const PILLARS = [
  { icon: KeyRound, title: "Sem senha do banco", text: "A conexão é autorizada no app do banco." },
  { icon: CalendarClock, title: "Fatura no ciclo certo", text: "Respeita o fechamento e o vencimento." },
  { icon: Sparkles, title: "Categorias automáticas", text: "Mercado, transporte, assinaturas…" },
  { icon: Wallet, title: "Débito separado da fatura", text: "O que já saiu e o que ainda vai sair." },
];

const FEATURES = [
  {
    icon: Wallet,
    title: "Entradas e saídas",
    text: "Salário, freelance e cada gasto com a forma de pagamento: Pix, boleto, débito ou crédito parcelado.",
  },
  {
    icon: CreditCard,
    title: "Cartão e fatura",
    text: "Cada compra cai na fatura certa, com parcelas distribuídas e limite disponível.",
  },
  {
    icon: Tags,
    title: "Categorias automáticas",
    text: "Reconhece iFood, Uber, Shopee e outros, e aprende com o que você já categorizou.",
  },
  {
    icon: PiggyBank,
    title: "Orçamentos e metas",
    text: "Defina um teto por categoria e acompanhe quanto falta para cada objetivo.",
  },
  {
    icon: FileUp,
    title: "Importação de extrato",
    text: "Arquivos CSV e OFX com prévia antes de salvar e sem lançamentos duplicados.",
  },
];

const STEPS = [
  { title: "Crie sua conta", text: "E-mail e senha, ou Google. Seus dados ficam separados dos de qualquer outra pessoa." },
  {
    title: "Conecte ou importe",
    text: "Autorize o Nubank pelo Open Finance, importe um extrato ou lance tudo à mão. Você escolhe.",
  },
  { title: "Veja quanto sobra", text: "O painel junta saldo, fatura a pagar, gastos por categoria e o que vence em breve." },
];

const SECURITY = [
  { icon: KeyRound, text: "Nunca pedimos nem guardamos a senha do seu banco." },
  { icon: Lock, text: "Cada registro é isolado por usuário no próprio banco de dados." },
  { icon: ShieldCheck, text: "Chaves de integração ficam só no servidor, nunca no navegador." },
  { icon: Trash2, text: "Você pode apagar os dados importados ou zerar tudo quando quiser." },
];

export default async function AboutPage() {
  // Lê ALLOW_SIGNUP em tempo de execução, não no build.
  await connection();
  const signupEnabled = process.env.ALLOW_SIGNUP === "true";
  const start = signupEnabled
    ? { href: "/cadastro", label: "Criar minha conta" }
    : { href: "/login", label: "Entrar no Sobraqui" };

  return (
    <div className="min-h-svh overflow-x-clip bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/sobre" aria-label="Sobraqui, início" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Brand />
          </Link>
          <nav aria-label="Seções" className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#funcionalidades" className="transition-colors hover:text-foreground">
              Funcionalidades
            </a>
            <a href="#como-funciona" className="transition-colors hover:text-foreground">
              Como funciona
            </a>
            <a href="#seguranca" className="transition-colors hover:text-foreground">
              Segurança
            </a>
          </nav>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/login">Entrar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 -z-10 mx-auto h-[36rem] max-w-4xl rounded-full bg-[radial-gradient(closest-side,var(--color-brand-soft),transparent)] opacity-90"
          />
          <BrandAurora className="pointer-events-none absolute inset-x-0 -top-16 -z-10 h-[34rem] opacity-70 [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24 lg:pb-28">
            <div className="text-center lg:text-left">
              <Reveal trigger="mount" distance={12}>
                <Eyebrow>Finanças pessoais, em reais</Eyebrow>
              </Reveal>
              <BlurText
                as="h1"
                text="Saiba quanto sobra no fim do mês."
                highlight={["sobra"]}
                highlightClassName="text-[#6b4fd8] dark:text-[#9b7bea]"
                trigger="load"
                delay={90}
                className="mt-5 justify-center text-[2.75rem] leading-[1.04] font-bold tracking-tight sm:text-6xl lg:justify-start lg:text-7xl"
              />
              <Reveal trigger="mount" delay={0.45} distance={16}>
                <p className="mx-auto mt-6 max-w-xl text-lg text-pretty text-muted-foreground lg:mx-0">
                  Entradas, gastos, cartão e fatura num só lugar. O Sobraqui separa o que já saiu da conta do que você
                  ainda vai pagar e mostra o que realmente sobra.
                </p>
              </Reveal>
              <Reveal trigger="mount" delay={0.6} distance={16} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
                  <Link href={start.href}>
                    {start.label} <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="h-12 rounded-full px-6 text-base">
                  <a href="#como-funciona">Ver como funciona</a>
                </Button>
              </Reveal>
            </div>

            <Reveal trigger="mount" delay={0.3} distance={40}>
              <HeroPreview />
            </Reveal>
          </div>
        </section>

        {/* Pilares */}
        <section aria-label="Destaques" className="border-y bg-card/60">
          <Reveal stagger={0.08} distance={16} className="mx-auto grid max-w-6xl grid-cols-1 gap-px px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {PILLARS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3 py-7 lg:px-5 lg:first:pl-0">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-[#6b4fd8] dark:text-brand-accent">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span>
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-muted-foreground">{text}</span>
                </span>
              </div>
            ))}
          </Reveal>
        </section>

        {/* Funcionalidades */}
        <section id="funcionalidades" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <Reveal>
              <SectionHeading
                eyebrow="Funcionalidades"
                title="O que você precisa, sem planilha"
                text="Feito para quem quer entender o próprio dinheiro sem passar o domingo conferindo extrato."
              />
            </Reveal>

            <Reveal stagger={0.08} className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <article className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#3b1f57] via-[#2b1640] to-[#1f0f30] p-7 text-white ring-1 ring-white/10 md:col-span-2 lg:row-span-2">
                <span aria-hidden className="absolute -top-20 -right-16 size-72 rounded-full bg-[#9b7bea]/25 blur-3xl" />
                <span aria-hidden className="absolute top-7 right-7 size-12 rounded-full bg-[#c8f04a]" />
                <div className="relative max-w-md">
                  <span className="grid size-11 place-items-center rounded-xl bg-white/10">
                    <Landmark className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-6 text-2xl font-semibold tracking-tight">Nubank pelo Open Finance</h3>
                  <p className="mt-3 text-white/75">
                    Conecte pelo Meu Pluggy e autorize no próprio app do banco. O Sobraqui puxa conta, cartão, faturas e
                    parcelas, e um botão sincroniza tudo de novo quando você quiser.
                  </p>
                  <ul className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="O que é sincronizado">
                    {["Saldo da conta", "Compras no cartão", "Faturas", "Parcelas", "Limite disponível"].map((t) => (
                      <li key={t} className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                        {t}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-6 text-xs text-white/60">
                    Os bancos atualizam esses dados uma vez por dia. Juros e IOF ainda não informados podem ser
                    ajustados com o valor do app.
                  </p>
                </div>
              </article>

              {FEATURES.map(({ icon: Icon, title, text }) => (
                <Spotlight key={title} className="h-full">
                  <article>
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-[#6b4fd8] dark:text-brand-accent">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-5 font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
                  </article>
                </Spotlight>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="scroll-mt-20 border-t bg-card/40">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
            <Reveal>
              <SectionHeading eyebrow="Como funciona" title="Em três passos" />
            </Reveal>
            <Reveal stagger={0.12} className="mt-14 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <div key={s.title} className="relative rounded-3xl border bg-background p-7">
                  <span className="text-5xl font-bold tracking-tight text-[#6b4fd8]/25 tabular dark:text-[#9b7bea]/30">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Segurança */}
        <section id="seguranca" className="scroll-mt-20 border-t">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <SectionHeading
                align="left"
                eyebrow="Segurança"
                title="Seu dinheiro é assunto seu"
                text="Nada de robô entrando no seu internet banking. A conexão usa o Open Finance regulado pelo Banco Central, e você revoga o acesso no Meu Pluggy quando quiser."
              />
            </Reveal>
            <Reveal stagger={0.08} distance={20} className="grid gap-3">
              {SECURITY.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-4 rounded-2xl border bg-card px-5 py-4">
                  <Icon className="size-5 shrink-0 text-[#6b4fd8] dark:text-brand-accent" aria-hidden />
                  <span className="text-sm">{text}</span>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Chamada final */}
        <section className="px-4 pb-24 sm:px-6">
          <Reveal distance={40} className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#3b1f57] via-[#2b1640] to-[#1f0f30] px-6 py-20 text-center text-white ring-1 ring-white/10">
            <span aria-hidden className="absolute -bottom-28 -left-20 size-80 rounded-full bg-[#9b7bea]/25 blur-3xl" />
            <BrandAurora onDark opacity={0.6} className="pointer-events-none absolute inset-0 -z-10" />
            <span aria-hidden className="absolute top-10 right-10 size-10 rounded-full bg-[#c8f04a]" />
            <h2 className="relative mx-auto max-w-2xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
              Comece a ver o que sobra.
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-white/75">
              Conecte o Nubank, importe um extrato ou comece do zero. Leva poucos minutos.
            </p>
            <Button
              asChild
              size="lg"
              className="relative mt-9 h-12 rounded-full bg-[#c8f04a] px-7 text-base text-[#1a0e26] hover:bg-[#d6f673]"
            >
              <Link href={start.href}>
                {start.label} <ArrowRight />
              </Link>
            </Button>
            {signupEnabled && (
              <p className="relative mt-5 text-sm text-white/70">
                Já tem conta?{" "}
                <Link href="/login" className="font-medium text-white underline-offset-4 hover:underline">
                  Entrar
                </Link>
              </p>
            )}
          </Reveal>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Brand />
          <span>Finanças pessoais feitas no Brasil, em reais.</span>
          <Link href="/login" className="hover:text-foreground">
            Entrar
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      <span aria-hidden className="size-1.5 rounded-full bg-brand-dot" />
      {children}
    </span>
  );
}

function SectionHeading({
  eyebrow,
  title,
  text,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  text?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-pretty text-muted-foreground">{text}</p>}
    </div>
  );
}

/** Ilustração do painel com valores de exemplo. Não é um dado real. */
function HeroPreview() {
  return (
    <figure className="relative mx-auto mb-24 w-full max-w-md lg:mb-16" aria-label="Ilustração do painel com valores de exemplo">
      <div className="relative rotate-[-3deg] overflow-hidden rounded-[1.6rem] bg-gradient-to-br from-[#3b1f57] via-[#2b1640] to-[#1f0f30] p-6 text-white shadow-2xl shadow-[#2b1640]/30 ring-1 ring-white/10">
        <span aria-hidden className="absolute -top-16 -right-10 size-48 rounded-full bg-[#9b7bea]/25 blur-2xl" />
        <span aria-hidden className="absolute top-[5rem] right-7 size-9 rounded-full bg-[#c8f04a]" />
        <div className="relative flex items-start justify-between">
          <span className="text-sm font-semibold tracking-wide uppercase">Cartão</span>
          <Nfc className="size-5 opacity-80" aria-hidden />
        </div>
        <p className="relative mt-6 text-xs text-white/70">Fatura a pagar</p>
        <p className="relative mt-0.5 text-4xl font-semibold tracking-tight tabular">
          <MoneyCountUp cents={124050} duration={1.6} />
        </p>
        <div className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-[62%] rounded-full bg-[#c8f04a]" />
        </div>
        <p className="relative mt-4 text-right text-xs text-white/80">Fecha dia 7 · vence dia 17</p>
      </div>

      <div className="absolute -bottom-24 -left-2 w-56 sm:-left-10 rounded-2xl border bg-card p-4 shadow-xl sm:-left-12">
        <p className="text-xs text-muted-foreground">Sobra do mês</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-positive tabular">
          <MoneyCountUp cents={81230} duration={1.8} />
        </p>
        <div className="mt-3 grid gap-1.5 text-xs">
          <PreviewRow label="Entradas" value="R$ 4.500,00" />
          <PreviewRow label="Débito e Pix" value="R$ 2.447,20" />
          <PreviewRow label="Fatura" value="R$ 1.240,50" />
        </div>
      </div>

      <div className="absolute -top-6 -right-2 flex items-center gap-2.5 rounded-2xl border bg-card px-3.5 py-2.5 shadow-lg sm:-right-8">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-[#6b4fd8] dark:text-brand-accent">
          <Tags className="size-4" aria-hidden />
        </span>
        <span className="text-xs">
          <span className="block font-medium">Mercado</span>
          <span className="text-muted-foreground">categorizado sozinho</span>
        </span>
      </div>

      <figcaption className="mt-6 pr-2 text-right text-xs text-muted-foreground">Valores ilustrativos</figcaption>
    </figure>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular">{value}</span>
    </span>
  );
}
