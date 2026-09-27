"use client";

import Link from "next/link";

/**
 * Root layout failure boundary. No error details are rendered (they stay
 * server-side); the page works without any failing subsystem.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            margin: "0 auto",
            maxWidth: "40rem",
            padding: "4rem 1rem",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800 }}>Something went wrong</h1>
          <p style={{ marginTop: "0.75rem", color: "#444" }}>
            SnapFlow hit an unexpected error. Your downloads and account are
            unaffected — please try again.
          </p>
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{ padding: "0.6rem 1.25rem", borderRadius: "999px", border: "1px solid #ccc", fontWeight: 700 }}
            >
              Try again
            </button>
            <Link href="/" style={{ padding: "0.6rem 1.25rem", borderRadius: "999px", background: "#111", color: "#fff", fontWeight: 700, textDecoration: "none" }}>
              Go home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
