import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({path: '.env.local'});
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const res = await supabase.from('inboxes').insert({user_id: 12345, email_address: 'test12345@test.com'});
  console.log(JSON.stringify(res, null, 2));
}

test();
