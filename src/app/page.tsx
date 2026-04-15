'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { 
  Mail, 
  Inbox, 
  Users, 
  Activity, 
  Trash2, 
  Send,
  X,
  User,
  Shield,
  ArrowRight,
  Settings,
  LogOut,
  Lock
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ inboxes: 0, messages: 0, users: 0 });
  const [inboxes, setInboxes] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);

  // Modals
  const [transferModal, setTransferModal] = useState<{ open: boolean; inboxId?: string; currentEmail?: string }>({ open: false });
  const [targetUsername, setTargetUsername] = useState('');
  
  const [passwordModal, setPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
    } else {
      setAuthLoading(false);
      fetchInitialData();
      
      const messagesSubscription = supabase
        .channel('realtime_messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          setMessages(prev => [payload.new, ...prev].slice(0, 50));
          setStats(prev => ({ ...prev, messages: prev.messages + 1 }));
        })
        .subscribe();

      return () => {
        supabase.removeChannel(messagesSubscription);
      };
    }
  }

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
        .limit(50);

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      alert('Error updating password: ' + error.message);
    } else {
      alert('Password updated successfully!');
      setPasswordModal(false);
      setNewPassword('');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800 pb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-500" />
              Fake Mail Controller
            </h1>
            <p className="text-zinc-500 mt-1">System Management & User Administration</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-emerald-400">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Dashboard
            </div>
            <button 
              onClick={() => setPasswordModal(true)}
              className="p-2 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
              title="Change Password"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-all"
              title="Secure Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Total Users" value={stats.users} icon={<Users />} color="text-amber-400" />
          <StatCard title="Active Inboxes" value={stats.inboxes} icon={<Inbox />} color="text-blue-400" />
          <StatCard title="Messages" value={stats.messages} icon={<Mail />} color="text-indigo-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Main Table */}
          <section className="lg:col-span-2 glass rounded-2xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/10">
              <h2 className="text-lg font-semibold flex items-center gap-2 font-code">
                <Shield className="w-5 h-5 text-zinc-400" />
                Inboxes Control Center
              </h2>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1">
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-zinc-500 bg-black/40 sticky top-0 backdrop-blur-md z-10">
                  <tr>
                    <th className="px-6 py-4 font-medium">Email / Owner</th>
                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {inboxes.map((inbox) => (
                    <tr key={inbox.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-blue-300">{inbox.email_address}</div>
                        <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                          <User className="w-3 h-3" /> {inbox.users?.username || 'Unknown'} ({inbox.user_id})
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
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
                  {inboxes.length === 0 && !loading && (
                    <tr><td colSpan={2} className="px-6 py-8 text-center text-sm text-zinc-500">No active inboxes.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Active Users */}
          <section className="glass rounded-2xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-6 border-b border-zinc-800 bg-zinc-900/10">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" />
                Active Telegram Users
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:bg-zinc-900/60 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-200 truncate">{user.username || 'Unknown User'}</div>
                    <div className="text-[10px] text-zinc-500">ID: {user.id}</div>
                  </div>
                </div>
              ))}
              {users.length === 0 && !loading && (
                <div className="text-center text-sm text-zinc-500 py-8">No active users found.</div>
              )}
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
                <div key={message.id} className="p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/50 relative overflow-hidden group">
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/50 group-hover:bg-emerald-400 transition-colors" />
                  <div className="flex justify-between items-start gap-2 mb-1 pl-2">
                    <h3 className="text-xs font-semibold text-zinc-200 truncate">{message.subject}</h3>
                    <span className="text-[9px] text-zinc-600 block shrink-0">{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 truncate pl-2">From: {message.sender}</p>
                </div>
              ))}
              {messages.length === 0 && !loading && (
                <div className="text-center text-sm text-zinc-500 py-8">No recent messages.</div>
              )}
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

      {/* Change Password Modal */}
      {passwordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass rounded-2xl p-8 border border-zinc-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Lock className="w-5 h-5 text-blue-400" />
                Change Password
              </h2>
              <button onClick={() => setPasswordModal(false)} className="text-zinc-500 hover:text-white"><X /></button>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              Update the admin panel secure access password.
            </p>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">New Password</label>
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                />
              </div>
              <button 
                type="submit"
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-900/20 mt-4"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className="glass rounded-2xl p-6 relative overflow-hidden group hover:scale-[1.02] transition-transform">
      <div className={cn("absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500", color, "w-32 h-32")}>
        {icon}
      </div>
      <div className="flex items-center gap-3 text-zinc-400 mb-4 position-relative z-10">
        <div className={cn("p-2 rounded-lg bg-zinc-900 border border-zinc-800", color)}>{icon}</div>
        <span className="text-xs font-bold uppercase tracking-widest">{title}</span>
      </div>
      <div className="text-3xl font-bold tracking-tight position-relative z-10">{value}</div>
    </div>
  );
}
