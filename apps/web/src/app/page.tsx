import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  FileText,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { GitHub, LinkedIn, Mail, X } from '~/components/ui/icons';
import { siteConfig } from '~/lib/site';

const highlights = [
  {
    title: 'Accurate transcripts',
    description:
      'Speaker-aware, multilingual transcription with timestamps you can trust.',
    icon: FileText,
  },
  {
    title: 'Answers from your videos',
    description:
      'Ask questions and get cited answers that link back to the exact moment.',
    icon: MessageCircle,
  },
  {
    title: 'Highlights automatically',
    description:
      'Chapters, summaries, and action items generated without manual effort.',
    icon: Sparkles,
  },
];

export default function Home() {
  return (
    <div className="relative min-h-svh bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-24 px-6 pb-20 pt-10">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--milkpod-ocean)] text-xs font-semibold uppercase tracking-[0.2em] text-white">
              MP
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">
                {siteConfig.name}
              </p>
              <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
                Video intelligence
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <a
              className="px-3 py-1 text-muted-foreground transition hover:text-foreground"
              href="#features"
            >
              Features
            </a>
            <Button
              asChild
              size="sm"
              className="rounded-full px-5"
            >
              <Link href="/signin">Start free</Link>
            </Button>
          </div>
        </header>

        {/* Hero */}
        <section className="flex flex-col items-center gap-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <Sparkles className="size-3.5 text-[color:var(--milkpod-ocean)]" />
            AI video intelligence
          </span>

          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Transcribe every video, then ask it anything.
          </h1>

          <p className="max-w-xl text-lg text-muted-foreground">
            {siteConfig.description}
          </p>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link href="/signin">
                Get {siteConfig.name} free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full px-7"
            >
              <a href="#features">See how it works</a>
            </Button>
          </div>

          {/* Product mockup */}
          <div className="mt-6 w-full max-w-3xl">
            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3 border-b pb-3">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
                  <div className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
                  <div className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
                </div>
                <p className="flex-1 text-center text-xs text-muted-foreground">
                  Q3 planning review
                </p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3 text-left text-sm">
                  <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
                    <span>Transcript</span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      47 min
                    </span>
                  </div>
                  {[
                    {
                      time: '03:12',
                      text: 'We want to reduce churn by sharing the top lessons earlier in onboarding.',
                    },
                    {
                      time: '11:04',
                      text: 'The biggest wins came from pairing the demo with a quick recap and follow-up checklist.',
                    },
                    {
                      time: '18:39',
                      text: 'Sales teams asked for tighter handoffs to keep context from discovery into onboarding.',
                    },
                  ].map((line) => (
                    <div key={line.time} className="flex items-start gap-3">
                      <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {line.time}
                      </span>
                      <p className="text-foreground/80">{line.text}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-primary p-4 text-primary-foreground">
                  <div className="flex items-center justify-between text-xs uppercase tracking-widest opacity-60">
                    <span>Ask {siteConfig.name}</span>
                    <span className="flex items-center gap-1">
                      <Sparkles className="size-3" />
                      AI
                    </span>
                  </div>
                  <div className="mt-3 space-y-2.5 text-left text-sm">
                    <div className="rounded-lg bg-primary-foreground/10 px-3 py-2">
                      What did they say about retention?
                    </div>
                    <div className="rounded-lg border border-primary-foreground/10 bg-primary-foreground/5 px-3 py-2">
                      <p>
                        Retention improved when onboarding included a guided
                        walkthrough plus a recap email within 24 hours.
                      </p>
                      <p className="mt-1.5 text-xs opacity-50">
                        Cites 12:08, 16:42
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="space-y-8">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Built for video workflows
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need, nothing you don&apos;t.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border bg-card p-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                    <Icon className="size-5 text-foreground/70" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border bg-card p-10 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Ready to get started
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Turn video into answers in minutes.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
            Start with a single upload, then invite your team when you&apos;re
            ready.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link href="/signin">
                Get {siteConfig.name} free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full px-7"
            >
              <a href={`mailto:${siteConfig.links.mail}`}>Contact us</a>
            </Button>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t pt-10">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--milkpod-ocean)] text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                  MP
                </div>
                <p className="font-semibold tracking-tight">
                  {siteConfig.name}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                AI video transcription and Q&A workspace for teams.
              </p>
              <div className="flex items-center gap-3">
                {[
                  { href: siteConfig.links.x, icon: X },
                  { href: siteConfig.links.github, icon: GitHub },
                  { href: siteConfig.links.linkedin, icon: LinkedIn },
                  { href: `mailto:${siteConfig.links.mail}`, icon: Mail },
                ].map(({ href, icon: Icon }) => (
                  <a
                    key={href}
                    href={href}
                    target={href.startsWith('mailto') ? undefined : '_blank'}
                    rel={
                      href.startsWith('mailto')
                        ? undefined
                        : 'noopener noreferrer'
                    }
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            {[
              {
                title: 'Product',
                links: [
                  { label: 'Features', href: '#features' },
                  { label: 'Sign in', href: '/signin' },
                ],
              },
              {
                title: 'Resources',
                links: [
                  {
                    label: 'Support',
                    href: `mailto:${siteConfig.links.mail}`,
                  },
                  { label: 'GitHub', href: siteConfig.links.github },
                ],
              },
              {
                title: 'Legal',
                links: [
                  { label: 'Terms', href: '#' },
                  { label: 'Privacy', href: '#' },
                ],
              },
            ].map((col) => (
              <div key={col.title} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {col.title}
                </p>
                <ul className="space-y-2 text-sm">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target={
                          link.href.startsWith('mailto') ||
                          link.href.startsWith('#') ||
                          link.href.startsWith('/')
                            ? undefined
                            : '_blank'
                        }
                        rel={
                          link.href.startsWith('mailto') ||
                          link.href.startsWith('#') ||
                          link.href.startsWith('/')
                            ? undefined
                            : 'noopener noreferrer'
                        }
                        className="text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 border-t pt-6 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {siteConfig.name}. All rights
            reserved.
          </div>
        </footer>
      </main>
    </div>
  );
}
