/** Trade Republic style tile: one big number (or short text) and a quiet label. */
export function StatTile({ value, label, wide = false }: { value: string; label: string; wide?: boolean }) {
  const isNumber = /^[\d.,+\-% ]+$/.test(value);
  return (
    <div className={`flex flex-col gap-1.5 rounded-md border border-line bg-tile px-5 py-4 ${wide ? "col-span-2" : ""}`}>
      <span className={`font-mono font-medium leading-none tracking-tight ${isNumber ? "text-5xl" : "text-xl leading-snug"}`}>
        {value}
      </span>
      <span className="text-sm text-mute">{label}</span>
    </div>
  );
}
