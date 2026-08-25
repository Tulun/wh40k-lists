import type { Data40k } from "../lib/data";
import { formatRange, weaponKeywordLabel } from "../lib/describe";
import { instanceTag, type MergedWeapon } from "../lib/dedupe";
import { byId } from "../lib/lookup";

interface Props {
  data: Data40k;
  weapons: MergedWeapon[];
  factionId: string | null;
  /** Show per-instance carrier tags (only when the entry has >1 instance). */
  showInstances: boolean;
}

interface Row {
  merged: MergedWeapon;
  name: string;
  profiles: ProfileRow[];
}

interface ProfileRow {
  name: string | null;
  range: string;
  A: string;
  skill: string;
  S: string;
  AP: string;
  D: string;
  keywords: string[];
  melee: boolean;
}

interface OtherGear {
  merged: MergedWeapon;
  name: string;
}

function buildRows(
  data: Data40k,
  weapons: MergedWeapon[],
  factionId: string | null,
): { rows: Row[]; other: OtherGear[] } {
  const rows: Row[] = [];
  const other: OtherGear[] = [];
  for (const merged of weapons) {
    const view = byId(data.weapons, merged.ref.id, factionId);
    if (!view) {
      // Not a weapon: either a `wargear` collection item (grots, runts…) or
      // an unmatched line kept as text. Both render as plain gear, not stats.
      const gear = byId(data.wargear, merged.ref.id, factionId);
      other.push({ merged, name: gear?.name ?? merged.ref.raw_name });
      continue;
    }
    const raw = view.raw;
    const profiles: ProfileRow[] = raw.profiles.map((p, i) => {
      const stats = p.stats;
      const melee = p.range === "Melee" || raw.type === "melee";
      const skill = melee ? stats.WS : stats.BS;
      return {
        name: raw.profiles.length > 1 ? (p.name ?? null) : null,
        range: formatRange(p.range as number | string),
        A: String(stats.A),
        skill: skill != null ? `${skill}+` : "N/A",
        S: String(stats.S),
        AP: String(stats.AP),
        D: String(stats.D),
        keywords: view
          .keywordsAt(i)
          .map((k) => weaponKeywordLabel(k.keyword.name, k.parameters)),
        melee,
      };
    });
    rows.push({ merged, name: view.name, profiles });
  }
  // Ranged before melee, then by name; multi-profile weapons sort by first profile.
  rows.sort((a, b) => {
    const am = a.profiles[0]?.melee ? 1 : 0;
    const bm = b.profiles[0]?.melee ? 1 : 0;
    if (am !== bm) return am - bm;
    return a.name.localeCompare(b.name);
  });
  return { rows, other };
}

const HEAD = ["Range", "A", "Skill", "S", "AP", "D"];

export default function WeaponTable({ data, weapons, factionId, showInstances }: Props) {
  const { rows, other } = buildRows(data, weapons, factionId);
  if (rows.length === 0 && other.length === 0) return null;

  return (
    <div>
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-[10px] uppercase text-ink-faint">
                <th className="py-1 pr-2 text-left font-semibold">Weapon</th>
                {HEAD.map((h) => (
                  <th key={h} className="px-1.5 py-1 text-center font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                row.profiles.map((p, i) => (
                  <tr
                    key={`${row.merged.ref.id ?? row.merged.ref.raw_name}-${i}`}
                    className={i === 0 ? "border-t border-edge" : ""}
                  >
                    <td className="max-w-40 py-1.5 pr-2 align-top">
                      {i === 0 ? (
                        <>
                          <span className="font-medium">{row.name}</span>
                          <Count
                            merged={row.merged}
                            tag={showInstances ? instanceTag(row.merged) : null}
                          />
                        </>
                      ) : null}
                      {p.name && (
                        <span className="block text-xs italic text-ink-dim">↳ {p.name}</span>
                      )}
                      {p.keywords.length > 0 && (
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {p.keywords.map((k) => (
                            <span
                              key={k}
                              className="rounded bg-panel px-1 py-px text-[10px] uppercase tracking-wide text-accent"
                            >
                              {k}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-1.5 py-1.5 text-center tabular-nums">{p.range}</td>
                    <td className="px-1.5 py-1.5 text-center tabular-nums">{p.A}</td>
                    <td className="px-1.5 py-1.5 text-center tabular-nums">{p.skill}</td>
                    <td className="px-1.5 py-1.5 text-center tabular-nums">{p.S}</td>
                    <td className="px-1.5 py-1.5 text-center tabular-nums">{p.AP}</td>
                    <td className="px-1.5 py-1.5 text-center tabular-nums">{p.D}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}

      {other.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            Other wargear
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {other.map(({ merged, name }) => (
              <span
                key={merged.ref.id ?? merged.ref.raw_name}
                className="rounded-full border border-edge bg-panel px-2.5 py-1 text-xs capitalize text-ink-dim"
              >
                {name}
                <Count merged={merged} tag={showInstances ? instanceTag(merged) : null} />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Count({ merged, tag }: { merged: MergedWeapon; tag: string | null }) {
  // totalCount 0 = "no count applies" (explorer datasheets), not "zero carried".
  return (
    <>
      {merged.totalCount > 0 && (
        <span className="ml-1 text-xs text-ink-faint">×{merged.totalCount}</span>
      )}
      {tag && (
        <span className="ml-1 rounded bg-accent/15 px-1 py-px text-[10px] text-accent">
          {tag}
        </span>
      )}
    </>
  );
}
