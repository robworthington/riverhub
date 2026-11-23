import { INSTANCE } from "@/lib/instance";

// Donations fund River Hub as a whole, not a local group: the data work, the information requests and
// the platform, for every river. One destination on every river page (never a per-river donate link,
// so a river can't silently collect for someone else), named as River Hub on the button, with one line
// saying who handles the money. A local group's own site stays linked separately ("Run by …").

/** Where a River Hub donation goes. */
export const SUPPORT_URL = INSTANCE.donateUrl;

/** Button label for every donate ask. */
export const SUPPORT_LABEL = "Support River Hub";

/** Who handles the money, shown under every donate ask. */
export const SUPPORT_HANDLER_NOTE = "Donations are handled by Friends of the Dart, the volunteer group that builds River Hub.";
