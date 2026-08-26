import type {
  EditableDatasheet,
  EditableProfile,
  EditableWargearOption,
  EditableWeapon,
} from "../lib/codex-model";
import { formatRange } from "../lib/describe";

/** Paraphrased bullet for one wargear option (our wording, never the book's). */
export function wargearOptionSentence(o: EditableWargearOption): string {
  const who =
    o.limit.kind === "any"
      ? o.modelName
        ? `Any ${o.modelName}`
        : "Any model"
      : o.limit.kind === "per-models"
        ? `For every ${o.limit.n} models, 1${o.modelName ? ` ${o.modelName}` : " model"}`
        : o.limit.n === 1
          ? `1${o.modelName ? ` ${o.modelName}` : " model"}`
          : `Up to ${o.limit.n}${o.modelName ? ` ${o.modelName}` : " models"}`;
  const picks = o.choices.map((branch) => branch.join(" + "));
  const what = picks.length === 1 ? picks[0] : `one of: ${picks.join("; ")}`;
  return o.replaces.length > 0
    ? `${who} can swap ${o.replaces.join(" + ")} for ${what}.`
    : `${who} can take ${what}.`;
}

const ROLE_LABELS: Record<EditableDatasheet["role"], string> = {
  "": "",
  "epic-hero": "Epic Hero",
  character: "Character",
  battleline: "Battleline",
  "dedicated-transport": "Dedicated Transport",
  fortification: "Fortification",
};

const BAND_HEAD =
  "bg-band px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white";

function StatBoxes({ profile }: { profile: EditableProfile }) {
  const cells: [string, string][] = [
    ["M", formatRange(profile.M)],
    ["T", String(profile.T)],
    ["SV", `${profile.Sv}+`],
    ["W", String(profile.W)],
    ["LD", `${profile.Ld}+`],
    ["OC", String(profile.OC)],
  ];
  return (
    <div className="flex flex-wrap items-end gap-x-1.5 gap-y-1">
      {cells.map(([label, value]) => (
        <div key={label} className="flex w-10 flex-col items-center gap-0.5">
          <span className="text-[9px] font-bold uppercase text-white/60">{label}</span>
          <span className="flex h-9 w-full items-center justify-center rounded-sm border border-band-hi/50 bg-surface text-sm font-extrabold tabular-nums">
            {value}
          </span>
        </div>
      ))}
      {profile.invuln != null && (
        <div className="ml-1 flex items-center gap-1.5">
          <span className="flex h-9 w-10 items-center justify-center rounded-sm border border-band-hi bg-surface text-sm font-extrabold tabular-nums">
            {profile.invuln}+
          </span>
          <span className="w-14 text-[8px] font-bold uppercase leading-tight text-white/60">
            Invulnerable save
          </span>
        </div>
      )}
      {profile.name && (
        <span className="ml-1 pb-2 text-[11px] font-semibold text-white/80">
          {profile.name}
        </span>
      )}
    </div>
  );
}

function StatCell({ children }: { children: string }) {
  return <td className="px-1 py-1.5 text-center font-semibold tabular-nums">{children}</td>;
}

function WeaponRows({
  title,
  skillLabel,
  weapons,
}: {
  title: string;
  skillLabel: "BS" | "WS";
  weapons: EditableWeapon[];
}) {
  if (weapons.length === 0) return null;
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="bg-band text-white">
          <th className="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest">
            {title}
          </th>
          {["Range", "A", skillLabel, "S", "AP", "D"].map((h) => (
            <th key={h} className="w-9 px-1 py-1.5 text-center text-[10px] font-bold uppercase">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weapons.flatMap((w, wi) =>
          w.profiles.map((p, pi) => (
            <tr key={`${wi}-${pi}`} className={pi === 0 && wi > 0 ? "border-t border-edge" : ""}>
              <td className="px-3 py-1.5 align-top">
                {pi === 0 && (
                  <span className="font-semibold">{w.name || "Unnamed weapon"}</span>
                )}
                {p.name && (
                  <span className="block text-xs italic text-ink-dim">↳ {p.name}</span>
                )}
                {p.keywords.length > 0 && (
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-band-hi">
                    [{p.keywords.join(", ")}]
                  </span>
                )}
              </td>
              <StatCell>{w.type === "melee" ? "Melee" : formatRange(p.range)}</StatCell>
              <StatCell>{String(p.A)}</StatCell>
              <StatCell>{p.skill != null ? `${p.skill}+` : "N/A"}</StatCell>
              <StatCell>{String(p.S)}</StatCell>
              <StatCell>{String(p.AP)}</StatCell>
              <StatCell>{String(p.D)}</StatCell>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}

/**
 * GW-style datasheet rendering of an editable sheet: header band with
 * statlines, weapon tables, abilities, leader block, keywords footer.
 */
export default function DatasheetCard({
  sheet,
  leadNames,
}: {
  sheet: EditableDatasheet;
  /** Resolved unit names for `sheet.leads` (omit to hide the Leader block). */
  leadNames?: string[];
}) {
  const ranged = sheet.weapons.filter((w) => w.type === "ranged");
  const melee = sheet.weapons.filter((w) => w.type === "melee");
  const core = sheet.abilities.filter((a) => a.core);
  const others = sheet.abilities.filter((a) => !a.core);
  const role = ROLE_LABELS[sheet.role];

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-surface">
      <header className="space-y-2.5 bg-gradient-to-r from-band-deep via-band to-band-deep px-3 pb-3 pt-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {role && (
              <div className="text-[9px] font-bold uppercase tracking-widest text-band-hi">
                {role}
              </div>
            )}
            <h2 className="text-xl font-extrabold uppercase leading-tight tracking-wide text-white">
              {sheet.name || "Unnamed datasheet"}
            </h2>
          </div>
          {sheet.points.length > 0 && (
            <div className="shrink-0 space-y-0.5 rounded-sm border border-band-hi/40 bg-surface/60 px-2 py-1 text-right text-[11px] font-semibold tabular-nums text-white">
              {sheet.points.map((t, i) => (
                <div key={i}>
                  {t.models === 1 ? `${t.cost} pts` : `${t.models} models — ${t.cost} pts`}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {sheet.profiles.map((p, i) => (
            <StatBoxes key={i} profile={p} />
          ))}
        </div>
      </header>

      <WeaponRows title="Ranged weapons" skillLabel="BS" weapons={ranged} />
      <WeaponRows title="Melee weapons" skillLabel="WS" weapons={melee} />

      {(sheet.wargearOptions?.length ?? 0) > 0 && (
        <section>
          <div className={BAND_HEAD}>Wargear options</div>
          <ul className="list-inside list-disc space-y-1 px-3 py-2 text-[13px] leading-snug">
            {sheet.wargearOptions!.map((o, i) => (
              <li key={i}>{wargearOptionSentence(o)}</li>
            ))}
          </ul>
        </section>
      )}

      {sheet.abilities.length > 0 && (
        <section>
          <div className={BAND_HEAD}>Abilities</div>
          <div className="space-y-1.5 px-3 py-2 text-[13px] leading-snug">
            {core.length > 0 && (
              <p>
                <span className="font-bold uppercase text-band-hi">Core: </span>
                <span className="font-semibold">{core.map((a) => a.name).join(", ")}</span>
              </p>
            )}
            {others.map((a, i) => (
              <p key={i} className="whitespace-pre-wrap">
                <span className="font-bold">
                  {a.name}
                  {a.text ? ": " : ""}
                </span>
                {a.text}
              </p>
            ))}
          </div>
        </section>
      )}

      {leadNames && leadNames.length > 0 && (
        <section>
          <div className={BAND_HEAD}>Leader</div>
          <div className="px-3 py-2 text-[13px] leading-snug">
            <p className="text-ink-dim">This model can be attached to the following units:</p>
            <ul className="mt-1 space-y-0.5 font-semibold">
              {leadNames.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <footer className="flex items-stretch text-[11px] text-white">
        <div className="flex-1 bg-band px-3 py-2">
          <span className="font-bold uppercase tracking-wide">Keywords: </span>
          <span className="font-semibold uppercase">{sheet.keywords.join(", ") || "—"}</span>
        </div>
        <div className="max-w-[45%] bg-band-deep px-3 py-2 text-right">
          <span className="font-bold uppercase tracking-wide">Faction: </span>
          <span className="font-semibold uppercase">
            {sheet.factionKeywords.join(", ") || "—"}
          </span>
        </div>
      </footer>
    </div>
  );
}
