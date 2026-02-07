import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Clock,
  FileText,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { GitHub, LinkedIn, Mail, X } from '~/components/ui/icons';
import { siteConfig } from '~/lib/site';

const workflow = [
  {
    title: 'Drop in a video',
    description:
      'Upload files or paste links from YouTube, Drive, or Loom. Milkpod keeps the source intact.',
    icon: Video,
  },
  {
    title: 'Milkpod transcribes',
    description:
      'Get speaker-aware transcripts, chapters, and highlights in minutes, ready for review.',
    icon: FileText,
  },
  {
    title: 'Ask questions',
    description:
      'Chat with the video, get answers with timestamps, and export the insights you need.',
    icon: MessageCircle,
  },
];

const capabilities = [
  {
    title: 'Cited answers',
    description:
      'Ask a question and get an answer with timestamps so you can jump to the source.',
    icon: MessageCircle,
  },
  {
    title: 'Highlights and summaries',
    description:
      'Auto-generate chapters, takeaways, and action items for fast sharing.',
    icon: Sparkles,
  },
  {
    title: 'Semantic search',
    description:
      'Find the exact moment across every upload with intent-based search.',
    icon: Search,
  },
  {
    title: 'Secure workspace',
    description:
      'Share transcripts, clips, and notes with controls built for teams.',
    icon: ShieldCheck,
  },
];

const useCases = [
  {
    title: 'Research interviews',
    description:
      'Turn long conversations into crisp insights and quotes for stakeholders.',
    icon: FileText,
  },
  {
    title: 'Team updates',
    description:
      'Deliver summaries that keep sales, product, and support in sync.',
    icon: Clock,
  },
  {
    title: 'Learning libraries',
    description:
      'Build searchable training archives for onboarding and enablement.',
    icon: BookOpen,
  },
];

export default function Home() {
  return (
    <div className="relative min-h-svh overflow-hidden bg-[color:var(--milkpod-mist)] text-foreground dark:bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,_rgba(15,23,42,0.04)_1px,_transparent_1px),linear-gradient(0deg,_rgba(15,23,42,0.04)_1px,_transparent_1px)] [background-size:120px_120px] opacity-50 dark:opacity-20" />
      <div
        className="pointer-events-none absolute -left-32 top-12 h-72 w-72 rounded-full blur-3xl opacity-80"
        style={{
          background:
            'radial-gradient(circle, var(--milkpod-sand) 0%, transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute -right-32 -top-20 h-[420px] w-[420px] rounded-full blur-3xl opacity-70"
        style={{
          background:
            'radial-gradient(circle, var(--milkpod-lagoon) 0%, transparent 70%)',
        }}
      />
      <div
        className="pointer-events-none absolute bottom-[-20%] left-[28%] h-[480px] w-[480px] rounded-full blur-3xl opacity-70"
        style={{
          background:
            'radial-gradient(circle, var(--milkpod-ocean) 0%, transparent 70%)',
        }}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-20 px-6 pb-24 pt-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--milkpod-ocean)] text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg">
              MP
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight">
                {siteConfig.name}
              </p>
              <p className="text-xs uppercase tracking-[0.32em] text-muted-foreground">
                Video intelligence
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a
              className="rounded-full px-3 py-1 text-muted-foreground transition hover:text-foreground"
              href="#workflow"
            >
              Workflow
            </a>
            <a
              className="rounded-full px-3 py-1 text-muted-foreground transition hover:text-foreground"
              href="#capabilities"
            >
              Capabilities
            </a>
            <Button
              asChild
              size="sm"
              className="rounded-full bg-[color:var(--milkpod-ink)] px-5 text-white shadow-lg hover:bg-[color:var(--milkpod-ink)]/90"
            >
              <Link href="/signin">Start free</Link>
            </Button>
          </div>
        </header>

        <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-700">
            <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--milkpod-ocean)]/20 bg-white/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--milkpod-ink)] shadow-sm backdrop-blur dark:bg-white/10">
              <Sparkles className="size-4 text-[color:var(--milkpod-ocean)]" />
              AI video intelligence
            </span>
            <h1 className="heading-lg text-balance text-[color:var(--milkpod-ink)] dark:text-foreground">
              Transcribe every video, then ask it anything.
            </h1>
            <p className="text-pretty text-lg text-muted-foreground">
              {siteConfig.description}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-[color:var(--milkpod-ink)] px-7 text-white shadow-lg hover:bg-[color:var(--milkpod-ink)]/90"
              >
                <Link href="/signin">
                  Start free
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-[color:var(--milkpod-ocean)]/30 bg-white/60 px-7 text-[color:var(--milkpod-ink)] shadow-sm backdrop-blur hover:bg-white/80 dark:bg-white/10 dark:text-foreground"
              >
                <a href="#workflow">See the workflow</a>
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-sm shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Transcribe
                </p>
                <p className="mt-2 font-semibold text-[color:var(--milkpod-ink)] dark:text-foreground">
                  Multilingual and accurate.
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-sm shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Ask
                </p>
                <p className="mt-2 font-semibold text-[color:var(--milkpod-ink)] dark:text-foreground">
                  Answers with timestamps.
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/70 p-4 text-sm shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Share
                </p>
                <p className="mt-2 font-semibold text-[color:var(--milkpod-ink)] dark:text-foreground">
                  Reports for every team.
                </p>
              </div>
            </div>
          </div>

          <div className="relative flex flex-col gap-6 animate-in fade-in slide-in-from-right-8 duration-700 delay-200">
            <div className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-xl shadow-black/5 backdrop-blur dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.28em] text-muted-foreground">
                <span>Transcript</span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3" />
                  47 min
                </span>
              </div>
              <div className="mt-5 space-y-4 text-sm text-foreground/80 dark:text-foreground/70">
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-[color:var(--milkpod-sand)] px-2 py-1 text-xs font-semibold text-[color:var(--milkpod-ink)]">
                    03:12
                  </span>
                  <p>
                    We want to reduce churn by sharing the top lessons earlier in
                    onboarding.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-[color:var(--milkpod-sand)] px-2 py-1 text-xs font-semibold text-[color:var(--milkpod-ink)]">
                    11:04
                  </span>
                  <p>
                    The biggest wins came from pairing the demo with a quick
                    recap and follow-up checklist.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="rounded-full bg-[color:var(--milkpod-sand)] px-2 py-1 text-xs font-semibold text-[color:var(--milkpod-ink)]">
                    18:39
                  </span>
                  <p>
                    Sales teams asked for tighter handoffs to keep context from
                    discovery into onboarding.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[color:var(--milkpod-ink)] p-5 text-white shadow-xl shadow-black/20">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.28em] text-white/70">
                <span>Ask Milkpod</span>
                <span className="flex items-center gap-1 text-[color:var(--milkpod-sun)]">
                  <Sparkles className="size-3" />
                  AI
                </span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  What did they say about retention?
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p>
                    Retention improved when onboarding included a guided
                    walkthrough plus a recap email within 24 hours.
                  </p>
                  <p className="mt-2 text-xs text-white/60">Cites 12:08, 16:42</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="workflow" className="space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                Workflow
              </p>
              <h2 className="heading-md text-[color:var(--milkpod-ink)] dark:text-foreground">
                From video to answers in minutes.
              </h2>
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              Milkpod handles transcription, chapters, and AI Q&amp;A in one
              workspace so your team can focus on insights.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {workflow.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--milkpod-sand)] text-[color:var(--milkpod-ink)]">
                    <Icon className="size-6" />
                  </div>
                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Step {index + 1}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-[color:var(--milkpod-ink)] dark:text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section id="capabilities" className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                Capabilities
              </p>
              <h2 className="heading-md text-[color:var(--milkpod-ink)] dark:text-foreground">
                AI answers with full context.
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Milkpod keeps the transcript, highlights, and Q&amp;A in a single
              workspace so the answers never lose the source.
            </p>
            <Button
              asChild
              variant="outline"
              className="w-fit rounded-full border-[color:var(--milkpod-ocean)]/30 bg-white/60 px-5 text-[color:var(--milkpod-ink)] shadow-sm backdrop-blur hover:bg-white/80 dark:bg-white/10 dark:text-foreground"
            >
              <a href="#cta">See Milkpod in action</a>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {capabilities.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--milkpod-sand)] text-[color:var(--milkpod-ink)]">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[color:var(--milkpod-ink)] dark:text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                Use cases
              </p>
              <h2 className="heading-md text-[color:var(--milkpod-ink)] dark:text-foreground">
                Built for teams that live in video.
              </h2>
            </div>
            <p className="max-w-md text-sm text-muted-foreground">
              From research to enablement, Milkpod keeps every conversation
              searchable and actionable.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {useCases.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-3xl border border-white/70 bg-white/70 p-6 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--milkpod-sand)] text-[color:var(--milkpod-ink)]">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-[color:var(--milkpod-ink)] dark:text-foreground">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section
          id="cta"
          className="rounded-3xl border border-white/10 bg-[color:var(--milkpod-ink)] p-10 text-white shadow-xl shadow-black/30"
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/60">
                Ready to get started
              </p>
              <h2 className="mt-3 text-3xl font-semibold">
                Turn video into answers in minutes.
              </h2>
              <p className="mt-3 text-sm text-white/70">
                Start with a single upload, then invite your team when you are
                ready.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-full bg-white px-6 text-[color:var(--milkpod-ink)] hover:bg-white/90"
              >
                <Link href="/signin">
                  Start free
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/30 bg-transparent px-6 text-white hover:bg-white/10"
              >
                <a href={`mailto:${siteConfig.links.mail}`}>Contact us</a>
              </Button>
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-white/60 pt-6 text-sm text-muted-foreground dark:border-white/10">
          <p>
            {siteConfig.name} turns video into searchable knowledge with AI.
          </p>
          <div className="flex items-center gap-4">
            <a
              href={siteConfig.links.x}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </a>
            <a
              href={siteConfig.links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              <GitHub className="h-4 w-4" />
            </a>
            <a
              href={siteConfig.links.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              <LinkedIn className="h-4 w-4" />
            </a>
            <a
              href={`mailto:${siteConfig.links.mail}`}
              className="transition-colors hover:text-foreground"
            >
              <Mail className="h-4 w-4" />
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
