const GET_METHOD = 'GET' as const;

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
      return methodNotAllowed();
    }

    return Response.json({ status: 'ok' });
  },
};
