import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { bot } from '@/lib/bot';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('Received ImprovMX Webhook:', payload);

    // Extract fields. ImprovMX might send 'to' as a string or in an object.
    const to = payload.to || payload.recipient;
    const from = payload.from || payload.sender;
    const subject = payload.subject || '(No Subject)';
    const text = payload.text || '';
    const html = payload.html || '';

    if (!to) {
      return NextResponse.json({ error: 'Missing "to" field' }, { status: 400 });
    }

    // 1. Find the inbox in Supabase
    const { data: inbox, error: inboxError } = await supabase
      .from('inboxes')
      .select('id, user_id, email_address')
      .eq('email_address', to)
      .single();

    if (inboxError || !inbox) {
      console.log(`Inbox not found for: ${to}`);
      return NextResponse.json({ message: 'Inbox not found' }, { status: 200 }); // Return 200 to prevent ImprovMX from retrying
    }

    // 2. Insert message into Supabase
    const { error: msgError } = await supabase.from('messages').insert({
      inbox_id: inbox.id,
      sender: from,
      subject: subject,
      body_text: text,
      body_html: html,
      timestamp: new Date().toISOString()
    });

    if (msgError) {
      console.error('Error inserting message:', msgError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // 3. Notify user via Telegram
    try {
      await bot.api.sendMessage(
        inbox.user_id,
        `📧 *New Email Received\\!*\\n\\n` +
        `📥 *To:* \`${inbox.email_address}\`\\n` +
        `👤 *From:* ${from}\\n` +
        `📝 *Subject:* ${subject}\\n\\n` +
        `Use /inbox to see the content\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    } catch (botError) {
      console.error('Error sending Telegram notification:', botError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
