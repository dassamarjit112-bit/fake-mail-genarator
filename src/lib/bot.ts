import { Bot, Context, session, InlineKeyboard } from 'grammy';
import { 
    conversations, 
    createConversation, 
    type Conversation, 
    type ConversationFlavor 
} from '@grammyjs/conversations';
import { supabaseAdapter } from '@grammyjs/storage-supabase';
import { supabase } from './supabase';

interface SessionData {
    // Session data if needed
}

type MyContext = Context & ConversationFlavor<any> & {
    session: SessionData;
};

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is not set');
}

export const bot = new Bot<MyContext>(token);

// --- Conversation Logic ---

async function transferConversation(conversation: Conversation<MyContext>, ctx: MyContext) {
    const userId = ctx.from?.id;
    if (!userId) return;

    await ctx.replyWithChatAction('typing');

    // 1. Fetch user's emails
    const { data: inboxes, error: inboxError } = await conversation.external(() => 
        supabase.from('inboxes').select('id, email_address').eq('user_id', userId)
    );

    if (inboxError || !inboxes || inboxes.length === 0) {
        return await ctx.reply("❌ You don't have any emails to transfer.");
    }

    // 2. Ask user to select an email
    const keyboard = new InlineKeyboard();
    inboxes.forEach((inbox) => {
        keyboard.text(inbox.email_address, `transfer_id:${inbox.id}`).row();
    });
    keyboard.text("❌ Cancel", "transfer_cancel");

    await ctx.reply("📧 *Select the email you want to transfer:*", { 
        reply_markup: keyboard,
        parse_mode: "MarkdownV2" 
    });

    // Wait for button press
    const selectCtx = await conversation.waitFor("callback_query:data");
    await selectCtx.answerCallbackQuery();
    const callbackQuery = selectCtx.callbackQuery;

    if (callbackQuery.data === "transfer_cancel") {
        return await selectCtx.editMessageText("❌ Transfer cancelled.");
    }

    const inboxId = callbackQuery.data.split(":")[1];
    const selectedInbox = inboxes.find(i => i.id === inboxId);

    if (!selectedInbox) return await ctx.reply("❌ Invalid selection.");

    // 3. Ask for recipient username
    await selectCtx.editMessageText(`📤 *Transferring:* \`${escapeMd(selectedInbox.email_address)}\`\n\nNow, please *send the Telegram username* of the person you want to transfer this email to\\.`, {
        parse_mode: "MarkdownV2"
    });

    const usernameCtx = await conversation.waitFor("message:text");
    const targetUsername = usernameCtx.message.text.replace(/^@/, "").trim();

    // 4. Verify recipient exists
    const { data: targetUser, error: userError } = await conversation.external(() =>
        supabase.from('users').select('id, username').ilike('username', targetUsername).single()
    );

    if (userError || !targetUser) {
        return await ctx.reply("❌ User not found\\. They must have used this bot at least once\\.");
    }

    if (targetUser.id === userId) {
        return await ctx.reply("❌ You cannot transfer an email to yourself\\.");
    }

    // 5. Confirm transfer
    const confirmKeyboard = new InlineKeyboard()
        .text("✅ Yes, Transfer", `confirm_transfer:${inboxId}:${targetUser.id}`)
        .row()
        .text("❌ No, Cancel", "transfer_cancel");

    await ctx.reply(
        `⚠️ *CONFIRM TRANSFER* ⚠️\n\n` +
        `Are you sure you want to transfer \`${escapeMd(selectedInbox.email_address)}\` to *${escapeMd(targetUser.username || "this user")}* \\(ID: ${targetUser.id}\\)?\n\n` +
        `_Note: You will lose all access to this email instantly\\._`,
        { reply_markup: confirmKeyboard, parse_mode: "MarkdownV2" }
    );

    // Wait for confirmation
    const confirmCtx = await conversation.waitFor("callback_query:data");
    await confirmCtx.answerCallbackQuery();

    if (confirmCtx.callbackQuery.data === "transfer_cancel") {
        return await confirmCtx.editMessageText("❌ Transfer cancelled.");
    }

    // 6. Execute transfer
    const { error: transferError } = await conversation.external(() =>
        supabase.from('inboxes').update({ user_id: targetUser.id }).eq('id', inboxId)
    );

    if (transferError) {
        return await ctx.reply(`❌ Transfer failed: ${escapeMd(transferError.message)}`);
    }

    await confirmCtx.editMessageText("🚀 *Transfer Successful\\!* \n\nYou no longer have access to this email address\\. The new owner has been notified\\.");

    // Notify the new owner
    try {
        await ctx.api.sendMessage(targetUser.id, 
            `🎁 *You received a new email account\\!* 🎁\n\n` +
            `Address: \`${escapeMd(selectedInbox.email_address)}\`\n\n` +
            `You can now see it in /emails and receive incoming messages\\!`,
            { parse_mode: "MarkdownV2" }
        );
    } catch (e) {
        console.error("Failed to notify new owner:", e);
    }
}

// Helper to escape MarkdownV2 special characters
function escapeMd(text: string) {
  return text.replace(/[\\_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// Install session and conversations
const storage = supabaseAdapter({
  supabase,
  table: 'sessions',
});

bot.use(session({
  initial: () => ({}),
  storage,
}));
bot.use(conversations());
bot.use(createConversation(transferConversation, "transferConversation"));

// Welcome message
bot.command('start', async (ctx) => {
  const name = ctx.from?.first_name || 'there';
  const escapedName = escapeMd(name);

  // Sync user info only on /start to reduce DB load
  if (ctx.from) {
    const { id, username, first_name, last_name } = ctx.from;
    const displayName = username || `${first_name} ${last_name || ''}`.trim();
    await supabase.from('users').upsert({ id, username: displayName });
  }
  
  return ctx.reply(
    `✨ *Welcome, ${escapedName}\\!* ✨\n\n` +
    `I am your professional *Fake Mail Generator* bot\\. ` +
    `I can help you stay anonymous and keep your real inbox clean\\!\n\n` +
    `🚀 *Available Commands:*\n` +
    `• /generate \\- Spawn a new random email\n` +
    `• /emails \\- View and manage your email addresses\n` +
    `• /transfer \\- Move an email to another user\n` +
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

  await ctx.replyWithChatAction('typing');

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

bot.command('emails', async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  await ctx.replyWithChatAction('typing');

  // Get all inboxes for this user
  const { data: inboxes, error: inboxError } = await supabase
    .from('inboxes')
    .select('id, email_address')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (inboxError) return ctx.reply('❌ Error fetching inboxes\\.');
  
  if (!inboxes || inboxes.length === 0) {
    return ctx.reply("📭 You don\\'t have any active mailboxes\\. Use /generate to create one\\!");
  }

  let totalEmails = inboxes.length;
  let response = `✨ *Your Active Mailboxes \\(${totalEmails}\\)* ✨\n\n`;
  
  // OPTIMIZATION: Fetch all counts in parallel to avoid N+1 bottleneck
  const countsResults = await Promise.all(
    inboxes.map(inbox => 
      supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('inbox_id', inbox.id)
    )
  );

  for (const [index, inbox] of inboxes.entries()) {
    const { count } = countsResults[index];
    response += `*${index + 1}\\.* 📧 \`${inbox.email_address}\`\n`;
    response += `      └ 📩 *${count || 0}* Messages\n\n`;
  }

  response += `_Incoming mail is pushed to you instantly\\._`;

  return ctx.reply(response, { parse_mode: 'MarkdownV2' });
});

bot.command('transfer', async (ctx) => {
  await ctx.conversation.enter('transferConversation');
});

bot.command('help', (ctx) => {
  return ctx.reply(
    `🛠️ *Help Center*\n\n` +
    `• Use /generate to create a new inbox\\.\n` +
    `• Use /emails to see your addresses\\.\n` +
    `• Use /transfer to send an email to someone else\\.\n` +
    `• When an email arrives, I will send you a message automatically\\.\n\n` +
    `_Issues? Contact your administrator\\._`,
    { parse_mode: 'MarkdownV2' }
  );
});
