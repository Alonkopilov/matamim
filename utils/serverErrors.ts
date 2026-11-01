import i18n from "@/i18n";
import he from "@/i18n/locales/he";
import {
  FunctionsFetchError,
  FunctionsHttpError,
} from "@supabase/supabase-js";

type ErrorCode = keyof typeof he.errors;

const isErrorCode = (code: unknown): code is ErrorCode =>
  typeof code === "string" && code in he.errors;

// An edge function error, with its message in the user's language
export class ServerError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
  ) {
    super(message);
  }
}

const fromCode = (code: ErrorCode, params?: object, status?: number) =>
  new ServerError(i18n.t(`errors.${code}`, { ...params }), code, status);

/** Turns the error of a failed functions.invoke into a ServerError */
export async function toServerError(error: unknown): Promise<ServerError> {
  if (error instanceof FunctionsFetchError) return fromCode("NETWORK");
  if (!(error instanceof FunctionsHttpError)) return fromCode("UNKNOWN");

  const status: number = error.context.status;
  let body: { code?: unknown; params?: object } = {};
  try {
    body = await error.context.json();
  } catch {}

  if (isErrorCode(body.code)) return fromCode(body.code, body.params, status);

  const code = typeof body.code === "string" ? body.code : "UNKNOWN";
  return new ServerError(i18n.t("errors.UNKNOWN"), code, status);
}
