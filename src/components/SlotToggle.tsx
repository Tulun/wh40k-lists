import { useLocation, useNavigate } from "react-router-dom";
import { useLists } from "../store/lists";
import type { Slot } from "../store/schema";

const SLOTS: { slot: Slot; label: string; activeClass: string }[] = [
  { slot: "mine", label: "Mine", activeClass: "bg-mine/20 text-mine" },
  { slot: "opponent", label: "Opponent", activeClass: "bg-opponent/20 text-opponent" },
];

export default function SlotToggle() {
  const activeSlot = useLists((s) => s.activeSlot);
  const setActiveSlot = useLists((s) => s.setActiveSlot);
  const slots = useLists((s) => s.slots);
  const lists = useLists((s) => s.lists);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function pick(slot: Slot) {
    setActiveSlot(slot);
    // Switching armies means "show me that army" — jump to its glance view
    // unless the user is mid-import (leaving would lose the pasted text).
    if (pathname !== "/" && pathname !== "/import") navigate("/");
  }

  return (
    <div className="mx-auto flex w-fit rounded-lg border border-edge bg-panel p-0.5">
      {SLOTS.map(({ slot, label, activeClass }) => {
        const listId = slots[slot];
        const listName = listId ? lists[listId]?.name : null;
        const isActive = activeSlot === slot;
        return (
          <button
            key={slot}
            type="button"
            onClick={() => pick(slot)}
            className={`min-w-24 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
              isActive ? activeClass : "text-ink-faint"
            }`}
          >
            {label}
            {listName && (
              <span className="block max-w-28 truncate text-[10px] font-normal opacity-75">
                {listName}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
