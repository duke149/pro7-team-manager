import Pro7App from "./pro7-app";
import { requireProductUser } from "../lib/supabase/auth";

export default async function Home() {
  await requireProductUser("/");
  return <Pro7App />;
}
