import Pro7App from "./pro7-app";
import { requireCurrentUser } from "../lib/supabase/auth";

export default async function Home() {
  await requireCurrentUser("/");
  return <Pro7App />;
}
