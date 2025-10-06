import { useMemo, useState, useEffect, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import type { ViewStyle, TextStyle } from 'react-native';
import useSWR from "swr";
import { api } from "../api/client";
import Card from "../components/Card";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { type } from "../theme/typography";

// Simple SVG-like chart component using View elements
// (Removed MiniChart; replaced by CandleChart)

// Chart component removed per request

export function TradePanel({
  mint,
  name,
  symbol,
  currentPrice,
  marketCap,
}: {
  mint: string;
  name?: string;
  symbol?: string;
  currentPrice: number | null;
  marketCap?: number | null;
}) {
  const { data, mutate, isLoading, error } = useSWR("/state", api.getState, {
    refreshInterval: 3000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const pos = data?.positions?.[mint];
  const balance = data?.user?.balance ?? 0;
  const qtyHeld = pos?.qty ?? 0;
  const avgPrice = pos?.avgPrice ?? 0;
  const pnl = useMemo(() => {
    if (!currentPrice || !qtyHeld) return 0;
    return (currentPrice - avgPrice) * qtyHeld;
  }, [currentPrice, avgPrice, qtyHeld]);

  const [usd, setUsd] = useState<number>(0);
  const [selectedPct, setSelectedPct] = useState<number | null>(null);
  
  // Price tracking for chart
  const [priceHistory, setPriceHistory] = useState<{timestamp: number, price: number}[]>([]);
  const trackingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const effPrice = useMemo(() => (currentPrice ?? 0), [currentPrice]);
  const TX_FEE = 0.35;

  const effectiveQty = useMemo(() => {
    if (!effPrice) return 0;
    return (usd || 0) / effPrice;
  }, [usd, effPrice]);

  const totalCost = useMemo(() => {
    if (!effPrice || !effectiveQty) return 0;
    return effPrice * effectiveQty;
  }, [effPrice, effectiveQty]);
  const grandTotal = useMemo(() => totalCost + (totalCost > 0 ? TX_FEE : 0), [totalCost]);
  const lastBuyTs = useMemo(() => (data?.history || []).find(h => h.mint === mint && h.side === 'buy')?.ts ?? null, [data?.history, mint]);
  const lastSellTs = useMemo(() => (data?.history || []).find(h => h.mint === mint && h.side === 'sell')?.ts ?? null, [data?.history, mint]);
  const fmtTs = (ts: number | null) => ts ? new Date(ts).toLocaleString() : '—';
  const canBuy = !!mint && effPrice > 0 && effectiveQty > 0 && totalCost <= balance;
  const canSell = qtyHeld > 0;

  // Live percent change based on last two price samples; fallback to entry avgPrice
  const changePct = useMemo(() => {
    const n = priceHistory.length;
    if (n >= 2) {
      const prev = priceHistory[n-2].price;
      const curr = priceHistory[n-1].price;
      if (prev > 0) return ((curr - prev) / prev) * 100;
    }
    if (avgPrice > 0 && currentPrice) return ((currentPrice - avgPrice) / avgPrice) * 100;
    return null;
  }, [priceHistory, avgPrice, currentPrice]);

  // Profit percentage relative to average entry price (only when holding)
  const pnlPct = useMemo(() => {
    if (!qtyHeld || !currentPrice || !avgPrice) return null;
    if (avgPrice <= 0) return null;
    return ((currentPrice - avgPrice) / avgPrice) * 100;
  }, [qtyHeld, currentPrice, avgPrice]);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy'|'sell'|null>(null);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const panelRef = useRef<View | null>(null);

  // Compact money formatter and estimated bought market cap (assuming constant supply)
  const fmtCompact = (n: number) => {
    if (!isFinite(n)) return '$0.00';
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n/1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${(n/1e3).toFixed(1)}K`;
    return `$${n.toFixed(2)}`;
  };
  const estBoughtMCap = useMemo(() => {
    if (!marketCap || !avgPrice || !currentPrice || currentPrice === 0) return null;
    return marketCap * (avgPrice / currentPrice);
  }, [marketCap, avgPrice, currentPrice]);
  
  // Track price frequently when a price is available (show chart even without holding)
  useEffect(() => {
    // reset history when mint changes
    setPriceHistory([]);
  }, [mint]);

  useEffect(() => {
    if (currentPrice) {
      if (!trackingInterval.current) {
        trackingInterval.current = setInterval(() => {
          // push latest price snapshot and keep last 60s window
          const now = Date.now();
          setPriceHistory(prev => {
            const next = [...prev, { timestamp: now, price: currentPrice }];
            const cutoff = now - 60_000; // 60s
            return next.filter(p => p.timestamp >= cutoff);
          });
        }, 300);
      }
    } else {
      if (trackingInterval.current) {
        clearInterval(trackingInterval.current);
        trackingInterval.current = null;
      }
    }

    return () => {
      if (trackingInterval.current) {
        clearInterval(trackingInterval.current);
        trackingInterval.current = null;
      }
    };
  }, [currentPrice]);

  // Chart removed: no OHLC bucketing needed

  async function onBuy() {
    if (!canBuy) return;
    try {
      setActionError(null);
      setBusy('buy');
      await api.buy({ mint, price: effPrice, qty: effectiveQty, name, symbol, marketCap: marketCap ?? undefined });
      // Immediately refresh local state so timestamps and history update without delay
      const fresh = await api.getState();
      await mutate(fresh, { revalidate: false });
      setUsd(0);
      setSelectedPct(null);
    } catch (e: any) {
      setActionError(e?.message || 'Buy failed');
    }
    finally { setBusy(null); }
  }

  // Web-only: dynamic load html2canvas and capture panel area referenced by panelRef
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

  async function capturePanel(mode: 'copy' | 'download') {
    try {
      setCaptureMsg(null);
      setIsCapturing(true);
      // wait a frame so hidden elements are not captured
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (typeof window === 'undefined') throw new Error('Capture only supported on web');
      const html2canvas = await ensureHtml2Canvas();
      const node = (panelRef.current as unknown as HTMLElement) || document.body;
      const canvas = await html2canvas(node, { backgroundColor: colors.background });
      if (mode === 'download') {
        const link = document.createElement('a');
        link.download = `${symbol || name || 'trade-panel'}.png`;
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
          a.href = url; a.download = `${symbol || name || 'trade-panel'}.png`; a.click();
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

  async function onSellAll() {
    if (!canSell || !currentPrice) return;
    try {
      setActionError(null);
      setBusy('sell');
      
      // Save chart data before selling to localStorage
      if (priceHistory.length > 0 && typeof localStorage !== 'undefined') {
        const chartKey = `${mint}_${Date.now()}`;
        const existing = JSON.parse(localStorage.getItem('tradingCharts') || '{}');
        existing[chartKey] = {
          mint,
          symbol: symbol || name || mint.slice(0, 8),
          data: priceHistory,
          soldAt: Date.now(),
          pnl
        };
        localStorage.setItem('tradingCharts', JSON.stringify(existing));
      }
      
      await api.sell({ mint, price: currentPrice, marketCap: marketCap ?? undefined });
      const fresh = await api.getState();
      await mutate(fresh, { revalidate: false });
      
      // Clear current price history after sell
      setPriceHistory([]);
    } catch (e: any) {
      setActionError(e?.message || 'Sell failed');
    }
    finally { setBusy(null); }
  }

  return (
    <Card variant="glass" style={styles.wrap}>
      <View ref={panelRef as any} style={styles.panelCaptureArea}>
      {/* Header with gradient accent */}
      <View style={styles.header}>
        <View style={styles.headerGradient} />
        <View style={{ flex: 1, zIndex: 1 }}>
          <Text style={styles.tokenTitle}>{symbol || name || mint.slice(0,4)+"…"+mint.slice(-4)}</Text>
          <Text style={styles.priceLabel}> Price</Text>
          <Text style={styles.tokenPrice}>{currentPrice != null ? `$${currentPrice.toFixed(7)}` : '—'}</Text>
          {typeof (pnlPct ?? changePct) === 'number' && isFinite((pnlPct ?? changePct) as number) && (
            <Text style={[styles.percentChange, (pnlPct ?? changePct)! >= 0 ? styles.up : styles.down]}>
              {(pnlPct ?? changePct)! >= 0 ? '▲ +' : '▼ -'}{Math.abs((pnlPct ?? changePct) as number).toFixed(2)}%
            </Text>
          )}
          {(marketCap || estBoughtMCap) && (
            <View style={styles.marketRow}>
              {typeof marketCap === 'number' && (
                <Text style={styles.marketCap}>MCap: {fmtCompact(marketCap)}</Text>
              )}
              {typeof estBoughtMCap === 'number' && (
                <Text style={styles.marketCapMuted}>Bought: {fmtCompact(estBoughtMCap)}</Text>
              )}
            </View>
          )}
        </View>
        <View style={{ alignItems: 'flex-end', zIndex: 1 }}>
          <Text style={styles.subMeta}>💰 ${balance.toFixed(2)}</Text>
          {!isCapturing && (
          <View style={styles.captureBar}>
            <Pressable onPress={() => capturePanel('copy')} style={[styles.iconBtn]}>
              <Text style={styles.iconBtnText}>📋</Text>
            </Pressable>
            <Pressable onPress={() => capturePanel('download')} style={[styles.iconBtn]}>
              <Text style={styles.iconBtnText}>📷</Text>
            </Pressable>
          </View>
          )}
        </View>
      </View>
      {actionError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.error}>⚠️ {actionError}</Text>
        </View>
      ) : null}
      {isLoading && <Text style={styles.loading}>⏳ Loading…</Text>}

      {/* Position summary */}
      <View style={styles.row}> 
        <Text style={styles.label}>Holding</Text>
        <Text style={styles.value}>
          {Number(qtyHeld).toLocaleString(undefined, { maximumFractionDigits: 6 })}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>PnL</Text>
        <Text style={[styles.value, pnl >= 0 ? styles.up : styles.down]}>
          {pnl >= 0 ? '▲ ' : '▼ '}${pnl.toFixed(2)}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Last Buy</Text>
        <Text style={styles.value}>{fmtTs(lastBuyTs)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Last Sell</Text>
        <Text style={styles.value}>{fmtTs(lastSellTs)}</Text>
      </View>

      {!isCapturing && qtyHeld === 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.section}>Buy</Text>
          <View style={[styles.formRow, { alignItems: 'flex-start' }]}>
            <View style={styles.inputCell}>
              <TextInput
                value={usd ? String(usd) : ""}
                onChangeText={(t) => { setUsd(Number(t) || 0); setSelectedPct(null); }}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                style={[styles.input, { marginTop: 6 }]}
              />
              <View style={styles.amountsRow}>
                {[25,50,100].map(v => (
                  <Pressable key={v} onPress={() => { setUsd((usd||0)+v); setSelectedPct(null); }} style={[styles.chipBtn, styles.chipBtnGhost]}><Text style={styles.chipText}>+${v}</Text></Pressable>
                ))}
                <Pressable onPress={() => { setUsd(Number(balance.toFixed(2))); setSelectedPct(null); }} style={[styles.chipBtn, styles.chipBtnAccent]}><Text style={styles.chipTextAccent}>MAX</Text></Pressable>
              </View>
              {/* Quick percentage of balance */}
              <View style={styles.percentRow}>
                {[1,2,5,10,20,25,50].map(pct => (
                  <Pressable
                    key={pct}
                    onPress={() => { setUsd(Number((balance * (pct/100)).toFixed(2))); setSelectedPct(pct); }}
                    style={[styles.percentChip, selectedPct === pct && styles.percentChipEm]}
                  >
                    <Text style={[styles.percentChipText, selectedPct === pct && styles.percentChipTextEm]}>{pct}%</Text>
                  </Pressable>
                ))}
              </View>
              {/* Clear amount */}
              <View style={styles.amountsRow}>
                <Pressable onPress={() => { setUsd(0); setSelectedPct(null); }} style={[styles.chipBtn, styles.chipBtnGhost]}>
                  <Text style={styles.chipText}>Clear</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Cost</Text>
            <Text style={[styles.value, styles.emValueSm]}>${totalCost.toFixed(2)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Fee</Text>
            <Text style={[styles.value, styles.emValueSm]}>${totalCost > 0 ? TX_FEE.toFixed(2) : '0.00'}</Text>
          </View>

          {/* Footer action: Total + Buy */}
          <View style={styles.footerBar}>
            <View>
              <Text style={styles.footerLabel}>Total</Text>
              <Text style={styles.footerTotal}>${grandTotal.toFixed(2)}</Text>
            </View>
            <Pressable
              onPress={onBuy}
              disabled={!canBuy || busy==='buy'}
              style={[styles.footerBuyBtn, (!canBuy || busy==='buy') && styles.btnDisabled]}
            >
              <Text style={styles.footerBuyText}>{busy==='buy' ? 'Buying…' : 'Buy Now'}</Text>
            </Pressable>
          </View>
        </>
      )}

      {!isCapturing && qtyHeld > 0 && (
        <Pressable
          onPress={onSellAll}
          disabled={!canSell || busy==='sell'}
          style={[styles.btn, styles.btnSell, (!canSell || busy==='sell') && styles.btnDisabled]}
        >
          <Text style={styles.btnText}>{busy==='sell' ? 'Selling…' : 'Sell (All)'}</Text>
        </Pressable>
      )}

      {!isCapturing && qtyHeld === 0 && !canBuy && (
        <Text style={styles.hint}>
          {effPrice <= 0 ? 'Waiting for market price' :
          effectiveQty <= 0 ? 'Enter USD amount' :
          totalCost > balance ? 'Insufficient balance' : 'Fill all fields'}
        </Text>
      )}

      {error ? <Text style={styles.error}>Failed to load trading state</Text> : null}

      {/* Chart preview removed per request */}

      {/* Per-token activity (beautiful mini history) */}
      {Array.isArray(data?.history) && data!.history.some(h => h.mint === mint) && (
        <>
          <View style={styles.divider} />
          <Text style={styles.section}>Recent Activity</Text>
          <View>
            {data!.history.filter(h => h.mint === mint).slice(0, 6).map(h => (
              <View key={h.id} style={styles.activityRow}>
                <Text style={[styles.activityPill, h.side === 'buy' ? styles.buyPill : styles.sellPill]}>{h.side.toUpperCase()}</Text>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.activityMain}>{(h.symbol || h.name || (h.mint.slice(0,4)+"…"+h.mint.slice(-4)))} · {h.qty.toFixed(6)} @ ${h.price.toFixed(8)}</Text>
                  <Text style={styles.activitySub}>{new Date(h.ts).toLocaleString()}</Text>
                </View>
                <Text style={[styles.activityValue, h.side==='sell' ? styles.up : styles.down]}>${h.value.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
      </View>
      {!!captureMsg && (
        <Text style={styles.captureMsg}>{captureMsg}</Text>
      )}
    </Card>
  );
}

// Base styles for reusability
const baseButton: ViewStyle = {
  paddingVertical: 12,
  paddingHorizontal: 16,
  borderRadius: 12,
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'row',
};

const baseInput: TextStyle = {
  borderWidth: 1,
  borderColor: colors.surfaceBorder,
  borderRadius: 12,
  padding: 12,
  color: colors.textPrimary,
  fontSize: type.body,
  backgroundColor: colors.background,
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: 20,
    marginTop: -spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    position: 'relative',
  },
  headerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 20,
    backgroundColor: 'rgba(31,111,235,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(31,111,235,0.15)',
  },
  tokenTitle: {
    color: colors.textPrimary,
    fontSize: type.h1,
    fontWeight: '900',
    letterSpacing: -1,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  tokenPrice: {
    color: colors.accent,
    fontSize: type.h2,
    fontWeight: '800',
    textShadowColor: colors.accent + '40',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  priceLabel: {
    color: colors.textSecondary,
    fontSize: type.label,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  percentChange: {
    marginTop: 4,
    fontSize: type.body,
    fontWeight: '900',
  },
  subMeta: {
    color: colors.textPrimary,
    fontSize: type.body,
    lineHeight: 20,
    fontWeight: '700',
    backgroundColor: colors.accent + '20',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent + '40',
  },
  marketCap: {
    color: colors.textSecondary,
    fontSize: type.body,
    marginTop: 6,
    opacity: 0.9,
  },
  marketCapMuted: {
    color: colors.textMuted,
    fontSize: type.body,
    marginTop: 6,
    opacity: 0.8,
  },
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: '800',
    marginBottom: 4,
  },
  section: {
    color: colors.textPrimary,
    fontWeight: '900',
    fontSize: type.h2,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    letterSpacing: -0.8,
    textTransform: 'uppercase',
    opacity: 0.9,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  holdingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  holdingQty: {
    color: colors.textPrimary,
    fontSize: type.valueLg,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  holdingAt: {
    color: colors.textSecondary,
    fontSize: type.label,
    marginHorizontal: 4,
    opacity: 0.8,
  },
  holdingPrice: {
    color: colors.accent,
    fontSize: type.valueMd,
    fontWeight: '900',
  },
  label: {
    color: colors.textSecondary,
    fontSize: type.label,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  hint: {
    color: colors.textSecondary,
    marginTop: 6,
    fontSize: 12,
  },
  emValueSm: {
    fontSize: 16,
  },
  footerBar: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderRadius: 24,
    backgroundColor: colors.accent + '15',
    borderWidth: 2,
    borderColor: colors.accent + '50',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  footerLabel: {
    color: colors.textSecondary,
    fontSize: type.label,
  },
  footerTotal: {
    color: colors.textPrimary,
    fontWeight: '900',
    fontSize: type.h1,
    letterSpacing: -1,
  },
  footerBuyBtn: {
    backgroundColor: colors.buy,
    paddingHorizontal: 40,
    paddingVertical: 18,
    borderRadius: 18,
    shadowColor: colors.buy,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  footerBuyText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: type.h2,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Activity styles
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  activityPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    fontSize: type.label,
    fontWeight: '900',
    color: '#fff',
    minWidth: 60,
    textAlign: 'center',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sellPill: {
    backgroundColor: colors.sell,
    shadowColor: colors.sell,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  buyPill: {
    backgroundColor: colors.buy,
    shadowColor: colors.buy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  activityMain: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  activitySub: {
    color: colors.textMuted,
    fontSize: type.label,
  },
  activityValue: {
    color: colors.textPrimary,
    fontWeight: '900',
    marginLeft: 8,
    fontSize: type.valueMd,
  },
  // Form elements
  formRow: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  inputCell: {
    flex: 1,
  },
  input: {
    ...baseInput,
    fontSize: type.h1,
    fontWeight: '800',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.1)',
  },
  inputFocused: {
    ...baseInput,
    borderColor: colors.accent,
    borderWidth: 3,
    backgroundColor: colors.accent + '10',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  amountsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  // Percentage quick-select row
  percentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  chipBtn: {
    ...baseButton,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  chipBtnGhost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  chipBtnAccent: {
    backgroundColor: colors.accent + '40',
    borderColor: colors.accent,
    borderWidth: 2,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  chipText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: type.body,
  },
  chipTextAccent: {
    color: colors.accent,
    fontWeight: '900',
  },
  // Percentage chips
  percentChip: {
    ...baseButton,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    // Fit grid: ~4 per row with wrap
    flexGrow: 1,
    flexBasis: '23%',
    maxWidth: '23%',
    alignItems: 'center',
    // Small screen overrides
    ...(typeof window !== 'undefined' && window.innerWidth <= 360 ? { flexBasis: '48%', maxWidth: '48%' } : {}),
    ...(typeof window !== 'undefined' && window.innerWidth > 360 && window.innerWidth <= 600 ? { flexBasis: '31%', maxWidth: '31%' } : {}),
  },
  percentChipEm: {
    backgroundColor: colors.accent + '20',
    borderColor: colors.accent,
    borderWidth: 2,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  percentChipText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: type.label,
    letterSpacing: 0.3,
  },
  percentChipTextEm: {
    color: colors.accent,
  },
  // Mode pills
  modePill: {
    ...baseButton,
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14,
  },
  modePillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderWidth: 3,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
  },
  modePillText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: type.body,
    letterSpacing: 0.5,
  },
  modePillTextActive: {
    color: '#fff',
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Buttons
  btn: {
    ...baseButton,
    backgroundColor: colors.accent,
    marginTop: spacing.md,
    paddingVertical: 18,
    borderRadius: 18,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  btnSell: {
    backgroundColor: colors.sell,
    shadowColor: colors.sell,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: type.h2,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Dividers
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: spacing.lg,
    borderRadius: 1,
  },
  // Value displays
  value: {
    color: colors.textPrimary,
    fontSize: type.valueLg,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  up: {
    color: colors.success,
  },
  down: {
    color: colors.sell,
  },
  // Error and loading states
  error: {
    color: colors.sell,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.4)',
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  loading: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  // Chart styles
  chartContainer: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginTop: spacing.sm,
  },
  chart: {
    borderRadius: 16,
    marginVertical: spacing.sm,
  },
  chartStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  chartStat: {
    alignItems: 'center',
  },
  chartStatLabel: {
    color: colors.textSecondary,
    fontSize: type.label,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  chartStatValue: {
    color: colors.textPrimary,
    fontSize: type.valueMd,
    fontWeight: '900',
  },
  chartTime: {
    color: colors.textSecondary,
    fontSize: type.label,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontWeight: '600',
    opacity: 0.7,
  },
  // Capture UI
  captureBar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  iconBtn: {
    ...baseButton,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  iconBtnText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  panelCaptureArea: {
    // no special styles; used as a target for screenshot
  },
  captureMsg: {
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

