import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-sm text-center flex flex-col gap-4">
        <h1 className="font-serif text-4xl tracking-tight">404</h1>
        <p className="text-sm text-muted-foreground">Page not found.</p>
        <Link
          href="/"
          className="mx-auto bg-foreground text-background px-4 py-2 rounded-md text-sm hover:opacity-90 transition-opacity"
        >
          go home
        </Link>
      </div>
    </div>
  );
}
