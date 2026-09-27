import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useDataset } from "../hooks/useDataset";
import { DISPOSITION_SHORT, DISPOSITIONS } from "../lib/codex-model";
import {
  deleteMissionPack,
  EVENT_COMPANION_URL,
  indexMissionPdf,
  LAYOUTS,
  loadMissionPack,
  missionPairings,
  pageKey,
  primaryFor,
  renderMissionPage,
  saveMissionPack,
  type Layout,
  type MissionPack,
  type Pairing,
} from "../lib/mission-maps";
import { useActiveList } from "../store/lists";

const isDispo = (id: string | null): id is string => DISPOSITIONS.some((d) => d.id === id);

/**
 * Pick your Force Disposition, your opponent's and a layout (A/B/C) to see
 * both primaries and the layout map from the Event Companion PDF.
 */
export default function MissionsScreen() {
  const data = useDataset();
  const activeList = useActiveList();
  const [params, setParams] = useSearchParams();

  const fallback = activeList?.roster.force_disposition ?? DISPOSITIONS[0].id;
  const mine = isDispo(params.get("me")) ? params.get("me")! : fallback;
  const theirs = isDispo(params.get("opp")) ? params.get("opp")! : DISPOSITIONS[0].id;
  const layout = (LAYOUTS as readonly string[]).includes(params.get("layout") ?? "")
    ? (params.get("layout") as Layout)
    : "A";

  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("me", mine);
        next.set("opp", theirs);
        next.set("layout", layout);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );

  if (!data) {
    return <p className="py-16 text-center text-xs text-ink-faint">Loading dataset…</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">Missions</h1>

      <DispoPicker
        label="Your disposition"
        value={mine}
        starred={activeList?.roster.force_disposition}
        onChange={(id) => set("me", id)}
      />
      <DispoPicker
        label="Opponent's disposition"
        value={theirs}
        onChange={(id) => set("opp", id)}
      />

      <div className="grid grid-cols-2 gap-2">
        <MissionSide who="You" dispo={mine} mission={primaryFor(data, mine, theirs)} />
        <MissionSide who="Opponent" dispo={theirs} mission={primaryFor(data, theirs, mine)} />
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Layout</div>
        <div className="flex gap-1.5">
          {LAYOUTS.map((l) => (
            <Chip key={l} active={layout === l} onClick={() => set("layout", l)}>
              Layout {l}
            </Chip>
          ))}
        </div>
      </div>

      <MissionMap pageKeyFor={pageKey(mine, theirs, layout)} pairings={missionPairings(data)} />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
        active
          ? "border-accent bg-accent/15 text-accent"
          : "border-edge text-ink-dim hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function DispoPicker({
  label,
  value,
  starred,
  onChange,
}: {
  label: string;
  value: string;
  starred?: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {DISPOSITIONS.map((d) => (
          <Chip key={d.id} active={value === d.id} onClick={() => onChange(d.id)}>
            {DISPOSITION_SHORT[d.id] ?? d.label}
            {d.id === starred && " ★"}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function MissionSide({ who, dispo, mission }: { who: string; dispo: string; mission?: string }) {
  return (
    <div className="rounded-lg border border-edge bg-panel/50 px-3 py-2">
      <div className="text-[11px] text-ink-faint">
        {who} · {DISPOSITIONS.find((d) => d.id === dispo)?.label}
      </div>
      <div className="text-sm font-bold text-accent">{mission ?? "—"}</div>
    </div>
  );
}

/** The layout map, or an import prompt when this device has no PDF yet. */
function MissionMap({ pageKeyFor, pairings }: { pageKeyFor: string; pairings: Pairing[] }) {
  // undefined = still reading IndexedDB; null = nothing imported.
  const [pack, setPack] = useState<MissionPack | null | undefined>(undefined);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMissionPack().then(setPack, (e: unknown) => {
      setPack(null);
      setError(String(e));
    });
  }, []);

  async function importFile(file: File) {
    setError(null);
    setProgress("Reading PDF…");
    try {
      const index = await indexMissionPdf(await file.arrayBuffer(), pairings, (done, total) =>
        setProgress(`Indexing page ${done} of ${total}…`),
      );
      const found = Object.keys(index).length;
      if (found === 0) {
        throw new Error("No mission layout pages found — is this the Event Companion PDF?");
      }
      setPack(await saveMissionPack(file, index));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/pdf,.pdf"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void importFile(file);
      }}
    />
  );

  if (pack === undefined) return null;

  if (progress || !pack) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed border-edge px-3 py-4 text-sm">
        {fileInput}
        {progress ? (
          <p className="text-ink-dim">{progress}</p>
        ) : (
          <>
            <p className="text-ink-dim">
              Layout maps come from GW's Warhammer Event Companion PDF. Download it, then import it
              here once — it stays on this device.
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href={EVENT_COMPANION_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-edge px-3 py-2 text-xs font-semibold hover:bg-panel"
              >
                Get the PDF ↗
              </a>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-md bg-accent px-3 py-2 text-xs font-bold text-surface"
              >
                Import PDF
              </button>
            </div>
          </>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  const page = pack.index[pageKeyFor];
  return (
    <div className="space-y-2">
      {fileInput}
      {page ? (
        <MapCanvas pack={pack} page={page} />
      ) : (
        <p className="rounded-lg border border-edge px-3 py-6 text-center text-xs text-ink-faint">
          This matchup's layout isn't in the imported PDF.
        </p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-ink-faint">
        <span className="min-w-0 flex-1 truncate">
          {pack.fileName}
          {page && ` · p${page}`}
        </span>
        <button type="button" onClick={() => fileRef.current?.click()} className="underline">
          Replace
        </button>
        <button
          type="button"
          onClick={() => void deleteMissionPack().then(() => setPack(null))}
          className="underline"
        >
          Remove
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function MapCanvas({ pack, page }: { pack: MissionPack; page: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const ctrl = new AbortController();
    setFailed(null);
    renderMissionPage(pack, page, canvas, width, ctrl.signal).catch((e: unknown) =>
      setFailed(e instanceof Error ? e.message : String(e)),
    );
    return () => ctrl.abort();
  }, [pack, page, width]);

  return (
    <div ref={boxRef} className="mx-auto w-full max-w-xl overflow-hidden rounded-lg bg-white">
      <canvas ref={canvasRef} className="block" />
      {failed && <p className="p-3 text-xs text-red-600">Couldn't draw the map: {failed}</p>}
    </div>
  );
}
