const LETTERS = [
  { letter: "S", color: "#D11C30" },
  { letter: "T", color: "#E48945" },
  { letter: "I", color: "#F8BB1C" },
  { letter: "T", color: "#36B960" },
  { letter: "C", color: "#5385CE" },
  { letter: "H", color: "#7E25B9" },
];

export function StitchWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={className} aria-label="STITCH">
      {LETTERS.map(({ letter, color }, index) => (
        <span key={`${letter}-${index}`} style={{ color }}>{letter}</span>
      ))}
    </span>
  );
}
