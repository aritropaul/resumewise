// Structured API error responses.

export function apiError(
  message: string,
  status: number,
  code?: string
): Response {
  return Response.json(
    { error: message, ...(code ? { code } : {}) },
    { status }
  );
}
