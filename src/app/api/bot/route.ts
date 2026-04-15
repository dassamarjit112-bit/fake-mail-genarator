import { bot } from '@/lib/bot';
import { webhookCallback } from 'grammy';
import { NextResponse } from 'next/server';

export const POST = webhookCallback(bot, 'std/http');

// GET handler to automatically (re)connect the webhook
export async function GET(request: Request) {
  try {
    const { host } = new URL(request.url);
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${protocol}://${host}/api/bot`;
    
    await bot.api.setWebhook(webhookUrl);
    
    return NextResponse.json({ 
      success: true, 
      message: "Webhook successfully reconnected!",
      url: webhookUrl 
    });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      message: "Failed to reconnect webhook",
      error: error.message 
    }, { status: 500 });
  }
}
