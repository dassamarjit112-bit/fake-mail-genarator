export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { bot } from '@/lib/bot';
import { simpleParser } from 'mailparser';

// Helper to escape MarkdownV2 special characters
function escapeMd(text: string) {
  if (!text) return '';
  return text.replace(/[\\_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Helper to extract text from mailparser address objects which can be arrays or single objects
function getAddress(addr: any): string | undefined {
  if (!addr) return undefined;
  if (typeof addr === 'string') return addr;
  if (Array.isArray(addr)) return getAddress(addr[0]);
  return addr.text || undefined;
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log("DEBUG: Webhook Payload Received. Raw exists:", !!payload.raw);

    let from = payload.from;
    let to = payload.to;
    let subject = payload.subject;
    let text = payload.text || '';
    let html = payload.html || '';

    // If Cloudflare sent the raw email, parse it for HTML/Text
    if (payload.raw) {
      try {
        const parsed = await simpleParser(payload.raw);
        from = from || getAddress(parsed.from) || getAddress(parsed.headers.get('from'));
        to = to || getAddress(parsed.to) || getAddress(parsed.headers.get('to'));
        subject = subject || parsed.subject || '(No Subject)';
        text = parsed.text || '';
        html = parsed.html || parsed.textAsHtml || '';
        
        console.log("DEBUG: Successfully parsed raw email with mailparser");
      } catch (parseError: any) {
        console.error("ERROR: Mailparser failed:", parseError.message);
      }
    }

    // Fallbacks
    to = to || (payload.headers && payload.headers.to) || '';
    from = from || (payload.headers && payload.headers.from) || '';
    subject = subject || (payload.headers && payload.headers.subject) || '(No Subject)';

    if (!to) {
      console.error("ERROR: Recipient missing");
      return NextResponse.json({ error: 'Missing to field' }, { status: 200 });
    }

    // 1. Find the owner in Supabase
    const { data: inbox, error: inboxError } = await supabase
      .from('inboxes')
      .select('id, user_id, email_address')
      .ilike('email_address', to)
      .single();

    if (inboxError || !inbox) {
      console.warn(`LOG: No owner found for: ${to}`);
      return NextResponse.json({ message: 'Owner not found' }, { status: 200 });
    }

    // 2. Save to Supabase (now includes HTML)
    const { error: dbError } = await supabase.from('messages').insert({
      inbox_id: inbox.id,
      sender: String(from),
      subject: String(subject),
      body_text: text,
      body_html: html,
      timestamp: new Date().toISOString()
    });

    if (dbError) console.error("DB SAVE ERROR:", dbError.message);

    // 3. Notify user via Telegram
    try {
      // Truncate text for Telegram preview (limit 4096, using 1000 for safety)
      const textPreview = text.length > 1000 ? text.substring(0, 1000) + '...' : text;

      const notificationText = 
        `📧 *New Email Received\\!* 📧\n\n` +
        `📥 *To:* \`${inbox.email_address.replace(/[`\\]/g, '\\$&')}\`\n` +
        `👤 *From:* ${escapeMd(String(from))}\n` +
        `📝 *Subject:* ${escapeMd(String(subject))}\n\n` +
        `📖 *Message Preview:* \n${escapeMd(textPreview || '(No text content)')}\n\n` +
        `_Check the dashboard for full HTML content\\._`;

      await bot.api.sendMessage(inbox.user_id, notificationText, { 
        parse_mode: 'MarkdownV2',
        link_preview_options: { is_disabled: true }
      });
    } catch (botError: any) {
      console.error("TELEGRAM ERROR:", botError.description || botError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('CRITICAL ERROR:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
