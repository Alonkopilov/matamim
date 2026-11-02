// The Premium rule, same as is_user_premium() in SQL: a row with no expiry is
// a lifetime purchase, otherwise it counts until expires_at.

type AdminClient = { from: (table: string) => any };

/** Whether a premium_entitlements row is active right now */
export function isActiveEntitlement(
  row: { expires_at: string | null },
  now = new Date(),
) {
  return row.expires_at === null || new Date(row.expires_at) > now;
}

/** Whether the user has Premium now. Throws if the lookup fails. */
export async function isPremium(supabaseAdmin: AdminClient, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("premium_entitlements")
    .select("expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Premium check failed: ${error.message}`);
  return !!data && isActiveEntitlement(data);
}
