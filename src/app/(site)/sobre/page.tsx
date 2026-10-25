import {
  ArrowRight,
  BarChart3,
  Car,
  CreditCard,
  FileUp,
  House,
  KeyRound,
  Lock,
  Nfc,
  PiggyBank,
  Repeat,
  Tags,
  Trash2,
  Utensils,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MoneyCountUp } from "@/components/motion/money-count-up";
import { Reveal } from "@/components/motion/reveal";
import { Spotlight } from "@/components/motion/spotlight";
import BlurText from "@/components/reactbits/BlurText";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Sobraqui · saiba quanto sobra no fim do mês" },
  description:
    "Finanças pessoais em reais: entradas, saídas, cartão e fatura no ciclo certo, categorias automáticas e importação de extrato, sem pedir sua senha do banco.",
};

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Wallet,
    title: "Entradas e saídas",
    text: "Salário, freelance e cada gasto com a forma de pagamento: Pix, boleto, débito ou crédito parcelado.",
  },
  {
    icon: CreditCard,
    title: "Cartão e fatura",
    text: "Cada compra cai na fatura certa pelo dia de fechamento, com parcelas distribuídas e limite disponível.",
  },
  {
    icon: FileUp,
    title: "Importação de extrato",
    text: "Exporte o extrato ou a fatura no app do banco (CSV ou OFX) e envie aqui. Você revisa antes de salvar.",
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
    icon: BarChart3,
    title: "Relatórios",
    text: "Gastos por categoria, evolução do saldo e comparação entre meses, com exportação em CSV.",
  },
];

const STEPS = [
  { title: "Crie sua conta", text: "E-mail e senha, ou Google. Seus dados ficam separados dos de qualquer outra pessoa." },
  {
    title: "Cadastre e importe",
    text: "Cadastre sua conta e seu cartão. Depois lance à mão ou envie o extrato exportado do app do banco.",
  },
  { title: "Veja quanto sobra", text: "O painel junta saldo, fatura a pagar, gastos por categoria e o que vence em breve." },
];

const SECURITY: { icon: LucideIcon; text: string }[] = [
  { icon: KeyRound, text: "Nunca pedimos nem guardamos a senha do seu banco." },
  { icon: FileUp, text: "Do extrato enviado, ficam só os lançamentos que você confirmar." },
  { icon: Lock, text: "Cada registro é isolado por usuário no próprio banco de dados." },
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
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
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
        {/* Abertura */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:pt-20 lg:pb-24">
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
              className="mt-5 justify-center text-[2.75rem] leading-[1.04] font-semibold tracking-tight sm:text-6xl lg:justify-start"
            />
            <Reveal trigger="mount" delay={0.45} distance={16}>
              <p className="mx-auto mt-6 max-w-lg text-lg text-pretty text-muted-foreground lg:mx-0">
                Entradas, gastos, cartão e fatura num só lugar. O Sobraqui separa o que já saiu da conta do que você
                ainda vai pagar e mostra o que realmente sobra.
              </p>
            </Reveal>
            <Reveal
              trigger="mount"
              delay={0.6}
              distance={16}
              className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start"
            >
              <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
                <Link href={start.href}>
                  {start.label} <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-full px-6 text-base">
                <a href="#como-funciona">Ver como funciona</a>
              </Button>
            </Reveal>
          </div>

          <Reveal trigger="mount" delay={0.3} distance={32}>
            <DashboardPreview />
          </Reveal>
        </section>

        {/* Funcionalidades */}
        <section id="funcionalidades" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal>
              <SectionHeading
                eyebrow="Funcionalidades"
                title="O que você precisa, sem planilha"
                text="Feito para quem quer entender o próprio dinheiro sem passar o domingo conferindo extrato."
              />
            </Reveal>
            <Reveal stagger={0.07} className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <Spotlight key={title} className="h-full p-6">
                  <article>
                    <IconTile icon={Icon} />
                    <h3 className="mt-5 font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
                  </article>
                </Spotlight>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal>
              <SectionHeading eyebrow="Como funciona" title="Em três passos" />
            </Reveal>
            <Reveal stagger={0.1} className="mt-12 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <div key={s.title} className="rounded-3xl bg-card p-7 ring-1 ring-border">
                  <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Segurança */}
        <section id="seguranca" className="scroll-mt-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <SectionHeading
                align="left"
                eyebrow="Segurança"
                title="Seu dinheiro é assunto seu"
                text="Nada de robô entrando no seu internet banking. Você exporta o extrato no app do banco e envia o arquivo; a senha do banco nunca passa por aqui."
              />
            </Reveal>
            <Reveal stagger={0.07} distance={20} className="grid gap-3">
              {SECURITY.map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-4 rounded-2xl bg-card px-5 py-4 ring-1 ring-border">
                  <Icon className="size-5 shrink-0 text-[#6b4fd8] dark:text-brand-accent" aria-hidden />
                  <span className="text-sm">{text}</span>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Chamada final */}
        <section className="px-4 pb-24 sm:px-6">
          <Reveal
            distance={32}
            className="mx-auto flex max-w-6xl flex-col items-center gap-6 rounded-3xl bg-card px-6 py-14 text-center ring-1 ring-border md:flex-row md:justify-between md:px-12 md:text-left"
          >
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-balance">Comece a ver o que sobra.</h2>
              <p className="mt-2 text-muted-foreground">Cadastre sua conta, importe um extrato ou comece do zero.</p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-3 md:items-end">
              <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
                <Link href={start.href}>
                  {start.label} <ArrowRight />
                </Link>
              </Button>
              {signupEnabled && (
                <p className="text-sm text-muted-foreground">
                  Já tem conta?{" "}
                  <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
                    Entrar
                  </Link>
                </p>
              )}
            </div>
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
    <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase ring-1 ring-border">
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
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {text && <p className="mt-4 text-pretty text-muted-foreground">{text}</p>}
    </div>
  );
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-[#6b4fd8] dark:text-brand-accent">
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

const PREVIEW_CATEGORIES = [
  { name: "Alimentação", icon: Utensils, color: "#f97316", cents: 98_740 },
  { name: "Moradia", icon: House, color: "#8b5cf6", cents: 85_000 },
  { name: "Transporte", icon: Car, color: "#0ea5e9", cents: 32_160 },
  { name: "Assinaturas", icon: Repeat, color: "#14b8a6", cents: 11_870 },
];

/** Prévia do painel, com os mesmos cartões do dashboard e valores de exemplo. */
function DashboardPreview() {
  const max = PREVIEW_CATEGORIES[0].cents;
  return (
    <figure aria-label="Prévia do painel com valores de exemplo" className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1.15fr]">
        <div className="grid gap-3">
          <div className="relative overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#3b1f57] via-[#2b1640] to-[#1f0f30] p-5 text-white ring-1 ring-white/10">
            <span aria-hidden className="absolute -top-16 -right-10 size-44 rounded-full bg-[#9b7bea]/25 blur-2xl" />
            <span aria-hidden className="absolute top-[4.3rem] right-5 size-7 rounded-full bg-[#c8f04a]" />
            <div className="relative flex items-start justify-between">
              <span className="text-xs font-semibold tracking-wide uppercase">Cartão</span>
              <Nfc className="size-4 opacity-80" aria-hidden />
            </div>
            <p className="relative mt-4 text-xs text-white/70">Fatura a pagar</p>
            <p className="relative text-2xl font-semibold tracking-tight tabular">
              <MoneyCountUp cents={124050} duration={1.4} />
            </p>
            <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full w-[62%] rounded-full bg-[#c8f04a]" />
            </div>
            <p className="relative mt-2.5 text-right text-[11px] text-white/80">Vence dia 17</p>
          </div>
          <PreviewCard>
            <p className="text-xs text-muted-foreground">Saldo em conta</p>
            <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular">
              <MoneyCountUp cents={286_430} duration={1.6} />
            </p>
            <span className="mt-2 inline-block rounded-full bg-positive-soft px-2.5 py-1 text-[11px] font-medium text-positive tabular">
              Sobra +R$ 812,30
            </span>
          </PreviewCard>
        </div>

        <PreviewCard>
          <p className="text-sm font-semibold">Maiores categorias</p>
          <p className="text-[11px] text-muted-foreground">Cartão + débito e Pix</p>
          <ul className="mt-4 grid gap-3.5">
            {PREVIEW_CATEGORIES.map(({ name, icon: Icon, color, cents }) => (
              <li key={name} className="grid gap-1.5">
                <span className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
                    <Icon className="size-3.5" style={{ color }} aria-hidden />
                    <span className="font-medium">{name}</span>
                  </span>
                  <span className="font-semibold tabular">R$ {(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </span>
                <span className="block h-2 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full" style={{ width: `${(cents / max) * 100}%`, backgroundColor: color }} />
                </span>
              </li>
            ))}
          </ul>
        </PreviewCard>
      </div>

      <PreviewCard className="grid gap-2 text-xs">
        <p className="text-sm font-semibold">Resumo do mês</p>
        <PreviewRow label="Entradas" value="+R$ 4.500,00" />
        <PreviewRow label="Débito e Pix" value="-R$ 2.447,20" />
        <PreviewRow label="Fatura a pagar" value="-R$ 1.240,50" />
        <div className="flex justify-between border-t pt-2 text-sm">
          <span className="font-medium">Sobra do mês</span>
          <span className="font-semibold text-positive tabular">+R$ 812,30</span>
        </div>
      </PreviewCard>
      <figcaption className="text-right text-xs text-muted-foreground">Valores ilustrativos</figcaption>
    </figure>
  );
}

function PreviewCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[1.4rem] bg-card p-5 shadow-sm ring-1 ring-border", className)}>{children}</div>;
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular">{value}</span>
    </span>
  );
}
