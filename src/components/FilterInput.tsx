/** Filter text input with a clear ✕ — typing a query on mobile is easy,
 * un-typing it isn't, so give it a tap target. */
export default function FilterInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-edge bg-panel py-2 pl-3 pr-10 text-sm"
      />
      {value !== "" && (
        <button
          type="button"
          aria-label="Clear filter"
          onClick={() => onChange("")}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-faint hover:text-ink"
        >
          ✕
        </button>
      )}
    </div>
  );
}
