'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Mail, 
  Inbox, 
  Users, 
  Activity, 
  Trash2, 
  Send,
  X,
  Search,
  User,
  Shield,
  ArrowRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Dashboard() {
  const [stats, setStats] = useState({ inboxes: 0, messages: 0, users: 0 });
  const [inboxes, setInboxes] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [transferModal, setTransferModal] = useState<{ open: boolean; inboxId?: string; currentEmail?: string }>({ open: false });
  const [targetUsername, setTargetUsername] = useState('');

  useEffect(() => {
    fetchInitialData();

    const messagesSubscription = supabase
      .channel('realtime_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages(prev => [payload.new, ...prev].slice(0, 10));
        setStats(prev => ({ ...prev, messages: prev.messages + 1 }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesSubscription);
    };
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { count: inboxCount } = await supabase.from('inboxes').select('*', { count: 'exact', head: true });
      const { count: msgCount } = await supabase.from('messages').select('*', { count: 'exact', head: true });
      const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
      
      const { data: recentInboxes } = await supabase
        .from('inboxes')
        .select('*, users(username)')
        .order('created_at', { ascending: false });

      const { data: recentMessages } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      const { data: userList } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      setStats({ inboxes: inboxCount || 0, messages: msgCount || 0, users: userCount || 0 });
      setInboxes(recentInboxes || []);
      setMessages(recentMessages || []);
      setUsers(userList || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  const deleteInbox = async (id: string) => {
    if (!confirm('Are you sure you want to delete this inbox and all its messages?')) return;
    const { error } = await supabase.from('inboxes').delete().eq('id', id);
    if (!error) fetchInitialData();
  };

  const handleTransfer = async () => {
    if (!targetUsername || !transferModal.inboxId) return;

    // Find user by username
    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .ilike('username', targetUsername)
      .single();

    if (userError || !targetUser) {
      alert('User not found. Make sure the username is correct.');
      return;
    }

    const { error: transferError } = await supabase
      .from('inboxes')
      .update({ user_id: targetUser.id })
      .eq('id', transferModal.inboxId);

    if (transferError) {
      alert('Transfer failed: ' + transferError.message);
    } else {
      alert('Email transferred successfully!');
      setTransferModal({ open: false });
      setTargetUsername('');
      fetchInitialData();
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800 pb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
              Fake Mail Controller
            </h1>
            <p className="text-zinc-500 mt-1">System Management & User Administration</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-emerald-400">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Dashboard
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Total Users" value={stats.users} icon={<Users />} color="text-amber-400" />
          <StatCard title="Active Inboxes" value={stats.inboxes} icon={<Inbox />} color="text-blue-400" />
          <StatCard title="Messages" value={stats.messages} icon={<Mail />} color="text-indigo-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Table */}
          <section className="lg:col-span-2 glass rounded-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
              <h2 className="text-lg font-semibold flex items-center gap-2 font-code">
                <Shield className="w-5 h-5 text-zinc-400" />
                Inboxes Control Center
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-zinc-500 bg-black/40">
                  <tr>
                    <th className="px-6 py-4 font-medium">Email / Owner</th>
                    <th className="px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {inboxes.map((inbox) => (
                    <tr key={inbox.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-blue-300">{inbox.email_address}</div>
                        <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                          <User className="w-3 h-3" /> {inbox.users?.username || 'Unknown'} (${inbox.user_id})
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => setTransferModal({ open: true, inboxId: inbox.id, currentEmail: inbox.email_address })}
                            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-blue-400 transition-all border border-zinc-800"
                            title="Transfer"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteInbox(inbox.id)}
                            className="p-2 rounded-lg bg-zinc-900 hover:bg-red-500/10 text-zinc-400 hover:text-red-500 transition-all border border-zinc-800"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Live Feed */}
          <section className="glass rounded-2xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/10">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                Live Messages
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((message) => (
                <div key={message.id} className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/50">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h3 className="text-xs font-semibold text-zinc-200 truncate">{message.subject}</h3>
                    <span className="text-[9px] text-zinc-600 block shrink-0">{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 truncate">From: {message.sender}</p>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>

      {/* Transfer Modal */}
      {transferModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass rounded-2xl p-8 border border-zinc-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Transfer Email</h2>
              <button onClick={() => setTransferModal({ open: false })} className="text-zinc-500 hover:text-white"><X /></button>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              Transferring <span className="text-blue-400 italic">"{transferModal.currentEmail}"</span> to a new owner.
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Recipient Username</label>
                <input 
                  type="text" 
                  value={targetUsername}
                  onChange={(e) => setTargetUsername(e.target.value)}
                  placeholder="e.g. johndoe"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
              </div>
              <button 
                onClick={handleTransfer}
                className="w-full h-12 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-blue-900/20"
              >
                Execute Transfer
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="glass rounded-2xl p-6 relative overflow-hidden">
      <div className={cn("absolute -right-4 -bottom-4 opacity-5", color)}>{icon}</div>
      <div className="flex items-center gap-3 text-zinc-400 mb-4">
        <div className={cn("p-2 rounded-lg bg-zinc-900 border border-zinc-800", color)}>{icon}</div>
        <span className="text-xs font-bold uppercase tracking-widest">{title}</span>
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}
