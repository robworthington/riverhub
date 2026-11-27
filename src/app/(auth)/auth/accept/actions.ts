"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  not_signed_in: "Sign in first.",
  email_unconfirmed: "Your email address hasn't been confirmed yet. Use the link in your invitation email.",
  not_found: "We couldn't find that invitation.",
  already_accepted: "This invitation has already been accepted.",
  cancelled: "This invitation was cancelled. Ask the group for a new one.",
  expired: "This invitation has expired. Ask the group to send it again.",
  wrong_account: "This invitation was sent to a different email address. Sign out and sign in with that address.",
  account_deactivated: "Your account has been deactivated. Contact the group.",
};

/** Accept by the link's token, or by id from the list of my invitations. */
export async function acceptInvitation(input: { token?: string; id?: string }): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation" as never,
    (input.token ? { p_token: input.token } : { p_id: input.id }) as never);
  if (error) {
    const k = Object.keys(ERRORS).find((key) => error.message.includes(key));
    return { error: k ? ERRORS[k] : error.message };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
