/**
 * Shared ambient backdrop used by every product surface.
 */
export function AppAmbient() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-bg" />
      <div className="absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_at_top,rgb(232_184_109_/_0.07),transparent_62%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_0%,rgb(9_9_11_/_0.55)_72%,var(--color-bg)_100%)]" />
    </div>
  );
}
