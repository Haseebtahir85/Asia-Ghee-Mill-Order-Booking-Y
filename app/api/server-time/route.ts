// Returns the server's current time. Used by the /book page to check the
// device's own clock against a time source that can't be spoofed by
// changing the device's date/time — and, being on the same Vercel
// deployment as the rest of the app, it has no separate uptime/CORS risk
// the way a third-party time API does (if this is down, the booking page
// itself is down too).
export const dynamic = "force-dynamic"; // never cache — every request must return the current instant

export async function GET() {
  return Response.json({ nowMs: Date.now() });
}