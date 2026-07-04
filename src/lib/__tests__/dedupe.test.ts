import { describe, expect, it } from "vitest";
import type { ResolvedRef, Roster, RosterUnit } from "@alpaca-software/40kdc-data";
import { dedupeRoster, instanceTag } from "../dedupe";

const ref = (id: string | null, raw?: string): ResolvedRef => ({
  id,
  raw_name: raw ?? id ?? "unknown",
  resolved: id !== null,
  candidates: [],
});

const unit = (partial: Partial<RosterUnit> & { ref: ResolvedRef }): RosterUnit => ({
  model_count: 10,
  points: 75,
  is_warlord: false,
  enhancement: null,
  enhancement_points: null,
  wargear: [],
  leader_attachment: null,
  ...partial,
});

const roster = (units: RosterUnit[]): Roster => ({
  name: "test",
  source: { format: "gw", generated_by: null },
  faction_id: "orks",
  detachments: [],
  battle_size: null,
  force_disposition: null,
  points: { declared_limit: null, detachment_cap: null, total_reported: null, total_computed: 0 },
  units,
  game_version: { edition: "11th", dataslate: "launch" },
  diagnostics: {
    resolved_units: units.length,
    unresolved_units: 0,
    resolved_weapons: 0,
    unresolved_weapons: 0,
    warnings: [],
  },
});

describe("dedupeRoster", () => {
  it("merges 3 Boyz squads into one entry with a union of wargear", () => {
    const r = roster([
      unit({
        ref: ref("boyz"),
        wargear: [
          { ref: ref("choppa"), count: 9 },
          { ref: ref("rokkit-launcha-boyz"), count: 1 },
        ],
      }),
      unit({ ref: ref("boyz"), wargear: [{ ref: ref("choppa"), count: 10 }] }),
      unit({ ref: ref("boyz"), wargear: [{ ref: ref("choppa"), count: 10 }] }),
    ]);

    const entries = dedupeRoster(r);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.count).toBe(3);
    expect(entry.totalModels).toBe(30);
    expect(entry.totalPoints).toBe(225);

    const choppa = entry.mergedWargear.find((w) => w.ref.id === "choppa")!;
    expect(choppa.totalCount).toBe(29);
    expect(choppa.perInstance).toEqual([9, 10, 10]);
    expect(choppa.universal).toBe(false); // counts differ

    const rokkit = entry.mergedWargear.find((w) => w.ref.id === "rokkit-launcha-boyz")!;
    expect(rokkit.totalCount).toBe(1);
    expect(rokkit.perInstance).toEqual([1, 0, 0]);
    expect(rokkit.universal).toBe(false);
    expect(instanceTag(rokkit)).toBe("#1");
  });

  it("keeps characters with different enhancements as separate entries", () => {
    const r = roster([
      unit({ ref: ref("bannernob"), model_count: 1, points: 80 }),
      unit({
        ref: ref("bannernob"),
        model_count: 1,
        points: 80,
        enhancement: ref("follow-me-ladz-war-horde", "Follow Me Ladz"),
        enhancement_points: 25,
      }),
    ]);

    const entries = dedupeRoster(r);
    expect(entries).toHaveLength(2);
    const enhanced = entries.find((e) => e.enhancement)!;
    expect(enhanced.totalPoints).toBe(105);
    expect(entries.find((e) => !e.enhancement)!.totalPoints).toBe(80);
  });

  it("merges identical characters without enhancements", () => {
    const r = roster([
      unit({ ref: ref("bannernob"), model_count: 1 }),
      unit({ ref: ref("bannernob"), model_count: 1 }),
    ]);
    expect(dedupeRoster(r)).toHaveLength(1);
  });

  it("marks weapons carried by every instance at the same count as universal", () => {
    const r = roster([
      unit({ ref: ref("deff-dread"), wargear: [{ ref: ref("dread-klaw"), count: 2 }] }),
      unit({ ref: ref("deff-dread"), wargear: [{ ref: ref("dread-klaw"), count: 2 }] }),
    ]);
    const [entry] = dedupeRoster(r);
    expect(entry.mergedWargear[0].universal).toBe(true);
    expect(instanceTag(entry.mergedWargear[0])).toBeNull();
  });

  it("groups unresolved units by normalized raw name", () => {
    const r = roster([
      unit({ ref: ref(null, "Killa Kanz ") }),
      unit({ ref: ref(null, "killa kanz") }),
    ]);
    expect(dedupeRoster(r)).toHaveLength(1);
  });

  it("preserves warlord and leader attachment through the merge", () => {
    const r = roster([
      unit({ ref: ref("boyz") }),
      unit({
        ref: ref("boyz"),
        is_warlord: true,
        leader_attachment: {
          bodyguard_ref: ref("beast-snagga-boyz"),
          role: "leader",
          provisional: true,
        },
      }),
    ]);
    const [entry] = dedupeRoster(r);
    expect(entry.isWarlord).toBe(true);
    expect(entry.instances[1].leaderAttachment?.role).toBe("leader");
    expect(entry.instances[0].leaderAttachment).toBeNull();
  });
});
