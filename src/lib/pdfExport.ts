// Lightweight client-side PDF export using jsPDF via CDN
// No bundle dependency; we dynamically load jsPDF when needed.

export type DepositEntry = { ts: number; amount: number };

export async function ensureJsPDF(): Promise<any> {
  if (typeof window === 'undefined') throw new Error('PDF export only supported on web');
  const w = window as any;
  if (w.jspdf?.jsPDF) return w.jspdf.jsPDF;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load jsPDF'));
    document.head.appendChild(script);
  });
  if (!(window as any).jspdf?.jsPDF) throw new Error('jsPDF unavailable');
  return (window as any).jspdf.jsPDF;
}

type Summary = {
  totalBuys: number;
  totalSells: number;
  netQty: number;
  avgCost: number | null;
  realizedPnl: number;
};

function computeSummary(events: Array<{ ts: number; side: 'buy'|'sell'; price: number; qty: number }>): Summary {
  const sorted = events.slice().sort((a,b)=>a.ts - b.ts);
  let qty = 0;
  let avg = 0;
  let realized = 0;
  let buys = 0, sells = 0;
  for (const ev of sorted) {
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
  return {
    totalBuys: buys,
    totalSells: sells,
    netQty: qty,
    avgCost: qty>0 ? avg : (buys>0 ? avg : null),
    realizedPnl: Number(realized.toFixed(2)),
  };
}

function formatCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return n.toLocaleString();
}

function computeTotalRealized(events: Array<{ ts: number; side: 'buy'|'sell'; price: number; qty: number; mint: string }>): number {
  const byMint: Record<string, Array<{ ts: number; side: 'buy'|'sell'; price: number; qty: number }>> = {};
  for (const e of events) {
    (byMint[e.mint] ||= []).push({ ts: e.ts, side: e.side, price: e.price, qty: e.qty });
  }
  let total = 0;
  for (const mint of Object.keys(byMint)) {
    const s = computeSummary(byMint[mint]);
    total += s.realizedPnl;
  }
  return Number(total.toFixed(2));
}

export async function exportProfileHistoryPdf(opts: {
  user: { name?: string | null; balance?: number | null };
  deposits: DepositEntry[];
  history: Array<{
    id: string;
    ts: number;
    side: 'buy'|'sell';
    price: number;
    qty: number;
    value: number;
    mint: string;
    name?: string;
    symbol?: string;
    marketCap?: number;
  }>;
  totalPnlOverride?: number;
}): Promise<void> {
  const jsPDF = await ensureJsPDF();
  const doc = new jsPDF({ unit: 'pt', compress: true });

  const page = { w: doc.internal.pageSize.getWidth(), h: doc.internal.pageSize.getHeight() };
  const margin = 40;
  let y = margin;

  // Header
  doc.setFillColor(20, 24, 38);
  doc.rect(0, 0, page.w, 72, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('Profile Report', margin, 44);
  doc.setFontSize(10);
  const ts = new Date().toLocaleString();
  doc.text(ts, page.w - margin, 44, { align: 'right' });
  y = 90;

  function section(title: string) {
    doc.setTextColor(34, 197, 94); // accent green-ish
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(title.toUpperCase(), margin, y);
    y += 6;
    doc.setDrawColor(34, 197, 94);
    doc.setLineWidth(1);
    doc.line(margin, y, page.w - margin, y);
    y += 14;
    doc.setTextColor(33, 37, 41);
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
  }

  function ensurePage(extra = 0) {
    if (y + extra > page.h - margin) {
      doc.addPage();
      y = margin;
    }
  }

  // Profile
  section('Profile');
  const name = opts.user.name || '—';
  const bal = typeof opts.user.balance === 'number' ? `$${opts.user.balance.toFixed(2)}` : '—';
  const totalRealized = computeTotalRealized((opts.history || []).map(h => ({ ts: h.ts, side: h.side, price: h.price, qty: h.qty, mint: h.mint })));
  const pnlDisplay = typeof opts.totalPnlOverride === 'number' ? opts.totalPnlOverride : totalRealized;
  doc.text(`Name: ${name}`, margin, y); y += 16;
  doc.text(`Balance: ${bal}`, margin, y); y += 20;
  doc.text(`Realized PnL: ${pnlDisplay>=0?'+':''}$${pnlDisplay.toFixed(2)}`, margin, y); y += 20;

  // Deposits
  section('Deposits');
  if (!opts.deposits?.length) {
    doc.text('No deposits.', margin, y); y += 16;
  } else {
    const deposits = opts.deposits.slice().sort((a,b)=>b.ts-a.ts);
    const header = ['Date', 'Amount'];
    const rows = deposits.map(d => [new Date(d.ts).toLocaleString(), `+$${d.amount.toFixed(2)}`]);
    y = drawTable(doc, page, margin, y, header, rows);
  }

  // Token History (group by mint)
  section('Token History');
  const hist = (opts.history || []).slice().sort((a,b)=>b.ts-a.ts);
  if (hist.length === 0) {
    doc.text('No trade history.', margin, y); y += 16;
  } else {
    const byMint: Record<string, typeof hist> = {} as any;
    for (const ev of hist) (byMint[ev.mint] ||= []).push(ev);
    const mints = Object.keys(byMint);
    for (const mint of mints) {
      ensurePage(60);
      const events = byMint[mint];
      const label = events.find(e=>e.symbol)?.symbol || events.find(e=>e.name)?.name || `${mint.slice(0,4)}…${mint.slice(-4)}`;
      doc.setFont(undefined, 'bold');
      doc.setTextColor(15,15,15);
      doc.text(`${label} (${mint.slice(0,4)}…${mint.slice(-4)})`, margin, y);
      y += 14;
      doc.setFont(undefined, 'normal');
      doc.setTextColor(33, 37, 41);

      // Per-token summary (avg cost, realized PnL, buys/sells, market caps)
      const summary = computeSummary(events);
      const firstBuyMC = events.filter(e=>e.side==='buy' && typeof e.marketCap === 'number')[0]?.marketCap;
      const lastSellMC = [...events].reverse().find(e=>e.side==='sell' && typeof e.marketCap === 'number')?.marketCap;
      const infoLines = [
        `Address: ${mint}`,
        `Buys: ${summary.totalBuys} · Sells: ${summary.totalSells} · Net Qty: ${summary.netQty.toFixed(6)}`,
        `Avg Cost: ${summary.avgCost != null ? `$${summary.avgCost.toFixed(8)}` : '—'} · Realized PnL: ${summary.realizedPnl>=0?'+':''}$${summary.realizedPnl.toFixed(2)}`,
        `MCap Buy: ${typeof firstBuyMC==='number' ? `$${formatCompact(firstBuyMC)}` : '—'} · MCap Sell: ${typeof lastSellMC==='number' ? `$${formatCompact(lastSellMC)}` : '—'}`,
      ];
      infoLines.forEach(line => { doc.text(line, margin, y); y += 14; });
      y += 6;

      const header = ['Time', 'Side', 'Qty', 'Price', 'Value', 'MCap'];
      const rows = events.slice(0, 80).map(ev => [
        new Date(ev.ts).toLocaleString(),
        ev.side.toUpperCase(),
        String(ev.qty.toFixed(6)),
        `$${ev.price.toFixed(8)}`,
        `${ev.side==='sell' ? '+' : '-'}$${Math.abs(ev.value).toFixed(2)}`,
        typeof ev.marketCap === 'number' ? `$${formatCompact(ev.marketCap)}` : '—',
      ]);
      y = drawTable(doc, page, margin, y, header, rows);
    }
  }

  // Footer
  ensurePage();
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  const footer = 'Generated by Munasar Abuukar · ' + new Date().toLocaleString();
  doc.text(footer, margin, page.h - 12);

  doc.save(`profile-history-${Date.now()}.pdf`);
}

function drawTable(doc: any, page: { w: number; h: number }, margin: number, startY: number, header: string[], rows: string[][]): number {
  // Default baseline widths; will scale to page width anyway
  const colWidths = [160, 60, 60, 90, 70, 90];
  const padX = 6;
  const padY = 8;
  const rowH = 20;
  let y = startY;

  // Header row
  ensurePageInternal();
  doc.setFillColor(243, 244, 246);
  doc.setTextColor(55, 65, 81);
  doc.setFont(undefined, 'bold');
  let x = margin;
  const widths = header.map((_, i) => colWidths[i] || 100);
  const totalWidth = widths.reduce((a,b)=>a+b, 0);
  // If table too wide, scale down proportionally
  const maxWidth = page.w - margin * 2;
  const scale = totalWidth > maxWidth ? maxWidth / totalWidth : 1;
  const wScaled = widths.map(w => w * scale);

  doc.rect(x, y, wScaled.reduce((a,b)=>a+b,0), rowH, 'F');
  header.forEach((h, i) => {
    doc.text(h, x + padX, y + padY);
    x += wScaled[i];
  });
  y += rowH;

  // Body
  doc.setFont(undefined, 'normal');
  doc.setTextColor(33, 37, 41);
  for (const r of rows) {
    ensurePageInternal();
    let cx = margin;
    r.forEach((cell, i) => {
      const w = wScaled[i];
      doc.text(String(cell), cx + padX, y + padY);
      cx += w;
    });
    y += rowH;
  }
  return y + 6;

  function ensurePageInternal() {
    if (y + rowH + margin > page.h) {
      doc.addPage();
      y = margin;
      // re-draw header when new page starts (optional: keep simple by not repeating header)
    }
  }
}
