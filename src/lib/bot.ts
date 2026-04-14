import { Bot, webhookCallback } from 'grammy';
import { supabase } from './supabase';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

export const bot = new Bot(token);

// Helper to escape MarkdownV2 special characters
function escapeMd(text: string) {
  return text.replace(/[\\_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Middleware to sync user info
bot.use(async (ctx, next) => {
  if (ctx.from) {
    const { id, username, first_name, last_name } = ctx.from;
    const name = username || `${first_name} ${last_name || ''}`.trim();
    
    // Upsert user into Supabase
    await supabase.from('users').upsert({
      id: id,
      username: name
    });
  }
  await next();
});

// Welcome message
bot.command('start', (ctx) => {
  const name = ctx.from?.first_name || 'there';
  const escapedName = escapeMd(name);
  
  return ctx.reply(
    `✨ *Welcome, ${escapedName}\\!* ✨\n\n` +
    `I am your professional *Fake Mail Generator* bot\\. ` +
    `I can help you stay anonymous and keep your real inbox clean\\!\n\n` +
    `🚀 *Available Commands:*\n` +
    `• /generate \\- Spawn a new random email\n` +
    `• /inbox \\- View and manage your email addresses\n` +
    `• /help \\- Get assistance\n\n` +
    `*How it works:*\n` +
    `1️⃣ Generate an address\n` +
    `2️⃣ Use it anywhere\n` +
    `3️⃣ Get notified here instantly when mail arrives\\!`,
    { parse_mode: 'MarkdownV2' }
  );
});

bot.command('generate', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const randomString = Math.random().toString(36).substring(2, 10);
  const domain = process.env.DOMAIN || 'sdev-mailbox.linkpc.net';
  const emailAddress = `${randomString}@${domain}`;

  // Save to Supabase
  const { error } = await supabase.from('inboxes').insert({
    user_id: userId,
    email_address: emailAddress
  });

  if (error) {
    return ctx.reply(`❌ Error generating email: ${escapeMd(error.message)}`);
  }

  return ctx.reply(
    `✅ *New Email Generated:*\\n\\n` +
    `📧 \`${emailAddress}\`\\n\\n` +
    `You will receive alerts here when someone sends an email to this address\\!`,
    { parse_mode: 'MarkdownV2' }
  );
});

bot.command('inbox', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  // Get all inboxes for this user
  const { data: inboxes, error: inboxError } = await supabase
    .from('inboxes')
    .select('id, email_address')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (inboxError) return ctx.reply('❌ Error fetching inboxes\\.');
  
  if (!inboxes || inboxes.length === 0) {
    return ctx.reply('📭 You don\'t have any active mailboxes\\. Use /generate to create one\\!');
  }

  let response = `📬 *Your Mailboxes:*\\n\\n`;
  for (const inbox of inboxes) {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('inbox_id', inbox.id);

    response += `📧 \`${inbox.email_address}\`\\n`;
    response += `📩 Messages: ${count || 0}\\n\\n`;
  }

  response += `_Showing your active addresses\\. Incoming mail will be pushed to you instantly\\._`;

  return ctx.reply(response, { parse_mode: 'MarkdownV2' });
});

bot.command('help', (ctx) => {
  return ctx.reply(
    `🛠️ *Help Center*\n\n` +
    `• Use /generate to create a new inbox\\.\n` +
    `• Use /inbox to see your addresses\\.\n` +
    `• When an email arrives, I will send you a message automatically\\.\n\n` +
    `_Issues? Contact your administrator\\._`,
    { parse_mode: 'MarkdownV2' }
  );
});
