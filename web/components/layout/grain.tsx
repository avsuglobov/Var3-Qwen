/** Плёночное зерно: один фиксированный слой, монохромный SVG-шум (в CSS), только в тёмной теме; отключается при prefers-reduced-motion. */
export function Grain() {
  return <div className="grain" aria-hidden="true" />;
}
