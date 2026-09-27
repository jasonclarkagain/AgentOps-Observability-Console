import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  DatabaseZap,
  ExternalLink,
  Gauge,
  GitBranch,
  Layers3,
  ListFilter,
  Menu,
  Play,
  RefreshCw,
  Search,
  ServerCog,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  X,
  Zap,
} from 'lucide-react';
import {
  getGetRunEventsQueryKey,
  useGetDashboardSummary,
  useGetRun,
  useGetRunEvents,
  useIngestTelemetryEvent,
  useListAnomalies,
  useListRuns,
  useReplayRun,
} from '@workspace/api-client-react';
import type {
  AgentRun,
  Anomaly,
  DashboardSummary,
  TelemetryEventInput,
  TraceEvent,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient();

const navItems = [
  { href: '/', label: 'Workspace', icon: Activity },
  { href: '/runs', label: 'Run explorer', icon: Layers3 },
  { href: '/anomalies', label: 'Anomalies', icon: AlertTriangle },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

const toneMap = {
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  running: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  anomalous: 'border-amber-200 bg-amber-50 text-amber-700',
  open: 'border-rose-200 bg-rose-50 text-rose-700',
  acknowledged: 'border-amber-200 bg-amber-50 text-amber-700',
  resolved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  complete: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
} as const;

function formatMoney(value = 0) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function formatNumber(value = 0) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatDuration(ms = 0) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function StatusPill({ value }: { value: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]', toneMap[value as keyof typeof toneMap] ?? 'border-slate-200 bg-slate-50 text-slate-600')}>
      <span className={cx('h-1.5 w-1.5 rounded-full', value === 'running' ? 'animate-pulse-line bg-cyan-500' : value === 'error' || value === 'failed' || value === 'open' ? 'bg-rose-500' : value === 'warning' || value === 'anomalous' || value === 'acknowledged' ? 'bg-amber-500' : 'bg-emerald-500')} />
      {value.replace('_', ' ')}
    </span>
  );
}

function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-4 rounded-lg border border-border/70 bg-card p-4">
          <div className="h-9 w-9 rounded-md bg-muted" />
          <div className="flex-1 space-y-2"><div className="h-3 w-1/3 rounded bg-muted" /><div className="h-2 w-2/3 rounded bg-muted" /></div>
          <div className="h-5 w-16 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" data-testid="status-query-error">
      <span>Telemetry could not be loaded. The control room is still connected to your workspace.</span>
      <button onClick={onRetry} className="inline-flex shrink-0 items-center gap-2 rounded-md border border-rose-300 bg-rose-100 px-3 py-1.5 text-xs font-semibold hover:bg-rose-200" data-testid="button-retry-query"><RefreshCw className="h-3.5 w-3.5" /> Retry</button>
    </div>
  );
}

function Sparkline({ points, color = '#176778' }: { points?: Array<{ value: number }>; color?: string }) {
  const values = points?.map((point) => point.value) ?? [];
  if (!values.length) return <div className="h-10 w-28 rounded bg-muted/60" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${34 - ((value - min) / range) * 28}`).join(' ');
  return <svg viewBox="0 0 100 40" className="h-10 w-28 overflow-visible" role="img" aria-label="Trend"><polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={path} /><circle cx={path.split(' ').at(-1)?.split(',')[0]} cy={path.split(' ').at(-1)?.split(',')[1]} r="2.7" fill={color} /></svg>;
}

function EmptyState({ title, description, icon: Icon = DatabaseZap }: { title: string; description: string; icon?: typeof DatabaseZap }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border bg-card/70 px-6 py-14 text-center" data-testid="empty-state">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-secondary text-primary"><Icon className="h-5 w-5" /></div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="noise-overlay min-h-[100dvh] bg-background text-foreground">
      <aside className={cx('fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform md:translate-x-0', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)} data-testid="link-brand">
            <div className="relative grid h-9 w-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"><span className="absolute h-3 w-3 rounded-sm border-2 border-current" /><span className="h-1 w-1 rounded-full bg-current" /></div>
            <div><div className="font-semibold tracking-tight text-white">Agent<span className="text-sidebar-primary">Ops</span></div><div className="font-mono text-[9px] uppercase tracking-[0.22em] text-sidebar-foreground/55">flight recorder</div></div>
          </Link>
          <button className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-white md:hidden" onClick={() => setMobileOpen(false)} data-testid="button-close-sidebar"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-10 px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">Observe</div>
        <nav className="mt-3 space-y-1" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active = item.href === '/' ? location === '/' : location.startsWith(item.href);
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={cx('group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors', active ? 'bg-sidebar-accent text-white shadow-sm' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-white')} data-testid={`link-nav-${item.label.toLowerCase().replace(' ', '-')}`}><span className="flex items-center gap-3"><Icon className={cx('h-4 w-4', active ? 'text-sidebar-primary' : 'text-sidebar-foreground/55')} />{item.label}</span>{item.href === '/anomalies' && <span className="rounded-full bg-rose-400/15 px-1.5 py-0.5 font-mono text-[9px] text-rose-200">live</span>}</Link>;
          })}
        </nav>
        <div className="mt-auto rounded-xl border border-sidebar-border bg-sidebar-accent/55 p-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-white"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Ingest pipeline healthy</div>
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-sidebar-foreground/55"><span>eu-west-1</span><span>12.4k events/hr</span></div>
        </div>
        <div className="mt-4 flex items-center gap-3 border-t border-sidebar-border px-2 pt-4">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-sidebar-primary font-semibold text-sidebar-primary-foreground">AK</div>
          <div className="min-w-0"><div className="truncate text-xs font-semibold text-white">Ari Kim</div><div className="truncate text-[10px] text-sidebar-foreground/55">Platform engineering</div></div>
          <button className="ml-auto text-sidebar-foreground/55 hover:text-white" data-testid="button-account-menu"><ChevronDown className="h-4 w-4" /></button>
        </div>
      </aside>
      {mobileOpen && <button className="fixed inset-0 z-30 bg-slate-950/30 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-dismiss-sidebar" />}
      <main className="min-h-[100dvh] md:pl-[250px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3"><button className="rounded-md p-2 hover:bg-secondary md:hidden" onClick={() => setMobileOpen(true)} data-testid="button-open-sidebar"><Menu className="h-5 w-5" /></button><div className="hidden items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> production / eu-west-1</div></div>
          <div className="flex items-center gap-2"><button className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm hover:border-primary/40 hover:text-foreground sm:flex" data-testid="button-command-search"><Search className="h-3.5 w-3.5" /> Search runs <kbd className="ml-3 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[9px]">/</kbd></button><button className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid="button-refresh-global"><RefreshCw className="h-4 w-4" /></button></div>
        </header>
        <div className="mx-auto w-full max-w-[1580px] p-5 md:p-8">{children}</div>
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><span className="h-px w-5 bg-accent" /> {eyebrow}</div><h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground md:text-[30px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action}</div>;
}

function StatCard({ label, value, detail, trend, color = '#176778', icon: Icon }: { label: string; value: string; detail: string; trend?: Array<{ value: number }>; color?: string; icon: typeof Activity }) {
  return <div className="group rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_hsl(var(--foreground)/.03)] transition-transform hover:-translate-y-0.5" data-testid={`card-stat-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="flex items-start justify-between"><div className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary"><Icon className="h-4 w-4" /></div>{trend && <Sparkline points={trend} color={color} />}</div><div className="mt-5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div><div className="mt-1 text-[26px] font-semibold tracking-[-0.04em] text-foreground">{value}</div><div className="mt-1 text-xs text-muted-foreground">{detail}</div></div>;
}

function RunRow({ run, compact = false }: { run: AgentRun; compact?: boolean }) {
  return <Link href={`/runs/${run.id}`} className={cx('group flex items-center gap-3 border-b border-border/70 px-4 py-3.5 last:border-0 hover:bg-secondary/50', compact ? 'md:grid md:grid-cols-[minmax(180px,1.2fr)_minmax(120px,1fr)_100px_90px_26px]' : '')} data-testid={`row-run-${run.id}`}><div className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-primary/15 bg-primary/5 text-primary"><span className="font-mono text-[10px]">{run.agentName.slice(0, 2).toUpperCase()}</span></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-foreground">{run.workflow}</span>{run.hasAnomaly && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}</div><div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground"><span>{run.agentName}</span><span className="text-border">/</span><span>{run.customer}</span></div></div>{compact && <div className="hidden truncate text-xs text-muted-foreground md:block">{run.model}</div>}<div className="hidden text-xs text-muted-foreground sm:block">{formatDuration(run.durationMs)}</div><div className="hidden text-right font-mono text-xs text-foreground sm:block">{formatMoney(run.cost)}</div><div className="flex items-center gap-2"><StatusPill value={run.status} /><ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" /></div></Link>;
}

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  return <Link href={`/runs/${anomaly.runId}`} className="group flex gap-3 border-b border-border/70 px-4 py-4 last:border-0 hover:bg-secondary/50" data-testid={`row-anomaly-${anomaly.id}`}><div className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md', anomaly.severity === 'critical' || anomaly.severity === 'high' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600')}><AlertTriangle className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-semibold">{anomaly.title}</span><span className="font-mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">{anomaly.severity}</span></div><p className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">{anomaly.description}</p><div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-muted-foreground"><span>{anomaly.stepCount} steps / {anomaly.expectedSteps} expected</span><span>{formatDate(anomaly.detectedAt)}</span></div></div><ChevronRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" /></Link>;
}

function EventIcon({ type }: { type: string }) {
  const Icon = type === 'reasoning' ? BrainCircuit : type === 'tool_call' ? TerminalSquare : type === 'tool_result' ? Code2 : type === 'correction' ? RefreshCw : type === 'output' ? Zap : CircleDot;
  return <Icon className="h-4 w-4" />;
}

function TraceTimeline({ events, compact = false }: { events?: TraceEvent[]; compact?: boolean }) {
  if (!events?.length) return <EmptyState title="No semantic events yet" description="Events will appear here as the agent emits reasoning, tool, and outcome telemetry." icon={GitBranch} />;
  return <div className={cx('relative', compact ? 'space-y-1' : 'space-y-2')} data-testid="trace-timeline">{events.slice(0, compact ? 6 : undefined).map((event, index) => <div key={event.id} className="group relative flex gap-3" data-testid={`trace-event-${event.id}`}><div className="relative flex w-7 shrink-0 justify-center"><div className={cx('z-10 grid h-7 w-7 place-items-center rounded-md border', event.status === 'error' ? 'border-rose-200 bg-rose-50 text-rose-600' : event.status === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-600' : event.type === 'tool_call' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-primary/20 bg-primary/5 text-primary')}><EventIcon type={event.type} /></div>{index < (compact ? Math.min(events.length, 6) : events.length) - 1 && <div className="absolute top-7 h-[calc(100%+8px)] w-px bg-border group-hover:bg-primary/30" />}</div><div className={cx('mb-1 min-w-0 flex-1 rounded-lg border border-border/70 bg-card px-3 py-2.5 transition-colors hover:border-primary/25', compact ? 'py-2' : 'px-4 py-3')}><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex items-center gap-2"><span className="text-sm font-semibold">{event.title}</span><span className="font-mono text-[9px] uppercase tracking-[.13em] text-muted-foreground">{event.type.replace('_', ' ')}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{event.detail}</p></div><StatusPill value={event.status} /></div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-muted-foreground"><span>{formatDate(event.timestamp)}</span><span>{formatDuration(event.durationMs)}</span><span>{formatNumber(event.tokens)} tokens</span><span>{formatMoney(event.cost)}</span></div></div></div>)}</div>;
}

function Dashboard() {
  const summaryQuery = useGetDashboardSummary();
  const runsQuery = useListRuns({ limit: 8 });
  const anomaliesQuery = useListAnomalies({ status: 'open' });
  const runs = runsQuery.data ?? [];
  const [selectedRunId, setSelectedRunId] = useState('');
  useEffect(() => { if (!selectedRunId && runs[0]?.id) setSelectedRunId(runs[0].id); }, [runs, selectedRunId]);
  const eventOptions = useMemo(() => ({ query: { enabled: Boolean(selectedRunId), queryKey: getGetRunEventsQueryKey(selectedRunId || 'dashboard') } }), [selectedRunId]);
  const eventsQuery = useGetRunEvents(selectedRunId || 'dashboard', eventOptions);
  const summary = summaryQuery.data as DashboardSummary | undefined;
  return <div className="animate-rise-in"><PageHeading eyebrow="Operations / live workspace" title="Observe the system, not just the outcome." description="A clean line from business result to the exact semantic step that shaped it. Your autonomous systems, under a microscope." action={<div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Ingesting live</div>} />
    {(summaryQuery.isError || runsQuery.isError || anomaliesQuery.isError) && <QueryError onRetry={() => { summaryQuery.refetch(); runsQuery.refetch(); anomaliesQuery.refetch(); }} />}
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Workspace summary">{summaryQuery.isLoading ? <LoadingRows count={4} /> : <><StatCard label="Active runs" value={formatNumber(summary?.activeRuns)} detail={`${formatNumber(summary?.totalRuns)} captured this period`} trend={summary?.outcomeTrend} icon={Activity} /><StatCard label="Success rate" value={`${((summary?.successRate ?? 0) * 100).toFixed(1)}%`} detail="outcomes above target" trend={summary?.outcomeTrend} color="#3b9a79" icon={ShieldCheck} /><StatCard label="Total cost" value={formatMoney(summary?.totalCost)} detail={`${formatMoney(summary?.avgCost)} average per run`} trend={summary?.costTrend} color="#df9a36" icon={Gauge} /><StatCard label="Open anomalies" value={formatNumber(summary?.openAnomalies)} detail={`${formatDuration(summary?.avgLatencyMs)} average latency`} trend={summary?.costTrend} color="#d95b4d" icon={AlertTriangle} /></>}</section>
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,.85fr)]">
      <section className="min-w-0 rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><div className="flex items-center justify-between border-b border-border px-4 py-4"><div><h2 className="font-semibold">Recent runs</h2><p className="mt-1 text-xs text-muted-foreground">The latest execution records across your agent fleet.</p></div><Link href="/runs" className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/70" data-testid="link-view-all-runs">View explorer <ArrowRight className="h-3.5 w-3.5" /></Link></div>{runsQuery.isLoading ? <div className="p-4"><LoadingRows /></div> : runs.length ? <div>{runs.map((run) => <RunRow key={run.id} run={run} />)}</div> : <div className="p-4"><EmptyState title="No runs captured" description="Connect a telemetry source to see autonomous executions appear here." /></div>}</section>
      <section className="min-w-0 rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><div className="flex items-center justify-between border-b border-border px-4 py-4"><div><h2 className="font-semibold">Open anomalies</h2><p className="mt-1 text-xs text-muted-foreground">Signals that need an engineer's attention.</p></div><Link href="/anomalies" className="text-xs font-semibold text-primary hover:text-primary/70" data-testid="link-view-all-anomalies">View queue</Link></div>{anomaliesQuery.isLoading ? <div className="p-4"><LoadingRows count={3} /></div> : anomaliesQuery.data?.length ? <div>{anomaliesQuery.data.slice(0, 4).map((anomaly) => <AnomalyRow anomaly={anomaly} key={anomaly.id} />)}</div> : <div className="p-4"><EmptyState title="Signal is clean" description="No open anomalies are asking for attention." icon={ShieldCheck} /></div>}</section>
    </div>
    <section className="mt-6 rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><h2 className="font-semibold">Selected semantic trace</h2><span className="rounded bg-secondary px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{selectedRunId || 'awaiting run'}</span></div><p className="mt-1 text-xs text-muted-foreground">Move from the outcome into the reasoning chain, without losing context.</p></div>{selectedRunId && <Link href={`/runs/${selectedRunId}`} className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/70" data-testid="link-open-selected-trace">Open full trace <ExternalLink className="h-3.5 w-3.5" /></Link>}</div><div className="grid-radar p-4 md:p-6">{eventsQuery.isLoading ? <LoadingRows count={3} /> : <TraceTimeline events={eventsQuery.data} compact />}</div></section>
  </div>;
}

function RunsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const params = useMemo(() => ({ search: search || undefined, status: status === 'all' ? undefined : status as 'completed' | 'running' | 'failed' | 'anomalous', limit: 100 }), [search, status]);
  const query = useListRuns(params);
  return <div className="animate-rise-in"><PageHeading eyebrow="Operations / run explorer" title="Every run has a paper trail." description="Search executions by workflow, customer, or agent. Filter the fleet down to the exact behavior you need to inspect." action={<Link href="/settings" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:border-primary/40 hover:text-primary" data-testid="link-configure-telemetry"><ServerCog className="h-4 w-4" /> Configure source</Link>} />
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_hsl(var(--foreground)/.03)] md:flex-row"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-primary" placeholder="Search workflow, agent, customer…" data-testid="input-search-runs" />{search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary" data-testid="button-clear-run-search"><X className="h-3.5 w-3.5" /></button>}</label><div className="flex items-center gap-2"><ListFilter className="ml-1 h-4 w-4 text-muted-foreground" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="select-run-status"><option value="all">All statuses</option><option value="running">Running</option><option value="completed">Completed</option><option value="anomalous">Anomalous</option><option value="failed">Failed</option></select></div></div>
    {query.isError && <QueryError onRetry={() => query.refetch()} />}{query.isLoading ? <LoadingRows count={7} /> : query.data?.length ? <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><div className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(120px,1fr)_100px_90px_110px] gap-3 border-b border-border bg-secondary/60 px-4 py-2.5 font-mono text-[9px] uppercase tracking-[.16em] text-muted-foreground md:grid"><span>Run / workflow</span><span>Model</span><span>Latency</span><span>Cost</span><span>Status</span></div>{query.data.map((run) => <RunRow key={run.id} run={run} compact />)}</div> : <EmptyState title="No runs match that filter" description="Try a broader search or reset the status filter to inspect the full capture window." icon={Search} />}
  </div>;
}

function RunDetail() {
  const { runId = '' } = useParams<{ runId: string }>();
  const runQuery = useGetRun(runId);
  const eventsQuery = useGetRunEvents(runId);
  const replayMutation = useReplayRun();
  const [fromSequence, setFromSequence] = useState('');
  const [toSequence, setToSequence] = useState('');
  const [useContext, setUseContext] = useState(true);
  const run = runQuery.data;
  const eventCount = eventsQuery.data?.length ?? run?.eventCount ?? 0;
  const replay = () => replayMutation.mutate({ runId, data: { fromSequence: fromSequence ? Number(fromSequence) : undefined, toSequence: toSequence ? Number(toSequence) : undefined, useOriginalContext: useContext } });
  if (runQuery.isLoading) return <div className="animate-rise-in"><PageHeading eyebrow="Run / loading" title="Reconstructing the record…" description="Fetching the run context and semantic trace." /><LoadingRows count={5} /></div>;
  if (runQuery.isError || !run) return <QueryError onRetry={() => runQuery.refetch()} />;
  return <div className="animate-rise-in"><div className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"><Link href="/runs" className="flex items-center gap-1 hover:text-primary" data-testid="link-back-runs"><ArrowLeft className="h-3.5 w-3.5" /> Runs</Link><ChevronRight className="h-3 w-3" /><span className="font-mono">{run.id}</span></div><PageHeading eyebrow={`Run / ${run.agentName}`} title={run.workflow} description={`${run.customer} · captured ${formatDate(run.startedAt)} · ${run.model}`} action={<div className="flex items-center gap-2"><StatusPill value={run.status} /><Link href="/runs" className="hidden rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-secondary sm:block" data-testid="link-return-explorer">Return to explorer</Link></div>} />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="Outcome score" value={`${(run.outcomeScore * 100).toFixed(1)}%`} detail={run.outcome} icon={ShieldCheck} /><StatCard label="Duration" value={formatDuration(run.durationMs)} detail={`${eventCount} semantic events`} icon={Clock3} /><StatCard label="Tool calls" value={formatNumber(run.toolCallCount)} detail={`${formatNumber(run.totalTokens)} total tokens`} icon={TerminalSquare} /><StatCard label="Run cost" value={formatMoney(run.cost)} detail="captured provider cost" icon={Gauge} /></div>
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.72fr)]"><section className="min-w-0 rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><div className="flex items-center justify-between border-b border-border px-4 py-4"><div><h2 className="font-semibold">Semantic event trace</h2><p className="mt-1 text-xs text-muted-foreground">Ordered by capture sequence · {eventCount} events</p></div><div className="font-mono text-[10px] text-muted-foreground">SEQ 001—{String(eventCount).padStart(3, '0')}</div></div><div className="grid-radar p-4 md:p-6">{eventsQuery.isLoading ? <LoadingRows count={5} /> : eventsQuery.isError ? <QueryError onRetry={() => eventsQuery.refetch()} /> : <TraceTimeline events={eventsQuery.data} />}</div></section><aside className="space-y-4"><div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-accent/25 text-amber-700"><Play className="h-4 w-4" /></div><div><h2 className="font-semibold">Replay this run</h2><p className="text-xs text-muted-foreground">Re-run with captured context</p></div></div><div className="mt-5 space-y-3"><label className="block text-xs font-semibold text-muted-foreground">From sequence<input type="number" min="1" value={fromSequence} onChange={(event) => setFromSequence(event.target.value)} placeholder="1" className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary" data-testid="input-replay-from" /></label><label className="block text-xs font-semibold text-muted-foreground">To sequence<input type="number" min="1" value={toSequence} onChange={(event) => setToSequence(event.target.value)} placeholder={String(eventCount || 1)} className="mt-1.5 h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary" data-testid="input-replay-to" /></label><label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={useContext} onChange={(event) => setUseContext(event.target.checked)} className="accent-[hsl(var(--primary))]" data-testid="checkbox-original-context" /> Preserve original context</label><button onClick={replay} disabled={replayMutation.isPending} className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-xs font-semibold text-primary-foreground shadow-sm hover:-translate-y-0.5 hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60" data-testid="button-replay-run"><Play className="h-3.5 w-3.5" />{replayMutation.isPending ? 'Queueing replay…' : 'Queue replay'}</button>{replayMutation.data && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800" data-testid="status-replay-success"><div className="flex items-center gap-2 font-semibold"><Check className="h-3.5 w-3.5" /> Replay {replayMutation.data.status}</div><p className="mt-1">{replayMutation.data.message}</p></div>}{replayMutation.isError && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="status-replay-error">Replay could not be queued. Check the run state and try again.</div>}</div></div>{run.hasAnomaly && <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"><div className="flex items-center gap-2 text-amber-800"><AlertTriangle className="h-4 w-4" /><h2 className="font-semibold">Anomaly signal present</h2></div><p className="mt-2 text-xs leading-5 text-amber-800/75">This run diverged from its expected execution shape. Inspect correction events and tool results before replaying.</p><Link href="/anomalies" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline" data-testid="link-inspect-anomalies">Inspect anomaly queue <ArrowRight className="h-3.5 w-3.5" /></Link></div>}<div className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><h2 className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Run context</h2><dl className="mt-4 space-y-3 text-xs"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Started</dt><dd className="font-mono text-right">{formatDate(run.startedAt)}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Completed</dt><dd className="font-mono text-right">{formatDate(run.completedAt)}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Agent</dt><dd className="font-mono text-right">{run.agentName}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Workflow</dt><dd className="font-mono text-right">{run.workflow}</dd></div></dl></div></aside></div>
  </div>;
}

function AnomaliesPage() {
  const [status, setStatus] = useState('open');
  const query = useListAnomalies({ status: status as 'open' | 'acknowledged' | 'resolved' | 'all' });
  return <div className="animate-rise-in"><PageHeading eyebrow="Operations / anomaly queue" title="The outliers are the story." description="Detection context for behavior that fell outside the expected execution shape. Start at the signal, then follow it into the run." action={<div className="flex items-center gap-2 rounded-lg border border-border bg-card p-1"><SlidersHorizontal className="ml-2 h-3.5 w-3.5 text-muted-foreground" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-8 bg-transparent px-2 text-xs font-semibold outline-none" data-testid="select-anomaly-status"><option value="open">Open signals</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option><option value="all">All signals</option></select></div>} />
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4"><div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4"><div className="font-mono text-[10px] uppercase tracking-[.16em] text-rose-700">Open signals</div><div className="mt-2 text-2xl font-semibold text-rose-900">{query.data?.filter((item) => item.status === 'open').length ?? '—'}</div></div><div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"><div className="font-mono text-[10px] uppercase tracking-[.16em] text-amber-700">Step drift</div><div className="mt-2 text-2xl font-semibold text-amber-900">+{query.data?.reduce((sum, item) => sum + Math.max(0, item.stepCount - item.expectedSteps), 0) ?? '—'}</div></div><div className="rounded-xl border border-border bg-card p-4"><div className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Acknowledged</div><div className="mt-2 text-2xl font-semibold">{query.data?.filter((item) => item.status === 'acknowledged').length ?? '—'}</div></div><div className="rounded-xl border border-border bg-card p-4"><div className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Detection mode</div><div className="mt-2 flex items-center gap-2 text-sm font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Semantic</div></div></div>
    {query.isError && <QueryError onRetry={() => query.refetch()} />}{query.isLoading ? <LoadingRows count={5} /> : query.data?.length ? <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/.03)]">{query.data.map((anomaly) => <AnomalyRow key={anomaly.id} anomaly={anomaly} />)}</div> : <EmptyState title="No anomalies in this queue" description="The detector has not found a signal at this status. Keep the queue open while agents are running." icon={ShieldCheck} />}
  </div>;
}

function SettingsPage() {
  const [runId, setRunId] = useState('');
  const [eventType, setEventType] = useState<TelemetryEventInput['type']>('context');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [tokens, setTokens] = useState('');
  const [cost, setCost] = useState('');
  const [result, setResult] = useState('');
  const telemetryMutation = useIngestTelemetryEvent();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    telemetryMutation.mutate({ data: { runId, type: eventType, title, detail, tokens: tokens ? Number(tokens) : undefined, cost: cost ? Number(cost) : undefined } }, { onSuccess: (response) => { setResult(`Accepted as sequence ${response.sequence} · ${response.semanticType}`); setTitle(''); setDetail(''); } });
  };
  return <div className="animate-rise-in"><PageHeading eyebrow="Workspace / configuration" title="Make the recorder yours." description="Connect semantic telemetry and shape the operating surface around the signals your team trusts." action={<div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" /> Workspace ready</div>} />
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,.8fr)]"><section className="rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><div className="border-b border-border px-5 py-4"><div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary"><DatabaseZap className="h-4 w-4" /></div><div><h2 className="font-semibold">Send a semantic event</h2><p className="text-xs text-muted-foreground">Test the MCP-shaped ingest path without leaving the console.</p></div></div></div><form onSubmit={submit} className="space-y-4 p-5"><label className="block text-xs font-semibold">Run ID<input required value={runId} onChange={(event) => setRunId(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary" placeholder="run_…" data-testid="input-telemetry-run-id" /></label><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="block text-xs font-semibold">Semantic type<select value={eventType} onChange={(event) => setEventType(event.target.value as TelemetryEventInput['type'])} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" data-testid="select-telemetry-type"><option value="context">Context</option><option value="reasoning">Reasoning</option><option value="tool_call">Tool call</option><option value="tool_result">Tool result</option><option value="correction">Correction</option><option value="output">Output</option></select></label><label className="block text-xs font-semibold">Title<input required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" placeholder="Retrieved account context" data-testid="input-telemetry-title" /></label></div><label className="block text-xs font-semibold">Detail<textarea required value={detail} onChange={(event) => setDetail(event.target.value)} rows={4} className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:border-primary" placeholder="What did the agent observe or decide?" data-testid="textarea-telemetry-detail" /></label><div className="grid grid-cols-2 gap-4"><label className="block text-xs font-semibold">Tokens<input type="number" min="0" value={tokens} onChange={(event) => setTokens(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary" placeholder="0" data-testid="input-telemetry-tokens" /></label><label className="block text-xs font-semibold">Cost<input type="number" min="0" step="0.000001" value={cost} onChange={(event) => setCost(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs outline-none focus:border-primary" placeholder="0.00" data-testid="input-telemetry-cost" /></label></div><button disabled={telemetryMutation.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:-translate-y-0.5 disabled:opacity-60" data-testid="button-submit-telemetry"><Zap className="h-3.5 w-3.5" /> {telemetryMutation.isPending ? 'Submitting…' : 'Submit event'}</button>{result && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 font-mono text-xs text-emerald-800" data-testid="status-telemetry-success">{result}</div>}{telemetryMutation.isError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="status-telemetry-error">The event was rejected. Check the run ID and payload, then try again.</div>}</form></section><div className="space-y-6"><section className="rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_hsl(var(--foreground)/.03)]"><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-primary" /><h2 className="font-semibold">Workspace preferences</h2></div><div className="mt-5 space-y-4"><div className="flex items-center justify-between gap-4"><div><div className="text-sm font-semibold">Auto-expand anomalies</div><div className="mt-1 text-xs leading-5 text-muted-foreground">Open the first divergent step when a signal is detected.</div></div><div className="h-5 w-9 rounded-full bg-primary p-0.5"><div className="h-4 w-4 translate-x-4 rounded-full bg-primary-foreground shadow-sm" /></div></div><div className="flex items-center justify-between gap-4"><div><div className="text-sm font-semibold">Retain original context</div><div className="mt-1 text-xs leading-5 text-muted-foreground">Include captured context when queuing a replay.</div></div><div className="h-5 w-9 rounded-full bg-primary p-0.5"><div className="h-4 w-4 translate-x-4 rounded-full bg-primary-foreground shadow-sm" /></div></div></div></section><section className="rounded-xl border border-border bg-sidebar p-5 text-sidebar-foreground"><div className="flex items-center gap-2 text-sidebar-primary"><Code2 className="h-4 w-4" /><h2 className="font-semibold text-white">MCP connection</h2></div><p className="mt-3 text-xs leading-6 text-sidebar-foreground/70">Send events from any agent runtime with the semantic telemetry endpoint. The recorder preserves parent links, sequence order, cost, and tool context.</p><div className="mt-4 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3 font-mono text-[10px] leading-5 text-sidebar-foreground/70">POST /api/telemetry/events<br /><span className="text-sidebar-primary">x-agentops-workspace</span>: production</div></section></div></div>
  </div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={Dashboard} /><Route path="/runs" component={RunsPage} /><Route path="/runs/:runId" component={RunDetail} /><Route path="/anomalies" component={AnomaliesPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;