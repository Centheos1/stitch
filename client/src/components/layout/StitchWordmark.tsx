const LETTERS = [
  { letter: "S", color: "var(--stitch-red)" },
  { letter: "T", color: "var(--stitch-orange)" },
  { letter: "I", color: "var(--stitch-yellow)" },
  { letter: "T", color: "var(--stitch-green)" },
  { letter: "C", color: "var(--stitch-blue)" },
  { letter: "H", color: "var(--stitch-purple)" },
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
