// Reports whether the server has an API key in its environment so the client
// can skip the "Paste your API key" prompt when a server-side fallback exists.
export async function GET() {
  const available = !!process.env.OPENAI_API_KEY;
  return Response.json({ available });
}
