const GET_METHOD = 'GET' as const;

function cancelUnusedRequestBodyBestEffort(request: Request): void {
  const body = request.body;
  if (body === null || request.bodyUsed) return;

  try {
    void body.cancel().catch(() => undefined);
  } catch {
    // Method rejection is authoritative; best-effort cleanup must never replace it.
  }
}

function methodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: GET_METHOD,
    },
  });
}

export default {
  fetch(request: Request): Response {
    if (request.method !== GET_METHOD) {
      cancelUnusedRequestBodyBestEffort(request);
      return methodNotAllowed();
    }

    return Response.json({ status: 'ok' });
  },
};
