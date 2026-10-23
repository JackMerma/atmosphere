export default function CornerBrackets() {
  const corner = "absolute h-2 w-2 border-foreground/60";
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
      <span className={`${corner} -left-0.5 -top-0.5 border-l border-t`} />
      <span className={`${corner} -right-0.5 -top-0.5 border-r border-t`} />
      <span className={`${corner} -left-0.5 -bottom-0.5 border-l border-b`} />
      <span className={`${corner} -right-0.5 -bottom-0.5 border-r border-b`} />
    </span>
  );
}
