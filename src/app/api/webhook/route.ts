import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { bot } from '@/lib/bot';

// Helper to escape MarkdownV2 special characters
function escapeMd(text: string) {
  if (!text) return '';
  return text.replace(/[\\_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('DEBUG: Full Webhook Body Received:', JSON.stringify(payload, null, 2));

    // Advanced field extraction for Cloudflare/ForwardEmail/ImprovMX
    const to = payload.to || (payload.headers && payload.headers.to) || '';
    const from = payload.from || (payload.headers && payload.headers.from) || '';
    const subject = payload.subject || (payload.headers && payload.headers.subject) || '(No Subject)';
    
    const text = payload.text || '';
    const html = payload.html || '';

    if (!to) {
      console.error("ERROR: Recipient (to) field is missing");
      return NextResponse.json({ error: 'Missing to field' }, { status: 200 });
    }

    // 1. Find the owner in Supabase
    const { data: inbox, error: inboxError } = await supabase
      .from('inboxes')
      .select('id, user_id, email_address')
      .ilike('email_address', to)
      .single();

    if (inboxError || !inbox) {
      console.warn(`LOG: No owner found for address: ${to}`);
      return NextResponse.json({ message: 'Owner not found' }, { status: 200 });
    }

    // 2. Save the message to Supabase
    const { error: dbError } = await supabase.from('messages').insert({
      inbox_id: inbox.id,
      sender: from,
      subject: subject,
      body_text: text,
      body_html: html,
      timestamp: new Date().toISOString()
    });

    if (dbError) console.error("DB SAVE ERROR:", dbError.message);

    // 3. Notify user via Telegram with FULL ESCAPING
    try {
      const notificationText = 
        `📧 *New Email Received!* 📧\n\n` +
        `📥 *To:* \`${escapeMd(inbox.email_address)}\`\n` +
        `👤 *From:* ${escapeMd(from)}\n` +
        `📝 *Subject:* ${escapeMd(subject)}\n\n` +
        `_Check the dashboard for full content._`;

      await bot.api.sendMessage(inbox.user_id, notificationText, { 
        parse_mode: 'MarkdownV2' 
      });
      
      console.log(`SUCCESS: Notified user ${inbox.user_id} about mail from ${from}`);
    } catch (botError: any) {
      console.error("TELEGRAM LOGIC ERROR:", botError.description || botError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('CRITICAL SYSTEM ERROR:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
