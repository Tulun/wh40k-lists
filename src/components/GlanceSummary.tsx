import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Roster, Stratagem } from "@alpaca-software/40kdc-data";
import type { Data40k } from "../lib/data";
import { abilityText, dekebabLabel } from "../lib/describe";
import { byId } from "../lib/lookup";
import { armyStratagems, sortStratagems } from "../lib/stratagems";
import { useLists } from "../store/lists";

interface Props {
  data: Data40k;
  roster: Roster;
  listId: string;
}

/**
 * "Keep it in mind" overlay: one compact row per enhancement and stratagem so
 * the army's whole bag of tricks fits on a screen or two. Rows start clamped
 * to two lines; tapping a row reveals the full effect text. The full cards
 * (with notes editing) still live in the Stratagems section below the roster.
 */
export default function GlanceSummary({ data, roster, listId }: Props) {
  const [open, setOpen] = useState(false);
  const notes = useLists((s) => s.lists[listId]?.notes);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const detachmentIds = roster.detachments.map((d) => d.ref.id);
  const { detachment, core } = armyStratagems(data.stratagems.all, detachmentIds);

  const enhancements = roster.units
    .map((u, index) => ({ u, index }))
    .filter(({ u }) => u.enhancement != null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-edge bg-panel/50 px-3 py-2 text-left text-sm font-semibold hover:bg-panel active:bg-panel"
      >
        ⚡ Stratagem summary{" "}
        <span className="text-xs font-normal text-ink-faint">
          ({detachment.length + core.length} stratagems
          {enhancements.length > 0 ? ` · ${enhancements.length} enhancements` : ""})
        </span>
      </button>

      {open &&
        // Portal to <body>: the sticky header's backdrop-blur makes it a
        // containing block for fixed descendants (see Sidebar).
        createPortal(
          <div
            className="fixed inset-0 z-50 flex justify-center lg:bg-black/70"
            role="dialog"
            aria-label="Stratagem summary"
          >
            <button
              type="button"
              aria-label="Close summary"
              className="absolute inset-0"
              onClick={() => setOpen(false)}
            />
            <div className="relative flex h-full w-full max-w-2xl flex-col bg-surface lg:my-6 lg:h-auto lg:max-h-[calc(100vh-3rem)] lg:rounded-xl lg:border lg:border-edge lg:shadow-2xl">
              <div className="flex items-center justify-between border-b border-edge px-3 py-2">
                <span className="text-sm font-bold">At a glance</span>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-ink-dim hover:bg-panel active:bg-panel"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-3">
                {enhancements.length > 0 && (
                  <Section label="Enhancements">
                    {enhancements.map(({ u, index }) => {
                      const entity = byId(data.enhancements, u.enhancement!.id, roster.faction_id);
                      const ability = byId(data.abilities, entity?.ability_id, roster.faction_id);
                      const bearer =
                        data.resolveRosterUnit(u, data.dataset, roster.faction_id)?.name ??
                        u.ref.raw_name;
                      const pts = u.enhancement_points ?? entity?.cost;
                      return (
                        <SummaryRow
                          key={index}
                          title={`✦ ${entity?.name ?? u.enhancement!.raw_name}`}
                          meta={
                            <>
                              {u.is_warlord && <span title="Warlord">⭐ </span>}
                              {bearer}
                            </>
                          }
                          badge={pts != null ? `${pts} pts` : undefined}
                          text={ability ? abilityText(ability) : null}
                        />
                      );
                    })}
                  </Section>
                )}

                <Section label="Detachment stratagems">
                  {sortStratagems(detachment).map((s) => (
                    <StratagemRow key={s.id} data={data} stratagem={s} roster={roster} note={notes?.[s.id]} />
                  ))}
                </Section>

                <Section label="Core stratagems">
                  {sortStratagems(core).map((s) => (
                    <StratagemRow key={s.id} data={data} stratagem={s} roster={roster} note={notes?.[s.id]} />
                  ))}
                </Section>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <div className="divide-y divide-edge/60 overflow-hidden rounded-lg border border-edge">
        {children}
      </div>
    </div>
  );
}

function StratagemRow({
  data,
  stratagem,
  roster,
  note,
}: {
  data: Data40k;
  stratagem: Stratagem;
  roster: Roster;
  note: string | undefined;
}) {
  const ability = byId(data.abilities, stratagem.ability_id, roster.faction_id);
  return (
    <SummaryRow
      title={stratagem.name}
      meta={
        <>
          {stratagem.player_turn === "opponent-turn" && (
            <span className="text-opponent">Opp · </span>
          )}
          {stratagem.phases.map(dekebabLabel).join("/")}
        </>
      }
      badge={`${stratagem.cp_cost} CP`}
      text={ability ? abilityText(ability) : null}
      note={note}
    />
  );
}

function SummaryRow({
  title,
  meta,
  badge,
  text,
  note,
}: {
  title: string;
  meta?: React.ReactNode;
  badge?: string;
  text: string | null;
  note?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="block w-full px-3 py-2 text-left hover:bg-panel/50 active:bg-panel/50"
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wide">
          {title}
        </span>
        {meta && <span className="shrink-0 text-[10px] uppercase text-ink-faint">{meta}</span>}
        {badge && (
          <span className="shrink-0 rounded bg-accent/20 px-1.5 py-px text-[11px] font-bold text-accent">
            {badge}
          </span>
        )}
      </div>
      {text ? (
        <p
          className={`mt-0.5 text-xs leading-snug text-ink-dim ${
            expanded ? "whitespace-pre-wrap" : "line-clamp-2"
          }`}
        >
          {text}
        </p>
      ) : (
        <p className="mt-0.5 text-xs italic text-ink-faint">Effect not in the dataset yet</p>
      )}
      {note && <p className="mt-0.5 text-xs text-accent">📝 {note}</p>}
    </button>
  );
}
