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

// Simple candlestick chart using View elements (TradingView-like interactions)
function CandleChart({ candles, height, width }: { candles: Array<{ t:number; o:number; h:number; l:number; c:number }>, height: number, width: number }) {
  if (!candles.length || width <= 0) return null;
  const highs = candles.map(c => c.h);
  const lows = candles.map(c => c.l);
  const baseMin = Math.min(...lows);
  const baseMax = Math.max(...highs);
  const baseRange = baseMax - baseMin || 1;
  // Add a small vertical padding so extremes aren't touching edges
  const pad = baseRange * 0.05;
  const globalMin = baseMin - pad;
  const globalMax = baseMax + pad;
  const range = globalMax - globalMin || 1;
  const paddingX = 10;
  const innerW = Math.max(0, width - paddingX * 2);
  const candleGap = 4;
  const candleSlot = candles.length > 0 ? innerW / candles.length : innerW;
  const bodyWidth = Math.max(4, Math.min(18, candleSlot - candleGap));

  function y(v: number) { return height - ((v - globalMin) / range) * height; }

  const last = candles[candles.length - 1];
  const lastY = y(last.c);
  const upColor = colors.success;
  const downColor = colors.sell;
  const gridColor = 'rgba(255,255,255,0.06)';
  const [cross, setCross] = useState<{ x:number; y:number; idx:number } | null>(null);

  // Interactions
  function handleMove(e: any) {
    const x = e.nativeEvent.locationX as number;
    const yPos = e.nativeEvent.locationY as number;
    const paddingX = 10;
    const innerW = Math.max(0, width - paddingX * 2);
    const candleSlot = candles.length > 0 ? innerW / candles.length : innerW;
    const idx = Math.max(0, Math.min(candles.length - 1, Math.floor((x - paddingX) / candleSlot)));
    setCross({ x, y: yPos, idx });
  }
  function handleRelease() { setCross(null); }

  return (
    <View
      style={{ height, width, position: 'relative', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={handleMove}
      onResponderMove={handleMove}
      onResponderRelease={handleRelease}
      onResponderTerminate={handleRelease}
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
        <View key={`grid-${i}`} style={{ position: 'absolute', left: 0, right: 0, top: height * ratio, height: 1, backgroundColor: gridColor }} />
      ))}

      {/* Candles */}
      {candles.map((c, i) => {
        const x = paddingX + i * candleSlot + (candleSlot - bodyWidth) / 2;
        const yHigh = y(c.h);
        const yLow = y(c.l);
        const yOpen = y(c.o);
        const yClose = y(c.c);
        const isUp = c.c >= c.o;
        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(2, Math.abs(yOpen - yClose));
        const color = isUp ? upColor : downColor;
        return (
          <View key={i} style={{ position: 'absolute', left: x, top: 0 }}>
            {/* Wick */}
            <View style={{ position: 'absolute', left: (bodyWidth/2)-0.5, top: yHigh, width: 1, height: Math.max(1, yLow - yHigh), backgroundColor: color, opacity: 0.9 }} />
            {/* Body */}
            <View style={{ position: 'absolute', left: 0, top: bodyTop, width: bodyWidth, height: bodyHeight, backgroundColor: color, borderRadius: 2, opacity: 0.95, borderWidth: 1, borderColor: color+'80' }} />
          </View>
        );
      })}

      {/* Crosshair */}
      {cross && (
        <>
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: cross.x, width: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: cross.y, height: 1, backgroundColor: 'rgba(255,255,255,0.25)' }} />
          {/* Tooltip */}
          <View style={{ position: 'absolute', left: Math.min(width - 160, Math.max(6, cross.x + 6)), top: Math.max(6, Math.min(height - 70, cross.y + 6)), backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
            {(() => { const c = candles[cross.idx]; const t = new Date(c.t).toLocaleTimeString(); return (
              <>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{t}</Text>
                <Text style={{ color: '#fff', fontSize: 10 }}>O {c.o.toFixed(6)}  H {c.h.toFixed(6)}</Text>
                <Text style={{ color: '#fff', fontSize: 10 }}>L {c.l.toFixed(6)}  C {c.c.toFixed(6)}</Text>
              </>
            ); })()}
          </View>
        </>
      )}

      {/* Last price line and tag */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: lastY, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
      <View style={{ position: 'absolute', right: 6, top: Math.max(4, Math.min(height - 18, lastY - 8)), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>${last.c.toFixed(8)}</Text>
      </View>

      {/* Min/Max labels */}
      <Text style={{ position: 'absolute', top: 4, right: 8, color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' }}>
        ${baseMax.toFixed(8)}
      </Text>
      <Text style={{ position: 'absolute', bottom: 4, right: 8, color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '600' }}>
        ${baseMin.toFixed(8)}
      </Text>

      {/* Time axis labels (first, mid, last) */}
      {(() => {
        const first = candles[0];
        const mid = candles[Math.floor(candles.length/2)];
        const lastC = candles[candles.length-1];
        const labelStyle = { position: 'absolute' as const, bottom: 2, color: 'rgba(255,255,255,0.6)', fontSize: 9 };
        const px = (i:number) => paddingX + i * (innerW / candles.length);
        return (
          <>
            <Text style={[labelStyle, { left: px(0) }]}>{new Date(first.t).toLocaleTimeString()}</Text>
            <Text style={[labelStyle, { left: Math.max(0, Math.min(width-60, px(Math.floor(candles.length/2)))) }]}>{new Date(mid.t).toLocaleTimeString()}</Text>
            <Text style={[labelStyle, { right: 6 }]}>{new Date(lastC.t).toLocaleTimeString()}</Text>
          </>
        );
      })()}
    </View>
  );
}

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

  const [qty, setQty] = useState(0);
  const [usd, setUsd] = useState<number>(0);
  const [mode, setMode] = useState<'qty'|'usd'>('qty');
  
  // Price tracking for chart
  const [priceHistory, setPriceHistory] = useState<{timestamp: number, price: number}[]>([]);
  const [chartWidth, setChartWidth] = useState<number>(0);
  const trackingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const effPrice = useMemo(() => (currentPrice ?? 0), [currentPrice]);
  const TX_FEE = 4.3;

  const effectiveQty = useMemo(() => {
    if (mode === 'qty') return qty;
    if (!effPrice) return 0;
    return (usd || 0) / effPrice;
  }, [mode, qty, usd, effPrice]);

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

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy'|'sell'|null>(null);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const panelRef = useRef<View | null>(null);

  // Compact money formatter and estimated bought market cap (assuming constant supply)
  const fmtCompact = (n: number) => {
    if (!isFinite(n)) return '$0.00';
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${(n/1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(n/1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(n/1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
  };
  const estBoughtMCap = useMemo(() => {
    if (!marketCap || !avgPrice || !currentPrice || currentPrice === 0) return null;
    return marketCap * (avgPrice / currentPrice);
  }, [marketCap, avgPrice, currentPrice]);
  
  // Track price every second when a price is available (show chart even without holding)
  useEffect(() => {
    // reset history when mint changes
    setPriceHistory([]);
  }, [mint]);

  useEffect(() => {
    if (currentPrice) {
      if (!trackingInterval.current) {
        trackingInterval.current = setInterval(() => {
          // push latest price snapshot
          setPriceHistory(prev => ([
            ...prev,
            { timestamp: Date.now(), price: currentPrice }
          ].slice(-60)));
        }, 1000);
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

  // Build OHLC candles from priceHistory using time buckets
  const bucketMs = 5_000;
  const candles = useMemo(() => {
    const byBucket: Record<string, { t:number; o:number; h:number; l:number; c:number } & { idx: number }> = {};
    const ordered = priceHistory.slice().sort((a,b)=>a.timestamp-b.timestamp);
    for (const p of ordered) {
      const bucket = Math.floor(p.timestamp / bucketMs) * bucketMs;
      const key = String(bucket);
      if (!byBucket[key]) {
        byBucket[key] = { t: bucket, o: p.price, h: p.price, l: p.price, c: p.price, idx: bucket };
      } else {
        const b = byBucket[key];
        b.h = Math.max(b.h, p.price);
        b.l = Math.min(b.l, p.price);
        b.c = p.price;
      }
    }
    const arr = Object.values(byBucket).sort((a,b)=>a.idx-b.idx).map(({t,o,h,l,c})=>({t,o,h,l,c}));
    // Keep last N candles to fit width (fallback to 60 like priceHistory)
    return arr.slice(-60);
  }, [priceHistory]);

  async function onBuy() {
    if (!canBuy) return;
    try {
      setActionError(null);
      setBusy('buy');
      await api.buy({ mint, price: effPrice, qty: effectiveQty, name, symbol, marketCap: marketCap ?? undefined });
      // Immediately refresh local state so timestamps and history update without delay
      const fresh = await api.getState();
      await mutate(fresh, { revalidate: false });
      setQty(0); setUsd(0);
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
          <Text style={styles.tokenPrice}>{currentPrice != null ? `$${currentPrice.toFixed(8)}` : '—'}</Text>
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
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => setMode('qty')} style={[styles.modePill, mode==='qty' && styles.modePillActive]}><Text style={[styles.modePillText, mode==='qty' && styles.modePillTextActive]}>Qty</Text></Pressable>
                <Pressable onPress={() => setMode('usd')} style={[styles.modePill, mode==='usd' && styles.modePillActive]}><Text style={[styles.modePillText, mode==='usd' && styles.modePillTextActive]}>USD</Text></Pressable>
              </View>
              {mode === 'qty' ? (
                <TextInput
                  value={qty ? String(qty) : ""}
                  onChangeText={(t) => setQty(Number(t) || 0)}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[styles.input, { marginTop: 6 }]}
                />
              ) : (
                <TextInput
                  value={usd ? String(usd) : ""}
                  onChangeText={(t) => setUsd(Number(t) || 0)}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[styles.input, { marginTop: 6 }]}
                />
              )}
              {mode === 'usd' && (
                <View style={styles.amountsRow}>
                  {[25,50,100].map(v => (
                    <Pressable key={v} onPress={() => setUsd((usd||0)+v)} style={[styles.chipBtn, styles.chipBtnGhost]}><Text style={styles.chipText}>+${v}</Text></Pressable>
                  ))}
                  <Pressable onPress={() => setUsd(Number(balance.toFixed(2)))} style={[styles.chipBtn, styles.chipBtnAccent]}><Text style={styles.chipTextAccent}>MAX</Text></Pressable>
                </View>
              )}
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
          effectiveQty <= 0 ? (mode==='usd' ? 'Enter USD amount' : '') :
          totalCost > balance ? 'Insufficient balance' : 'Fill all fields'}
        </Text>
      )}

      {error ? <Text style={styles.error}>Failed to load trading state</Text> : null}

      {/* Live Price Chart */}
      {priceHistory.length > 1 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.section}>Live Price Chart</Text>
          <View style={styles.chartContainer} onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}>
            <CandleChart
              candles={candles}
              height={180}
              width={chartWidth || (typeof window !== 'undefined' ? Math.max(240, Math.min(900, window.innerWidth - 100)) : 300)}
            />
            <View style={styles.chartStats}>
              <View style={styles.chartStat}>
                <Text style={styles.chartStatLabel}>Entry</Text>
                <Text style={styles.chartStatValue}>${avgPrice.toFixed(8)}</Text>
              </View>
              <View style={styles.chartStat}>
                <Text style={styles.chartStatLabel}>Current</Text>
                <Text style={[styles.chartStatValue, { color: colors.accent }]}>${currentPrice?.toFixed(8)}</Text>
              </View>
              <View style={styles.chartStat}>
                <Text style={styles.chartStatLabel}>Change</Text>
                <Text style={[styles.chartStatValue, pnl >= 0 ? styles.up : styles.down]}>
                  {pnl >= 0 ? '+' : ''}{((currentPrice! - avgPrice) / avgPrice * 100).toFixed(2)}%
                </Text>
              </View>
            </View>
            <Text style={styles.chartTime}>{priceHistory.length}s tracked</Text>
          </View>
        </>
      )}

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

