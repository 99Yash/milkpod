import {
  ChevronRight,
  Clock,
  FileText,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { GitHub, LinkedIn, Mail, X } from '~/components/ui/icons';
import { getServerSession } from '~/lib/auth/session';
import { siteConfig } from '~/lib/site';
import { LandingNav } from './landing-nav';

export const dynamic = 'force-dynamic';

const features = [
  {
    title: 'Speaker-aware',
    description:
      'Every word attributed to the right person. Multilingual, timestamp-perfect.',
    icon: FileText,
  },
  {
    title: 'Cited answers',
    description:
      'Ask a question, get an answer that links to the exact moment.',
    icon: MessageCircle,
  },
  {
    title: 'Auto-highlights',
    description:
      'Chapters, summaries, and action items — generated, not typed.',
    icon: Sparkles,
  },
];

const faqs = [
  {
    question: 'What types of video does Milkpod support?',
    answer:
      'Any video or audio file — meetings, lectures, interviews, podcasts, webinars. Upload directly or paste a link.',
  },
  {
    question: 'How accurate is the transcription?',
    answer:
      'Milkpod uses state-of-the-art speech recognition with speaker diarization. It handles multiple speakers, accents, and languages with high accuracy.',
  },
  {
    question: 'Can I ask questions about my videos?',
    answer:
      'Yes. Once transcribed, you can ask anything in natural language. Milkpod returns answers with citations that link to the exact timestamp.',
  },
  {
    question: 'Is there a free plan?',
    answer:
      'Yes. Start free with generous limits. No credit card required.',
  },
  {
    question: 'How does team sharing work?',
    answer:
      'Create collections, invite teammates, and everyone gets access to the same transcripts, highlights, and Q&A — no duplicate uploads.',
  },
];

const transcriptLines = [
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
];

export default async function Home() {
  const session = await getServerSession();
  if (session?.user) redirect('/dashboard');

  return (
    <div className="relative min-h-svh bg-background text-foreground">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,var(--landing-cta)_/_8%,transparent)]" />

      <LandingNav />

      <main className="mx-auto flex w-full max-w-5xl flex-col px-5">
        {/* ── Hero ── */}
        <section id="overview" className="flex flex-col items-center pt-36 text-center sm:pt-44">
          <h1 className="max-w-3xl text-[clamp(2rem,6vw,3.5rem)] font-medium leading-[1.1] tracking-[-0.03em]">
            Your videos know more than you remember.
          </h1>

          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            Transcripts with speaker labels. Answers with timestamps. Highlights
            that write themselves.
          </p>

          {/* Product mockup */}
          <div className="mt-14 w-full max-w-3xl sm:mt-16">
            <div className="overflow-hidden rounded-2xl border border-landing-glass-border bg-landing-surface">
              {/* Window chrome */}
              <div className="flex items-center gap-3 border-b border-landing-separator px-5 py-3">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
                  <div className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
                  <div className="h-2.5 w-2.5 rounded-full bg-foreground/10" />
                </div>
                <p className="flex-1 text-center text-xs text-muted-foreground/60">
                  Q3 planning review
                </p>
              </div>

              {/* Two-pane content */}
              <div className="grid gap-0 md:grid-cols-[1.2fr_0.8fr]">
                {/* Transcript pane */}
                <div className="space-y-3 p-5 text-left text-sm md:border-r md:border-landing-separator">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground/60">
                    <span>Transcript</span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      47 min
                    </span>
                  </div>
                  {transcriptLines.map((line) => (
                    <div key={line.time} className="flex items-start gap-3">
                      <span className="shrink-0 rounded-md bg-landing-surface-alt px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {line.time}
                      </span>
                      <p className="text-foreground/60">{line.text}</p>
                    </div>
                  ))}
                </div>

                {/* Q&A pane */}
                <div className="border-t border-landing-separator bg-landing-surface p-5 md:border-t-0">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground/60">
                    <span>Ask Milkpod</span>
                    <span className="flex items-center gap-1">
                      <Sparkles className="size-3" />
                      AI
                    </span>
                  </div>
                  <div className="mt-3 space-y-2.5 text-left text-sm">
                    <div className="rounded-lg bg-landing-surface-alt px-3 py-2 text-foreground/65">
                      What did they say about retention?
                    </div>
                    <div className="rounded-lg border border-landing-glass-border px-3 py-2">
                      <p className="text-foreground/60">
                        Retention improved when onboarding included a guided
                        walkthrough plus a recap email within 24 hours.
                      </p>
                      <p className="mt-1.5 text-[11px] text-muted-foreground/50">
                        Cites 12:08, 16:42
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Three-column feature highlights ── */}
        <section className="mt-28 grid gap-10 text-center sm:mt-36 sm:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title}>
                <Icon
                  className="mx-auto size-6 text-foreground/25"
                  strokeWidth={1.5}
                />
                <h3 className="mt-3 text-[15px] font-medium">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            );
          })}
        </section>

        {/* ── Feature showcase cards ── */}
        <section id="features" className="mt-28 space-y-4 sm:mt-36">
          {/* Large card */}
          <div className="rounded-2xl border border-landing-glass-border bg-landing-surface p-8 sm:p-10">
            <h2 className="text-2xl font-medium tracking-[-0.02em] sm:text-3xl">
              Search every conversation
            </h2>
            <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Speaker-labeled transcripts with timestamps you can click. Find
              the exact moment without rewatching a single second.
            </p>
          </div>

          {/* Two smaller cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-landing-glass-border bg-landing-surface p-8">
              <h3 className="text-xl font-medium tracking-tight">
                Ask, don&apos;t rewatch
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                Type a question in plain English. Get an answer with citations
                that jump to the exact timestamp.
              </p>
            </div>
            <div className="rounded-2xl border border-landing-glass-border bg-landing-surface p-8">
              <h3 className="text-xl font-medium tracking-tight">
                Built for teams
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
                Share collections with your team. Everyone searches the same
                library — no duplicate uploads, no lost context.
              </p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="mt-28 sm:mt-36">
          <h2 className="text-center text-3xl font-medium tracking-[-0.02em] sm:text-4xl">
            FAQ
          </h2>
          <div className="mx-auto mt-10 max-w-2xl divide-y divide-landing-separator border-b border-landing-separator">
            {faqs.map((faq) => (
              <details key={faq.question} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between py-5 text-[15px] font-medium transition select-none [&::-webkit-details-marker]:hidden hover:text-foreground/80">
                  {faq.question}
                  <ChevronRight className="size-4 shrink-0 text-foreground/25 transition-transform duration-200 group-open:rotate-90" />
                </summary>
                <p className="pb-5 pr-8 text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Bottom close ── */}
        <section className="flex flex-col items-center py-32 text-center sm:py-44">
          <h2 className="text-3xl font-medium tracking-[-0.02em] text-foreground/80 sm:text-5xl">
            What will you discover?
          </h2>
        </section>

        {/* ── Minimal footer ── */}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-landing-separator py-8 text-xs text-muted-foreground/60">
          <p>
            &copy; {new Date().getFullYear()} {siteConfig.name}
          </p>
          <div className="flex items-center gap-4">
            {[
              { href: siteConfig.links.x, icon: X, external: true },
              { href: siteConfig.links.github, icon: GitHub, external: true },
              {
                href: siteConfig.links.linkedin,
                icon: LinkedIn,
                external: true,
              },
              {
                href: `mailto:${siteConfig.links.mail}`,
                icon: Mail,
                external: false,
              },
            ].map(({ href, icon: Icon, external }) => (
              <a
                key={href}
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                className="transition hover:text-muted-foreground"
              >
                <Icon className="size-3.5" />
              </a>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
