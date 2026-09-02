export function MapKey() {
  const row = "flex items-center gap-3 text-[12px]";
  return (
    <div className="absolute z-[80] left-6 bottom-6 p-4 px-6 bg-bg border border-divider rounded-lg shadow-sm">
      <div className="panel-label mb-3">Key</div>
      <div className="grid gap-3">
        <div className={row}><i className="w-[15px] h-[15px] rounded-sm border-[1.5px] border-ink-38" /> Suspected — one vehicle</div>
        <div className={row}><i className="w-[17px] h-[17px] rounded-sm bg-accent" /> Confirmed — corroborated</div>
        <div className={row}><i className="w-[17px] h-[17px] rounded-sm bg-accent-800" /> Scheduled — on a route</div>
        <div className={row}><i className="w-[15px] h-[15px] rounded-sm border-[1.5px] border-neutral-300" /> Repaired — closed today</div>
      </div>
      <div className="mt-3 pt-3 border-t border-divider text-[12px] text-ink-55">Marker size shows severity</div>
    </div>
  );
}
