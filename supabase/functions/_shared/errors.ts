// Error bodies carry a code the app shows in the user's language, with params
// for the values in the message
export function errorResponse(
  status: number,
  code: string,
  options: {
    params?: Record<string, string | number>;
    headers?: HeadersInit;
  } = {},
) {
  return Response.json(
    { code, ...(options.params && { params: options.params }) },
    { status, headers: options.headers },
  );
}

// Codes the team triggers raise as their message
const DB_ERROR_CODES = [
  "TEAM_PREMIUM_REQUIRED",
  "MEMBER_CANNOT_HOST",
  "CANNOT_JOIN_AS_HOST",
];

/** The response for a database error the user caused, null for any other */
export function dbErrorResponse(error: { message?: string } | null) {
  const code = error?.message;
  if (!code || !DB_ERROR_CODES.includes(code)) return null;
  return errorResponse(403, code);
}

/** Logs the real error and tells the user only that something failed */
export function internalErrorResponse(name: string, err: unknown) {
  console.error(`${name} failed:`, err);
  return errorResponse(500, "INTERNAL");
}

export function unauthorizedResponse() {
  return errorResponse(401, "UNAUTHORIZED");
}
