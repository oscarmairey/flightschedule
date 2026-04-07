// Auth.js v5 catch-all route — re-exports the configured handlers.
// All NextAuth endpoints (signin, signout, callback, csrf, session) live here.
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
