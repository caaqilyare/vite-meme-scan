import { useMemo, useState } from "react";
import { View, Text, Image, StyleSheet, Pressable, TextInput, Clipboard } from "react-native";
import useSWR from "swr";
import Card from "../components/Card";
import { TradePanel } from "./TradePanel";
import { colors } from "../theme/colors";
import { spacing } from "../theme/spacing";
import { type } from "../theme/typography";

const DEFAULT_MINT = "";

// Types (partial) for the RugCheck response we use
interface RugTokenMeta {
  name: string;
  symbol: string;
  uri?: string;
}
interface RugToken {
  supply: number;
  decimals: number;
}
interface TopHolder {
  address: string;
  pct: number;
  uiAmountString?: string;
  insider?: boolean;
}
interface RugReport {
  mint: string;
  token: RugToken;
  tokenMeta?: RugTokenMeta;
  fileMeta?: { image?: string; name?: string; symbol?: string };
  topHolders?: TopHolder[];
  risks?: { name: string; level?: string }[];
  score?: number;
  score_normalised?: number;
}

// Helpers
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/; // Solana base58 (no 0, O, I, l)
function isValidMint(m: string) {
  const s = m.trim();
  return s.length >= 32 && s.length <= 44 && BASE58_RE.test(s);
}

async function fetchRugReport([, m]: [string, string]) {
  const url = `https://api.rugcheck.xyz/v1/tokens/${m}/report`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`RugCheck ${res.status}`);
  const report: RugReport = await res.json();
  return report;
}

async function fetchPrice([, m]: [string, string]) {
  const url = `https://data.fluxbeam.xyz/tokens/${m}/price`;
  const res = await fetch(url, { headers: { Accept: "text/plain" } });
  if (!res.ok) throw new Error(`Fluxbeam ${res.status}`);
  const latest = Number((await res.text()).trim());
  return Number.isFinite(latest) ? latest : null;
}

export function MemeScanner({ mint = DEFAULT_MINT }: { mint?: string }) {
  const [inputMint, setInputMint] = useState(mint);
  const [searchedMint, setSearchedMint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Split SWR: lighter 1s price polling, heavier 60s report polling
  const reportKey = searchedMint ? (["report", searchedMint] as const) : null;
  const priceKey = searchedMint ? (["price", searchedMint] as const) : null;

  const { data: report, error: reportError, isLoading: reportLoading } = useSWR(
    reportKey,
    fetchRugReport,
    { refreshInterval: 60_000, revalidateOnFocus: true, keepPreviousData: true }
  );

  const { data: price, error: priceError, isLoading: priceLoading } = useSWR(
    priceKey,
    fetchPrice,
    { refreshInterval: 1_000, dedupingInterval: 0, revalidateIfStale: true }
  );

  const tokenName = report?.fileMeta?.name || report?.tokenMeta?.name || "";
  const tokenSymbol = report?.fileMeta?.symbol || report?.tokenMeta?.symbol || "";
  const imageUrl = report?.fileMeta?.image;
  const score = report?.score ?? report?.score_normalised;
  const lpLockedPct = (report as any)?.markets?.[0]?.lpLockedPct as number | undefined;
  const totalHolders = (report as any)?.totalHolders as number | undefined;

  const supply = useMemo(() => {
    if (!report?.token) return null;
    const d = report.token.decimals ?? 0;
    return report.token.supply / Math.pow(10, d);
  }, [report]);

  const marketCap = useMemo(() => {
    if (price == null || supply == null) return null;
    return price * supply;
  }, [price, supply]);

  const hasSearched = !!searchedMint;
  const canScan = isValidMint(inputMint);

  return (
    <Card variant="glass">
      <View style={styles.fixedContainer}>
      {/* Search row */}
      <View style={styles.searchWrap}>
        <View style={styles.searchRow}>
          <TextInput
            value={inputMint}
            onChangeText={setInputMint}
            placeholder="Paste Solana token mint..."
            placeholderTextColor="#98A2B3"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={() => canScan && setSearchedMint(inputMint.trim())}
            style={[styles.searchBtn, !canScan && styles.searchBtnDisabled]}
          >
            <Text style={[styles.searchBtnText, !canScan && styles.searchBtnTextDisabled]}>{hasSearched ? "Rescan" : "Scan"}</Text>
          </Pressable>
        </View>
        <Text style={styles.searchHint}>Example: 3b11QJgyXma8DQeUu2hvrUeAxcDjngkd5yS2vvBLpump</Text>
        {!canScan && inputMint.trim().length > 0 && (
          <Text style={styles.invalidHint}>Invalid mint format</Text>
        )}
        <View style={styles.divider} />
      </View>

      {/* Empty state before first search */}
      {!hasSearched ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyBadge}><Text style={styles.emptyBadgeText}>Meme Scanner</Text></View>
          <Text style={styles.emptyTitle}>Scan a Solana token</Text>
          <Text style={styles.emptySubtitle}>Get safety score, top holders, supply and live price.</Text>
        </View>
      ) : (reportLoading || (!report && priceLoading)) ? (
        <View>
          <View style={styles.skeletonHeader} />
          <View style={styles.metricsRow}>
            <View style={[styles.metricCell, styles.skeletonBlock]} />
            <View style={[styles.metricCell, styles.skeletonBlock]} />
            <View style={[styles.metricCell, styles.skeletonBlock]} />
          </View>
          <View style={styles.skeletonBadges} />
        </View>
      ) : (reportError || priceError) ? (
        <View style={styles.centerWrap}>
          <Text style={styles.error}>Failed: {String(reportError || priceError)}</Text>
          <Text style={styles.muted}>CORS? Try running over HTTPS or a proxy.</Text>
        </View>
      ) : (
        <>
          {/* Hero header */}
          <View style={styles.headerRow}>
            {imageUrl ? (
              <Pressable 
                onPress={async () => {
                  await Clipboard.setString(imageUrl);
                  setCopied(true);
                  setToast('Copied');
                  setTimeout(() => setCopied(false), 2000);
                  setTimeout(() => setToast(null), 1200);
                }}
                style={({ pressed }) => [
                  styles.logoContainer,
                  pressed && styles.logoPressed,
                  copied && styles.logoCopied
                ]}
              >
                <Image 
                  source={{ uri: imageUrl }} 
                  style={styles.logo} 
                  resizeMode="contain"
                />
                <View style={styles.copyOverlay}>
                  <Text style={styles.copyText}>{copied ? 'Copied!' : 'Tap to copy'}</Text>
                </View>
              </Pressable>
            ) : (
              <View style={[styles.logo, styles.logoFallback]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{tokenName || shortAddress(searchedMint!)}</Text>
              <Text style={styles.mintText} numberOfLines={1}>{shortAddress(searchedMint!)}</Text>
              <View style={styles.rowGap8}>
                {tokenSymbol ? <Text style={styles.symbol}>{tokenSymbol}</Text> : null}
                {typeof score === "number" && (
                  <View style={styles.scorePill}><Text style={styles.scoreText}>Score {Math.round(score)}</Text></View>
                )}
              </View>
            </View>
           
          </View>

          {/* Key metrics */}
          <View style={styles.metricsRow}>
            <Metric label="Price" value={price != null ? `$${formatNumber(price)}` : "—"} icon="💸" emphasis />
            <Metric label="Market Cap" value={marketCap != null ? `$${formatCompact(marketCap)}` : "—"} icon="🏦" />
            <Metric label="Supply" value={supply != null ? formatCompact(supply) : "—"} icon="💰" />
          </View>

          {/* Quick badges */}
          <View style={styles.badgesRow}>
            {typeof lpLockedPct === 'number' && (
              <View style={[styles.badgeChip, getBadgeTone(lpLockedPct)]}>
                <Text style={styles.badgeText}>🔒 LP Locked {lpLockedPct.toFixed(0)}%</Text>
              </View>
            )}
            {typeof totalHolders === 'number' && (
              <View style={[styles.badgeChip, getHoldersTone(totalHolders)]}>
                <View style={styles.badgeDot} />
                <Text style={styles.badgeText}>👥 {formatCompact(totalHolders)} holders</Text>
              </View>
            )}
          </View>

          {/* Risks */}
          {report?.risks && report.risks.length > 0 && (
            <View style={styles.risksWrap}>
              {report.risks.slice(0, 3).map((r, i) => (
                <View key={i} style={[styles.riskChip, getRiskStyle(r.level)]}>
                  <Text style={styles.riskText}>{r.name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Trading */}
          <TradePanel
            mint={searchedMint!}
            name={tokenName || undefined}
            symbol={tokenSymbol || undefined}
            currentPrice={price ?? null}
            marketCap={marketCap ?? null}
          />
        </>
      )}
      </View>
      {toast && (
        <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>
      )}
    </Card>
  );
}

function Metric({ label, value, icon, emphasis }: { label: string; value: string; icon?: string; emphasis?: boolean }) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{icon ? `${icon} ${label}` : label}</Text>
      <Text style={[styles.metricValue, emphasis && styles.metricValueEm]}>{value}</Text>
    </View>
  );
}

function shortAddress(addr: string) {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatNumber(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function formatCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(2) + "K";
  return n.toLocaleString();
}

const styles = StyleSheet.create({
  searchWrap: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  searchRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: type.body,
  },
  searchBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  searchBtnDisabled: { backgroundColor: "rgba(255,255,255,0.12)" },
  searchBtnTextDisabled: { color: colors.textSecondary },
  searchHint: { color: colors.textSecondary, marginTop: 6, fontSize: type.label },
  searchBtnText: { color: "#fff", fontWeight: "700", fontSize: type.body },
  emptyState: { alignItems: "center", paddingVertical: spacing.lg, gap: 8 },
  emptyBadge: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: colors.surfaceBorder, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  emptyBadgeText: { color: colors.textSecondary, fontWeight: "700" },
  emptyTitle: { color: colors.textPrimary, fontSize: type.h2, fontWeight: "800" },
  emptySubtitle: { color: colors.textSecondary, fontSize: type.body },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowGap8: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoContainer: {
    position: 'relative',
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
  },
  logo: { 
    width: '100%', 
    height: '100%',
    borderRadius: 10,
  },
  logoPressed: {
    opacity: 0.8,
  },
  logoCopied: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
  },
  logoFallback: { 
    borderWidth: 2, 
    borderColor: colors.surfaceBorder,
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  copyOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  toast: { position: 'absolute', bottom: 20, left: 0, right: 0, alignItems: 'center' },
  toastText: { backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.surfaceBorder },
  title: { color: colors.textPrimary, fontSize: type.h2, fontWeight: "800", letterSpacing: 0.2 },
  mintText: { color: colors.textSecondary, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: type.label },
  symbol: { color: colors.textSecondary, fontWeight: "600", fontSize: type.label },
  scorePill: {
    backgroundColor: "rgba(94,234,212,0.12)",
    borderColor: colors.success,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  scoreText: { color: colors.success, fontWeight: "700", fontSize: type.label },
  refreshBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  refreshText: { color: colors.link, fontWeight: "700" },
  headerButtons: { flexDirection: "row", alignItems: "center" },
  iconBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  iconBtnText: { color: colors.textPrimary, fontWeight: "700" },
  centerWrap: { alignItems: "center", gap: 8, paddingVertical: spacing.md },
  error: { color: "#ff7b7b", fontWeight: "700" },
  muted: { color: colors.textSecondary },
  metricsRow: {
    marginTop: spacing.md,
    flexDirection: "row",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  metricCell: {
    flexGrow: 1,
    minWidth: 160,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: spacing.md,
    ...(typeof document !== 'undefined' ? ({
      backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)"
    } as any) : {}),
  },
  metricLabel: { color: colors.textSecondary, marginBottom: 6, fontWeight: "700", letterSpacing: 0.2, fontSize: type.label },
  metricValue: { color: colors.textPrimary, fontSize: type.valueMd, fontWeight: "800" },
  metricValueEm: { fontSize: type.valueLg, color: colors.textPrimary },
  badgesRow: { flexDirection: "row", gap: 10, marginTop: spacing.sm, flexWrap: "wrap" },
  badgeChip: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: colors.surfaceBorder, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  badgeText: { color: colors.textSecondary, fontWeight: "800", letterSpacing: 0.2, fontSize: type.label },
  badgeDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: colors.success, marginRight: 6 },
  risksWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md },
  riskChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  riskText: { color: colors.textPrimary, fontWeight: "700", fontSize: type.label },
  sectionTitle: { color: colors.textPrimary, fontWeight: "800", marginBottom: 6, letterSpacing: 0.2 },
  holdersSection: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.surfaceBorder, paddingTop: spacing.md },
  holderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  holderAddr: { flex: 1, color: colors.textMuted, fontSize: type.label },
  holderBarWrap: {
    flex: 2,
    height: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  holderBar: {
    height: "100%",
    backgroundColor: colors.success,
  },
  holderPct: { width: 60, textAlign: "right", color: colors.textSecondary, fontSize: type.label },
  linkBtn: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  linkBtnText: { color: colors.link, fontWeight: "700", fontSize: type.label },
  skeletonHeader: { height: 60, backgroundColor: "rgba(255,255,255,0.06)", borderColor: colors.surfaceBorder, borderWidth: 1, borderRadius: 12, marginBottom: spacing.md },
  skeletonBlock: { backgroundColor: "rgba(255,255,255,0.06)" },
  skeletonBadges: { height: 24, backgroundColor: "rgba(255,255,255,0.06)", borderColor: colors.surfaceBorder, borderWidth: 1, borderRadius: 999, marginTop: spacing.sm },
  divider: { height: 1, backgroundColor: colors.surfaceBorder, marginTop: spacing.sm },
  invalidHint: { color: "#ff7b7b", fontSize: 12, marginTop: 4 },
  fixedContainer: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
});

function getRiskStyle(level?: string) {
  if (!level) return { borderColor: colors.surfaceBorder, backgroundColor: "rgba(255,255,255,0.06)" } as const;
  const ll = level.toLowerCase();
  if (ll.includes("warn") || ll.includes("high")) return { borderColor: "#ff7b7b", backgroundColor: "rgba(255,123,123,0.12)" } as const;
  if (ll.includes("info") || ll.includes("low")) return { borderColor: colors.success, backgroundColor: "rgba(94,234,212,0.12)" } as const;
  return { borderColor: colors.surfaceBorder, backgroundColor: "rgba(255,255,255,0.06)" } as const;
}

function getBadgeTone(pct: number) {
  if (pct >= 75) {
    return { borderColor: colors.success, backgroundColor: "rgba(94,234,212,0.12)" } as const;
  } else if (pct >= 25) {
    return { borderColor: "#ffd166", backgroundColor: "rgba(255,209,102,0.12)" } as const;
  } else {
    return { borderColor: "#ff7b7b", backgroundColor: "rgba(255,123,123,0.12)" } as const;
  }
}

function getHoldersTone(n: number) {
  if (n >= 10000) {
    return { borderColor: colors.success, backgroundColor: "rgba(94,234,212,0.12)" } as const;
  } else if (n >= 1000) {
    return { borderColor: "#ffd166", backgroundColor: "rgba(255,209,102,0.12)" } as const;
  }
  return { borderColor: colors.surfaceBorder, backgroundColor: "rgba(255,255,255,0.06)" } as const;
}
