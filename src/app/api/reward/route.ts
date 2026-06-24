import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { bot } from '@/lib/bot';

export async function GET(request: Request) {
  // Parse userid from query parameters
  const { searchParams } = new URL(request.url);
  const userid = searchParams.get('userid');

  if (!userid) {
    return NextResponse.json({ error: "Missing tracking profile identifier parameters." }, { status: 400 });
  }

  try {
    console.log(`[AdsGram Server Handshake]: User ${userid} verified. Granting system permissions.`);

    /**
     * DATABASE STATE ACTION:
     * We log or update a row tracking this specific Telegram User ID. 
     * We set an 'unlocked_until' timestamp flag 1 hour into the future 
     * so they can generate emails or download files completely ad-free.
     */
    const expiryTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('user_rewards')
      .upsert({ 
        telegram_id: userid.toString(), 
        is_rewarded: true, 
        unlocked_until: expiryTime 
      }, { onConflict: 'telegram_id' });

    if (error) {
      console.error("Reward system DB failure:", error.message);
      throw error;
    }

    // Send an instantaneous alert directly to the user's Telegram device
    await bot.api.sendMessage(
      userid,
      "🎉 *Sponsor Check Verified!*\n\nYour premium high\\-speed access has been unlocked for the next 60 minutes\\. Use /generate now\\!",
      { parse_mode: 'MarkdownV2' }
    );

    // CRUCIAL: Return a clear HTTP 200 JSON success response so AdsGram knows the reward processed successfully
    return NextResponse.json({ success: true, user: userid, status: "Granted" });

  } catch (err: any) {
    console.error("Reward system failure:", err.message);
    return NextResponse.json({ error: "Internal processing database transaction crash." }, { status: 500 });
  }
}
