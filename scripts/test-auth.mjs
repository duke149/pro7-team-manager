import { createClient } from "@supabase/supabase-js";

const url = "https://pficsujapinkmqsyvcfw.supabase.co";
const key = "sb_publishable_32RYtbRIARcCD1V5myqe4Q_mx33eCEL";
const supabase = createClient(url, key);

async function testLogin(email, password) {
  console.log(`Testing login for: "${email}" with password...`);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    console.log(`  Result: ERROR: [${error.status}] ${error.message} (${error.name})`);
  } else {
    console.log(`  Result: SUCCESS! User ID: ${data.user?.id}, Email: ${data.user?.email}`);
    console.log(`  Metadata:`, data.user?.user_metadata);
  }
}

async function main() {
  const password = "Sup3rm4n001@!";
  await testLogin("hunglt@pro7.test", password);
  await testLogin("hunglt", password);
  await testLogin("hunglt@gmail.com", password);
}

main().catch(console.error);
