import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel mx-auto mt-16 max-w-lg p-6 text-center">
      <div className="eyebrow mb-2">404</div>
      <h2 className="font-display text-lg font-semibold">Esta página no existe</h2>
      <Link href="/" className="btn-primary mt-4">Volver a «Hoy»</Link>
    </div>
  );
}
