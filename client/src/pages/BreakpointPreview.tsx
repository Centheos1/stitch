import { useState } from "react";

const widths = [
  { label: "Phone", width: 390 },
  { label: "Small", width: 640 },
  { label: "Tablet", width: 768 },
  { label: "Laptop", width: 1024 },
  { label: "Desktop", width: 1280 },
  { label: "Wide desktop", width: 1536 },
];

export default function BreakpointPreview() {
  const [width, setWidth] = useState(widths[0].width);

  return (
    <main className="flex h-dvh flex-col bg-muted">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3">
        <label htmlFor="preview-width" className="font-semibold">Preview size</label>
        <select
          id="preview-width"
          className="rounded-lg border border-border bg-white px-3 py-2"
          value={width}
          onChange={(event) => setWidth(Number(event.target.value))}
        >
          {widths.map((size) => (
            <option key={size.width} value={size.width}>{size.label} ({size.width} px)</option>
          ))}
        </select>
        <a href="/" className="ml-auto text-sm font-semibold underline">Open storefront</a>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <iframe
          title="Storefront preview"
          src="/"
          className="mx-auto block h-full max-w-none border-0 bg-background"
          style={{ width }}
        />
      </div>
    </main>
  );
}
