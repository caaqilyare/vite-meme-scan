import { ScrollView, View, Text, StyleSheet, Pressable, TextInput, Modal, Clipboard } from "react-native";
import Card from "../components/Card";
import { Stat } from "../components/Stat";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { type } from "../theme/typography";
import useSWR from "swr";
import { api } from "../api/client";
import { useEffect, useMemo, useState } from "react";
import { exportProfileHistoryPdf } from "../lib/pdfExport";
import { useRef } from "react";

export function ProfileScreen() {
  const { data, mutate, isLoading, error } = useSWR("/state", api.getState, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const name = data?.user?.name ?? "";
  const balance = data?.user?.balance ?? 0;
  const [nameInput, setNameInput] = useState<string>(name);
  const [depositAmt, setDepositAmt] = useState<string>("");
  const avatarLetter = useMemo(() => (nameInput || name || "?").slice(0, 1).toUpperCase(), [nameInput, name]);
  const [editMode, setEditMode] = useState(false);
  const [tab, setTab] = useState<'account'|'history'>('account');
  const [selectedMint, setSelectedMint] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historySort, setHistorySort] = useState<'recent'|'pnl'|'alpha'>('recent');
  const [toast, setToast] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const panelRef = useRef<View | null>(null);

  useEffect(() => {
    // sync inputs when state arrives/refetches
    setNameInput(name);
  }, [name]);

  // No manual PnL override; PnL is computed automatically from history

  async function onSaveName() {
    const n = (nameInput || "").trim();
    if (n.length < 2) return;
    await api.updateUser({ name: n });
    await mutate();
    setEditMode(false);
    setToast("Profile saved");
    setTimeout(() => setToast(null), 1500);
  }

  // Web-only: dynamic load html2canvas and capture profile area referenced by panelRef
  async function ensureHtml2Canvas(): Promise<any> {
    if (typeof window === 'undefined') throw new Error('Not supported');
    const w = window as any;
    if (w.html2canvas) return w.html2canvas;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('html2canvas failed to load'));
      document.head.appendChild(script);
    });
    return (window as any).html2canvas;
  }

  async function captureProfile(mode: 'copy' | 'download') {
    try {
      setIsCapturing(true);
      setCaptureMsg(null);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (typeof window === 'undefined') throw new Error('Capture only supported on web');
      const html2canvas = await ensureHtml2Canvas();
      const node = (panelRef.current as unknown as HTMLElement) || document.body;
      const canvas = await html2canvas(node, { backgroundColor: colors.background });
      if (mode === 'download') {
        const link = document.createElement('a');
        link.download = `${(name || 'profile')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        setCaptureMsg('Screenshot downloaded');
        setTimeout(() => setCaptureMsg(null), 1800);
      } else {
        const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve as any));
        if (!blob) throw new Error('Failed to create image');
        if ((navigator as any).clipboard && (window as any).ClipboardItem) {
          await (navigator as any).clipboard.write([
            new (window as any).ClipboardItem({ 'image/png': blob })
          ]);
          setCaptureMsg('Image copied to clipboard');
          setTimeout(() => setCaptureMsg(null), 1800);
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `${(name || 'profile')}.png`; a.click();
          URL.revokeObjectURL(url);
          setCaptureMsg('Screenshot downloaded');
          setTimeout(() => setCaptureMsg(null), 1800);
        }
      }
    } catch (e: any) {
      setCaptureMsg(e?.message || 'Capture failed');
      setTimeout(() => setCaptureMsg(null), 2200);
    } finally {
      setIsCapturing(false);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
        await (navigator as any).clipboard.writeText(text);
      } else if (Clipboard && typeof (Clipboard as any).setString === 'function') {
        await (Clipboard as any).setString(text);
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setToast('Copied');
      setTimeout(() => setToast(null), 1000);
    } catch (e) {
      setToast('Copy failed');
      setTimeout(() => setToast(null), 1000);
    }
  }

  async function onResetAll() {
    const fresh = await api.reset();
    await mutate(fresh, { revalidate: false });
    setNameInput(fresh.user.name ?? '');
    setDepositAmt("");
    setEditMode(false);
    setToast('All data reset');
    setTimeout(() => setToast(null), 1500);
    setShowResetModal(false);
  }

  async function onExportPdf() {
    try {
      setIsExporting(true);
      await exportProfileHistoryPdf({
        user: { name: data?.user?.name ?? '', balance: data?.user?.balance ?? 0 },
        deposits: (data?.deposits ?? []) as Array<{ ts: number; amount: number }>,
        history: (data?.history || []).map(h => ({
          id: h.id,
          ts: h.ts,
          side: h.side,
          price: h.price,
          qty: h.qty,
          value: h.value,
          mint: h.mint,
          name: (h as any).name,
          symbol: (h as any).symbol,
          marketCap: (h as any).marketCap,
        })),
        totalPnlOverride: totalRealizedPnl,
      });
      setToast('PDF exported');
      setTimeout(() => setToast(null), 1500);
    } catch (e: any) {
      setToast(e?.message || 'Export failed');
      setTimeout(() => setToast(null), 1800);
    } finally {
      setIsExporting(false);
    }
  }

  // Stats
  const totalBuys = (data?.history || []).filter(h => h.side === 'buy').length;
  const totalRealizedPnl = useMemo(() => {
    const hist = (data?.history || []).slice();
    if (!hist.length) return 0;
    const byMint: Record<string, typeof hist> = {} as any;
    for (const ev of hist) (byMint[ev.mint] ||= []).push(ev);
    let total = 0;
    for (const mint of Object.keys(byMint)) {
      total += computeSummary(byMint[mint]).realizedPnl;
    }
    return Number(total.toFixed(2));
  }, [data?.history]);
  // Realized PnL is computed automatically
  const winRate = useMemo(() => {
    const hist = (data?.history || []).slice().sort((a,b)=>a.ts-b.ts);
    const avgByMint: Record<string, { qty: number; avg: number }> = {};
    let wins = 0, sells = 0;
    for (const ev of hist) {
      if (ev.side === 'buy') {
        const s = avgByMint[ev.mint] || { qty: 0, avg: 0 };
        const newQty = s.qty + ev.qty;
        const newAvg = newQty > 0 ? ((s.avg * s.qty) + (ev.price * ev.qty)) / newQty : 0;
        avgByMint[ev.mint] = { qty: newQty, avg: newAvg };
      } else if (ev.side === 'sell') {
        const s = avgByMint[ev.mint];
        if (s && s.qty > 0) {
          const pnl = (ev.price - s.avg) * ev.qty;
          sells += 1;
          if (pnl > 0) wins += 1;
          // reduce qty (FIFO-avg assumption)
          const rem = Math.max(0, s.qty - ev.qty);
          avgByMint[ev.mint] = { qty: rem, avg: s.avg };
        }
      }
    }
    return sells > 0 ? wins / sells : 0;
  }, [data?.history]);

  // Build per-token summaries and lists for History tab
  function renderTokenHistoryList() {
    const hist = (data?.history || []).slice().sort((a,b)=>b.ts-a.ts);
    if (hist.length === 0) {
      return <Text style={styles.bodyText}>No history yet.</Text>;
    }
    // Group by mint
    const byMint: Record<string, typeof hist> = {} as any;
    for (const ev of hist) {
      (byMint[ev.mint] ||= []).push(ev);
    }
    let mints = Object.keys(byMint);
    // Build summaries for sorting and expose labels for filtering
    const summaries = mints.map(mint => {
      const events = byMint[mint];
      const symbol = events.find(e=>e.symbol)?.symbol;
      const name = events.find(e=>e.name)?.name;
      const label = symbol || name || `${mint.slice(0,4)}…${mint.slice(-4)}`;
      const summary = computeSummary(events);
      return { mint, label: (label||'').toLowerCase(), summary };
    });
    // Filter by query
    const q = (historyQuery || '').toLowerCase().trim();
    let filtered = summaries.filter(s => !q || s.label.includes(q) || s.mint.toLowerCase().includes(q));
    // Sort by selected mode
    if (historySort === 'recent') {
      filtered.sort((a,b) => (b.summary.lastTs || 0) - (a.summary.lastTs || 0));
    } else if (historySort === 'pnl') {
      filtered.sort((a,b) => (b.summary.realizedPnl) - (a.summary.realizedPnl));
    } else if (historySort === 'alpha') {
      filtered.sort((a,b) => a.label.localeCompare(b.label));
    }
    mints = filtered.map(f => f.mint);
    return (
      <View style={styles.tokenGrid}>
        {mints.map((mint) => {
          const events = byMint[mint];
          const symbol = events.find(e=>e.symbol)?.symbol;
          const name = events.find(e=>e.name)?.name;
          const label = symbol || name || `${mint.slice(0,4)}…${mint.slice(-4)}`;
          const summary = computeSummary(events);
          const items = getTodos(mint);
          const pct = items.length ? Math.round(items.filter(i=>i.done).length / items.length * 100) : 0;
          const pnlStyle = (summary.realizedPnl>=0) ? { borderColor: colors.buy, color: colors.buy } : { borderColor: colors.sell, color: colors.sell };
          return (
            <Pressable key={mint} onPress={() => setSelectedMint(mint)} style={[styles.tokenCardItem, styles.clickableRow]}>
              <View style={{ gap: 4 }}>
                <View style={styles.cardItemHeader}>
                  <Text style={styles.cardItemTitle} numberOfLines={1}>{label}</Text>
                  <Text style={[styles.tokenPill, pnlStyle]}>{summary.realizedPnl>=0?'▲ +':'▼ -'}${Math.abs(summary.realizedPnl).toFixed(2)}</Text>
                </View>
                <Text style={styles.cardItemSub} numberOfLines={2}>{narrative(summary)}</Text>
                <Text style={styles.cardItemMeta}>Buys {summary.totalBuys} · Sells {summary.totalSells} · Qty {summary.netQty.toFixed(6)}</Text>
              </View>
              <View style={styles.cardItemFooter}>
                <View style={styles.progressMiniBar}><View style={[styles.progressFill, { width: `${pct}%` }]} /></View>
                <Text style={styles.progressMiniText}>{pct}%</Text>
                <View style={{ flex: 1 }} />
                <View style={[styles.smallBtn, styles.smallBtnPrimary]}>
                  <Text style={styles.smallBtnText}>Open</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  function renderChecklistProgress(mint: string) {
    const items = getTodos(mint);
    const total = items.length || 0;
    const done = items.filter(i => i.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
      <View style={styles.progressWrap}>
        <Text style={styles.progressText}>{pct}%</Text>
        <View style={styles.progressBar}> 
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
      </View>
    );
  }

  type Summary = {
    firstTs: number | null;
    lastTs: number | null;
    totalBuys: number;
    totalSells: number;
    boughtQty: number;
    soldQty: number;
    netQty: number;
    avgCost: number | null;
    realizedPnl: number; // based on avg cost method
    lastAction: 'buy'|'sell'|null;
  };

  function computeSummary(events: Array<{ ts: number; side: 'buy'|'sell'; price: number; qty: number; }>): Summary {
    const sorted = events.slice().sort((a,b)=>a.ts-b.ts);
    let qty = 0;
    let avg = 0;
    let realized = 0;
    let buys = 0, sells = 0;
    let firstTs: number | null = null, lastTs: number | null = null;
    for (const ev of sorted) {
      firstTs = firstTs ?? ev.ts;
      lastTs = ev.ts;
      if (ev.side === 'buy') {
        buys += 1;
        const newQty = qty + ev.qty;
        avg = newQty > 0 ? ((avg * qty) + (ev.price * ev.qty)) / newQty : 0;
        qty = newQty;
      } else {
        sells += 1;
        const sellQty = Math.min(qty, ev.qty);
        realized += (ev.price - avg) * sellQty;
        qty = Math.max(0, qty - sellQty);
      }
    }
    const lastAction = events[0]?.side ?? null; // events is reverse sorted in render, so [0] is last
    return {
      firstTs,
      lastTs,
      totalBuys: buys,
      totalSells: sells,
      boughtQty: sorted.filter(e=>e.side==='buy').reduce((s,e)=>s+e.qty,0),
      soldQty: sorted.filter(e=>e.side==='sell').reduce((s,e)=>s+e.qty,0),
      netQty: qty,
      avgCost: qty>0 ? avg : (buys>0 ? avg : null),
      realizedPnl: Number(realized.toFixed(2)),
      lastAction,
    };
  }

  function narrative(s: Summary) {
    const first = s.firstTs ? new Date(s.firstTs).toLocaleDateString() : '—';
    const last = s.lastTs ? new Date(s.lastTs).toLocaleDateString() : '—';
    const took = s.totalBuys>0 ? `Started ${first}` : 'No buys yet';
    const lastAct = s.lastAction ? `Last ${s.lastAction} ${last}` : '';
    const pos = s.netQty>0 ? `Holding ${s.netQty.toFixed(4)} @ $${(s.avgCost ?? 0).toFixed(8)}` : 'No position';
    return `${took} · ${pos} · ${lastAct}`;
  }

  function shortAddress(addr: string) {
    if (!addr) return addr;
    if (addr.length <= 14) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
  }

  function renderTokenDetails(mint: string) {
    const events = (data?.history || []).filter(h => h.mint === mint).sort((a,b)=>a.ts-b.ts);
    if (events.length === 0) return null;
    const symbol = events.find(e=>e.symbol)?.symbol;
    const name = events.find(e=>e.name)?.name;
    const label = symbol || name || `${mint.slice(0,4)}…${mint.slice(-4)}`;
    const s = computeSummary(events);
    const firstBuy = events.find(e => e.side === 'buy' && typeof (e as any).marketCap === 'number') as any;
    const lastSell = [...events].reverse().find(e => e.side === 'sell' && typeof (e as any).marketCap === 'number') as any;
    const letter = `I started ${s.totalBuys>0 ? 'buying' : 'watching'} ${label} on ${s.firstTs ? new Date(s.firstTs).toLocaleString() : '—'}. ` +
      `${s.totalBuys} buys and ${s.totalSells} sells so far. ` +
      `${s.netQty>0 ? `Currently holding ${s.netQty.toFixed(6)} with an average cost of $${(s.avgCost ?? 0).toFixed(8)}.` : 'Currently no position.'} ` +
      `Realized PnL: ${s.realizedPnl>=0?'+':''}$${s.realizedPnl.toFixed(2)}.`;

    let runQty = 0;
    let runAvg = 0;
    const rows = events.map(ev => {
      if (ev.side === 'buy') {
        const newQty = runQty + ev.qty;
        runAvg = newQty > 0 ? ((runAvg * runQty) + (ev.price * ev.qty)) / newQty : 0;
        runQty = newQty;
      } else {
        runQty = Math.max(0, runQty - ev.qty);
      }
      return { ...ev, runQty, runAvg };
    });

    return (
      <Card variant="glass" style={styles.tokenDetailCard}>
        <View style={styles.detailHeaderRow}>
          <Text style={styles.detailTitle}>{label}</Text>
          <Pressable onPress={() => setSelectedMint(null)} style={[styles.pillBtn, styles.pillBtnActive, styles.headerAction]}>
            <Text style={[styles.pillBtnText, styles.pillBtnTextActive]}>Back</Text>
          </Pressable>
        </View>
        <View style={styles.detailGrid}>
          {/* Overview card */}
          <View style={[styles.detailCardItem, { flexBasis: '100%' }]}>
            <Text style={styles.detailParagraph}>{letter}</Text>
            <View style={styles.addrRow}>
              <Pressable onPress={() => copyToClipboard(mint)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text style={styles.addrMono} numberOfLines={1}>Address: {shortAddress(mint)}</Text>
              </Pressable>
              <View style={styles.actionsRow}>
                <Pressable onPress={() => copyToClipboard(mint)} style={[styles.pillBtn, styles.ghostPill, styles.headerActionSm]}>
                  <Text style={styles.pillBtnText}>Copy</Text>
                </Pressable>
                <Pressable onPress={() => (typeof window !== 'undefined') && window.open(`https://solscan.io/token/${mint}`, '_blank')} style={[styles.pillBtn, styles.pillBtnActive, styles.headerActionSm]}>
                  <Text style={[styles.pillBtnText, styles.pillBtnTextActive]}>Explorer</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.badgesRow}>
              {firstBuy && (
                <View style={styles.badgeChip}><Text style={styles.badgeText}>MC Buy <Text style={styles.badgeEm}>${firstBuy.marketCap.toLocaleString()}</Text></Text></View>
              )}
              {lastSell && (
                <View style={styles.badgeChip}><Text style={styles.badgeText}>MC Sell <Text style={styles.badgeEm}>${lastSell.marketCap.toLocaleString()}</Text></Text></View>
              )}
            </View>
          </View>

          {/* Checklist card */}
          <View style={styles.detailCardItem}>
            <View style={styles.detailHeaderRow}>
              <Text style={styles.tokenSectionTitle}>Checklist</Text>
              {renderChecklistProgress(mint)}
            </View>
            {renderChecklist(mint)}
          </View>

          {/* Metrics card */}
          <View style={styles.detailCardItem}>
            <Text style={styles.tokenSectionTitle}>Metrics</Text>
            <View style={styles.badgesRow}>
              <View style={styles.badgeChip}><Text style={styles.badgeText}>Buys <Text style={styles.badgeEm}>{s.totalBuys}</Text></Text></View>
              <View style={styles.badgeChip}><Text style={styles.badgeText}>Sells <Text style={styles.badgeEm}>{s.totalSells}</Text></Text></View>
              <View style={styles.badgeChip}><Text style={styles.badgeText}>Net Qty <Text style={styles.badgeEm}>{s.netQty.toFixed(6)}</Text></Text></View>
              <View style={styles.badgeChip}><Text style={styles.badgeText}>Avg <Text style={styles.badgeEm}>${(s.avgCost ?? 0).toFixed(8)}</Text></Text></View>
              <View style={[styles.badgeChip, s.realizedPnl>=0 ? styles.badgeGood : styles.badgeBad]}>
                <Text style={[styles.badgeText, s.realizedPnl>=0 ? styles.badgeGoodText : styles.badgeBadText]}>PnL {s.realizedPnl>=0 ? '▲ +' : '▼ -'}${Math.abs(s.realizedPnl).toFixed(2)}</Text>
              </View>
            </View>
          </View>

          {/* Events card */}
          <View style={[styles.detailCardItem, { flexBasis: '100%' }]}>
            <Text style={styles.tokenSectionTitle}>Event history</Text>
            {rows.map(r => (
              <View key={r.id} style={styles.eventRow}>
                <Text style={[styles.activityPill, r.side === 'buy' ? styles.buyPill : styles.sellPill]}>{r.side.toUpperCase()}</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.activityMain}>{new Date(r.ts).toLocaleString()}</Text>
                  <Text style={styles.activitySub}>{r.qty} @ ${r.price} · Position {r.runQty.toFixed(6)} @ ${r.runAvg.toFixed(8)}</Text>
                  {typeof (r as any).marketCap === 'number' && (
                    <Text style={styles.activitySub}>MC at trade: ${(r as any).marketCap.toLocaleString()}</Text>
                  )}
                </View>
                <Text style={[styles.activityValue, r.side==='sell' ? styles.up : styles.down]}>{r.side==='sell' ? '▲ +' : '▼ -'}${Math.abs(r.value).toFixed(2)}</Text>
              </View>
            ))}
          </View>
        </View>
      </Card>
    );
  }

  function getDefaultTodos(mint: string) {
    return [
      { id: `${mint}-over20min`, text: 'Over 20 min Cool', done: false },
      { id: `${mint}-rsi30`, text: 'Bilow 30 RSI', done: false },
      { id: `${mint}-50k`, text: 'Bilow 50 K', done: false },
      { id: `${mint}-holders250`, text: '250 Holder above 300 good', done: false },
      { id: `${mint}-top20pct`, text: 'Bilow 20 % holder', done: false },
      { id: `${mint}-devsold`, text: 'Dev Sold', done: false },
      { id: `${mint}-fee5sol`, text: 'Over 5 Sol Fee', done: false },
      { id: `${mint}-before70k80k`, text: 'Before 70K or 80K', done: false },
      { id: `${mint}-curve90`, text: 'Over Curve 90 +', done: false },
      { id: `${mint}-nods`, text: 'No Ds', done: false },
      { id: `${mint}-nodummy`, text: 'No dummy address', done: false },
    ];
  }

  function getTodos(mint: string) {
    const arr = (data?.todos && data.todos[mint]) || getDefaultTodos(mint);
    return arr;
  }

  async function onToggleTodo(mint: string, id: string) {
    const items = getTodos(mint).map(it => it.id === id ? { ...it, done: !it.done } : it);
    // optimistic update
    const prev = data;
    const optimistic = {
      ...(prev || {}),
      todos: { ...(prev?.todos || {}), [mint]: items },
    } as any;
    await mutate(optimistic, { revalidate: false });
    try {
      const fresh = await api.setTodos({ mint, items });
      await mutate(fresh, { revalidate: false });
    } catch (e: any) {
      // rollback and show toast
      await mutate(prev, { revalidate: false });
      setToast(e?.message || 'Failed to save checklist');
      setTimeout(() => setToast(null), 1500);
    }
  }

  function renderChecklist(mint: string) {
    const items = getTodos(mint);
    return (
      <View style={{ marginBottom: 6 }}>
        {items.map(it => (
          <Pressable key={it.id} onPress={() => onToggleTodo(mint, it.id)} style={[styles.todoRow, styles.clickableRow]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <View style={[styles.todoBox, it.done && styles.todoBoxDone]}>
              {it.done ? <Text style={styles.todoCheck}>✓</Text> : null}
            </View>
            <Text style={[styles.todoText, it.done && styles.todoTextDone]}>{it.text}</Text>
          </Pressable>
        ))}
      </View>
    );
  }

  async function onDeposit() {
    const amt = Number(depositAmt);
    if (!Number.isFinite(amt) || amt <= 0) return;
    await api.deposit({ amount: amt });
    await mutate();
    setDepositAmt("");
    setToast("Funds added");
    setTimeout(() => setToast(null), 1500);
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View ref={panelRef as any}>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Profile</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={onExportPdf} disabled={isExporting} style={[styles.pillBtn, isExporting && styles.btnDisabled]}>
            <Text style={[styles.pillBtnText, isExporting && { color: colors.textSecondary }]}>{isExporting ? 'Exporting…' : 'Export PDF'}</Text>
          </Pressable>
          {!isCapturing && (
            <View style={styles.captureBar}>
              <Pressable onPress={() => captureProfile('copy')} style={[styles.pillBtn, styles.ghostPill]}>
                <Text style={styles.pillBtnText}>Copy</Text>
              </Pressable>
              <Pressable onPress={() => captureProfile('download')} style={[styles.pillBtn, styles.pillBtnActive]}>
                <Text style={[styles.pillBtnText, styles.pillBtnTextActive]}>Download</Text>
              </Pressable>
            </View>
          )}
          <Pressable onPress={() => setShowResetModal(true)} style={[styles.pillBtn, styles.pillBtnActive]}>
            <Text style={[styles.pillBtnText, styles.pillBtnTextActive]}>Reset</Text>
          </Pressable>
        </View>
      </View>
      {/* Hero banner */}
      <Card variant="glass" style={styles.banner}>
        <View style={styles.bannerRow}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.titleName}>{name || "—"}</Text>
            <Text style={styles.subtitleMuted}>@{(name || "").toLowerCase() || "username"}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setTab('account')} style={[styles.pillBtn, tab==='account' && styles.pillBtnActive]}>
              <Text style={[styles.pillBtnText, tab==='account' && styles.pillBtnTextActive]}>Account</Text>
            </Pressable>
            <Pressable onPress={() => setTab('history')} style={[styles.pillBtn, tab==='history' && styles.pillBtnActive]}>
              <Text style={[styles.pillBtnText, tab==='history' && styles.pillBtnTextActive]}>History</Text>
            </Pressable>
          </View>
        </View>
      </Card>

      {/* Stats */}
      {tab === 'account' && (
        <Card variant="glass" style={styles.statsCard}>
          <View style={styles.statsRow}>
            <Stat label="Balance" value={`$${balance.toFixed(2)}`} />
            <Stat label="Buys" value={`${totalBuys}`} />
            <Stat label="Win Rate" value={`${Math.round(winRate * 100)}%`} />
            <Stat label="Realized PnL" value={`${totalRealizedPnl>=0?'+':''}$${Math.abs(totalRealizedPnl).toFixed(2)}`} />
          </View>
        </Card>
      )}

      {tab === 'account' && (
      <Card variant="glass">
        <Text style={styles.cardTitle}>Account</Text>
        {isLoading ? <Text style={styles.bodyText}>Loading…</Text> : null}
        {error ? <Text style={[styles.bodyText, styles.error]}>Failed to load</Text> : null}

        {editMode ? (
          <View style={styles.formRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="caaqil"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, nameInput.trim().length < 2 && styles.inputInvalid]}
              />
            </View>
            <Pressable onPress={onSaveName} disabled={nameInput.trim().length < 2} style={[styles.primaryBtn, nameInput.trim().length < 2 && styles.btnDisabled]}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </Pressable>
            <Pressable onPress={() => { setEditMode(false); setNameInput(name); }} style={[styles.pillBtn]}>
              <Text style={styles.pillBtnText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.kvRow, { alignItems: 'center' }]}>
            <Text style={styles.kLabel}>Name</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.kValue}>{name || "—"}</Text>
              <Pressable onPress={() => { setEditMode(true); setNameInput(name); }} style={[styles.pillBtn]}>
                <Text style={styles.pillBtnText}>Edit</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.kvRow}>
          <Text style={styles.kLabel}>Balance</Text>
          <Text style={styles.kValue}>${balance.toFixed(2)}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kLabel}>Realized PnL</Text>
          <Text style={[styles.kValue, totalRealizedPnl>=0 ? styles.up : styles.down]}>{`${totalRealizedPnl>=0?'+':''}$${Math.abs(totalRealizedPnl).toFixed(2)}`}</Text>
        </View>
        <View style={styles.formRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Deposit</Text>
            <TextInput
              value={depositAmt}
              onChangeText={setDepositAmt}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
          <Pressable onPress={onDeposit} disabled={!(Number(depositAmt) > 0)} style={[styles.primaryBtn, !(Number(depositAmt) > 0) && styles.btnDisabled]}>
            <Text style={styles.primaryBtnText}>Add</Text>
          </Pressable>
        </View>
      </Card>
      )}

      {/* History tab content */}
      {tab === 'history' && (
        <>
          {selectedMint ? (
            renderTokenDetails(selectedMint)
          ) : (
            <Card variant="glass">
              {/* Deposits list */}
              {(data?.deposits && data.deposits.length > 0) && (
                <>
                  <View style={styles.historyHeaderRow}>
                    <Text style={styles.cardTitle}>Deposits</Text>
                  </View>
                  {(data.deposits as Array<{ ts: number; amount: number }> ).slice(0, 10).map((d: { ts: number; amount: number }, i: number) => (
                    <View key={i} style={styles.activityRow}>
                      <Text style={[styles.activityPill, styles.buyPill]}>DEPOSIT</Text>
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.activityMain}>You deposited ${d.amount.toFixed(2)}</Text>
                        <Text style={styles.activitySub}>{new Date(d.ts).toLocaleString()}</Text>
                      </View>
                      <Text style={styles.activityValue}>+${d.amount.toFixed(2)}</Text>
                    </View>
                  ))}
                  <View style={{ height: 8 }} />
                </>
              )}
              <View style={styles.historyHeaderRow}>
                <Text style={styles.cardTitle}>Your tokens</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setHistorySort('recent')} style={[styles.pillBtn, historySort==='recent' && styles.pillBtnActive]}>
                    <Text style={[styles.pillBtnText, historySort==='recent' && styles.pillBtnTextActive]}>Recent</Text>
                  </Pressable>
                  <Pressable onPress={() => setHistorySort('pnl')} style={[styles.pillBtn, historySort==='pnl' && styles.pillBtnActive]}>
                    <Text style={[styles.pillBtnText, historySort==='pnl' && styles.pillBtnTextActive]}>PnL</Text>
                  </Pressable>
                  <Pressable onPress={() => setHistorySort('alpha')} style={[styles.pillBtn, historySort==='alpha' && styles.pillBtnActive]}>
                    <Text style={[styles.pillBtnText, historySort==='alpha' && styles.pillBtnTextActive]}>A–Z</Text>
                  </Pressable>
                </View>
              </View>
              <TextInput
                value={historyQuery}
                onChangeText={setHistoryQuery}
                placeholder="Search name, symbol or address"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { marginTop: 6 }]}
              />
              {renderTokenHistoryList()}
            </Card>
          )}
        </>
      )}

      

      {/* Back button removed per request */}
      </View>

      {/* Toast */}
      {toast && (
        <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>
      )}
      {captureMsg && (
        <View style={styles.toast}><Text style={styles.toastText}>{captureMsg}</Text></View>
      )}

      {/* Confirm Reset Modal */}
      <Modal transparent visible={showResetModal} animationType="fade" onRequestClose={() => setShowResetModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reset all data?</Text>
            <Text style={styles.modalBody}>This will clear profile, balance, positions, and history.</Text>
            <View style={styles.modalRow}>
              <Pressable onPress={() => setShowResetModal(false)} style={[styles.modalBtn, styles.modalCancel]}>
                <Text style={styles.modalCancelText}>No</Text>
              </Pressable>
              <Pressable onPress={onResetAll} style={[styles.modalBtn, styles.modalConfirm]}>
                <Text style={styles.modalConfirmText}>Yes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    // Fill remaining space so the screen fits like Dashboard
    flexGrow: 1,
    paddingBottom: 132,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  h1: {
    color: colors.textPrimary,
    fontSize: type.h1,
    fontWeight: "700",
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subtitle: { color: colors.textSecondary, fontSize: 16 },
  captureBar: { flexDirection: 'row', gap: 8 },
  row: { flexDirection: "row", gap: spacing.sm },
  banner: {
    padding: spacing.md,
    ...(typeof document !== 'undefined' ? ({
      backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)"
    } as any) : {}),
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1F2A44",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surfaceBorderStrong,
  },
  titleName: { color: colors.textPrimary, fontSize: type.h2, fontWeight: '800' },
  subtitleMuted: { color: colors.textMuted, fontSize: type.label },
  statsCard: { paddingVertical: spacing.sm },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  cardTitle: { color: colors.textPrimary, fontSize: type.h2, fontWeight: "700", marginBottom: 10 },
  bodyText: { color: colors.textMuted, lineHeight: 20, fontSize: type.body },
  secondaryBtn: {
    backgroundColor: colors.surface,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
  },
  secondaryBtnText: { color: colors.textPrimary, fontWeight: "700" },
  avatar: {
    alignSelf: "center",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#1F2A44",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.surfaceBorderStrong,
  },
  avatarText: { color: colors.textPrimary, fontSize: 36, fontWeight: "800" },
  formRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-end", marginTop: spacing.sm },
  inputLabel: { color: colors.textSecondary, marginBottom: 6, fontSize: type.label },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: type.body,
  },
  inputInvalid: { borderColor: '#ff7b7b' },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnDisabled: { backgroundColor: 'rgba(255,255,255,0.14)' },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  kvRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  kLabel: { color: colors.textSecondary, fontSize: type.label },
  kValue: { color: colors.textPrimary, fontWeight: "800", fontSize: type.valueMd },
  error: { color: "#ff7b7b" },
  pillBtn: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: colors.surfaceBorder, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pillBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pillBtnText: { color: colors.textSecondary, fontWeight: '800' },
  pillBtnTextActive: { color: '#fff' },
  activityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  activityPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: type.label, fontWeight: '800', color: '#fff' },
  buyPill: { backgroundColor: colors.success },
  sellPill: { backgroundColor: '#ef4444' },
  activityText: { color: colors.textSecondary, flex: 1, marginLeft: 8, fontSize: type.body },
  activityValue: { color: colors.textPrimary, fontWeight: '800', marginLeft: 8, fontSize: type.body },
  toast: { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center' },
  toastText: { backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceBorder },
  tokenCard: { paddingVertical: spacing.sm },
  tokenRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  tokenLeft: { flex: 1 },
  tokenTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: type.body },
  tokenSub: { color: colors.textMuted, fontSize: type.label },
  tokenMeta: { color: colors.textSecondary, fontSize: type.label },
  tokenPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceBorder, color: colors.textSecondary, fontSize: type.label, fontWeight: '800' },
  tokenSectionTitle: { color: colors.textPrimary, fontWeight: '800', marginTop: spacing.sm, marginBottom: 6, fontSize: type.h2 },
  // History grid
  tokenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'stretch',
    ...(typeof window !== 'undefined' && window.innerWidth <= 600 ? { 
      flexDirection: 'column',
      gap: spacing.xs,
      paddingHorizontal: spacing.md
    } : {}),
  },
  tokenCardItem: {
    flexBasis: '100%',
    ...(typeof window !== 'undefined' && window.innerWidth > 600 ? { 
      flexBasis: 'calc(50% - 8px)' 
    } : {}),
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorderStrong,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.md,
    minHeight: 116,
    ...(typeof document !== 'undefined' ? ({ 
      minHeight: 132,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    } as any) : {
      elevation: 2
    }),
    justifyContent: 'space-between',
    gap: 6,
  },
  cardItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardItemTitle: { color: colors.textPrimary, fontWeight: '900', fontSize: type.body },
  cardItemSub: { color: colors.textSecondary, fontSize: type.label },
  cardItemMeta: { color: colors.textMuted, fontSize: type.label },
  cardItemFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  progressMiniBar: { flex: 1, height: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: colors.surfaceBorder, overflow: 'hidden' },
  progressMiniText: { color: colors.textSecondary, fontSize: type.label, fontWeight: '800' },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.surfaceBorder },
  smallBtnPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  smallBtnText: { color: '#fff', fontWeight: '800' },
  // Token details styles
  tokenDetailCard: { paddingVertical: spacing.sm },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailCardItem: {
    flexBasis: '100%',
    ...(typeof window !== 'undefined' && window.innerWidth > 600 ? { flexBasis: 'calc(50% - 6px)' } : {}),
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorderStrong,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.sm,
    minHeight: 128,
    ...(typeof document !== 'undefined' ? ({ minHeight: 148 } as any) : {}),
  },
  detailHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  detailTitle: { color: colors.textPrimary, fontSize: type.h2, fontWeight: '900' },
  detailParagraph: { color: colors.textSecondary, marginBottom: spacing.sm, fontSize: type.body },
  addrRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  addrMono: { color: colors.textMuted, fontSize: type.label, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  detailKRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  eventRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.surfaceBorder },
  activityMain: { color: colors.textPrimary, fontWeight: '700', fontSize: type.body },
  activitySub: { color: colors.textMuted, fontSize: type.label },
  up: { color: colors.success },
  down: { color: '#ff7b7b' },
  historyHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.sm },
  badgeChip: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: colors.surfaceBorder, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { color: colors.textSecondary, fontWeight: '800' },
  badgeEm: { color: colors.textPrimary },
  badgeGood: { borderColor: colors.success, backgroundColor: 'rgba(94,234,212,0.12)' },
  badgeBad: { borderColor: '#ff7b7b', backgroundColor: 'rgba(255,123,123,0.12)' },
  badgeGoodText: { color: colors.success },
  badgeBadText: { color: '#ff7b7b' },
  ghostPill: { backgroundColor: 'rgba(255,255,255,0.06)' },
  headerAction: { paddingHorizontal: 12, paddingVertical: 6 },
  headerActionSm: { paddingHorizontal: 10, paddingVertical: 4 },
  // Reset button styles
  resetBtn: { borderColor: colors.neutral },
  resetBtnText: { color: colors.neutral, fontWeight: '800' },
  // Modal styles
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderColor: colors.surfaceBorderStrong, borderWidth: 1, borderRadius: 16, padding: spacing.md },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  modalBody: { color: colors.textSecondary, marginBottom: spacing.sm },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  modalBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  modalCancel: { backgroundColor: colors.surface, borderColor: colors.surfaceBorder },
  modalConfirm: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  modalCancelText: { color: colors.textPrimary, fontWeight: '800' },
  modalConfirmText: { color: '#fff', fontWeight: '900' },
  // Checklist styles
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  todoBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.surfaceBorder, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  todoBoxDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  todoCheck: { color: '#fff', fontWeight: '900', fontSize: 12, lineHeight: 12 },
  todoText: { color: colors.textPrimary },
  todoTextDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  // Progress styles
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressText: { color: colors.textSecondary, fontWeight: '800' },
  progressBar: { flex: 1, height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: colors.surfaceBorder, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.success },
  clickableRow: {
    ...(typeof document !== 'undefined' ? ({ cursor: 'pointer' } as any) : {}),
  },
});
