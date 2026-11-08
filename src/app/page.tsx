'use client';

import { useState, useEffect, useMemo } from 'react';
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
  Lock,
  Search,
  RefreshCw,
  Copy,
  Check,
  Eye,
  FileText
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface InboxItem {
  id: string;
  user_id: number;
  email_address: string;
  created_at: string;
  users?: {
    username?: string | null;
  } | null;
}

interface UserItem {
  id: number;
  username: string | null;
  created_at: string;
}

interface MessageItem {
  id: string;
  inbox_id: string;
  sender: string;
  subject: string;
  body_html?: string | null;
  body_text?: string | null;
  timestamp: string;
  created_at: string;
  inboxes?: {
    email_address?: string | null;
  } | null;
}

export default function Dashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({ inboxes: 0, messages: 0, users: 0 });
  const [inboxes, setInboxes] = useState<InboxItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Search states
  const [globalSearch, setGlobalSearch] = useState('');
  const [inboxSearch, setInboxSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');

  // Modals & inspect
  const [transferModal, setTransferModal] = useState<{ open: boolean; inboxId?: string; currentEmail?: string }>({ open: false });
  const [targetUsername, setTargetUsername] = useState('');
  const [passwordModal, setPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<MessageItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
          const { data: enrichedMsg } = await supabase
            .from('messages')
            .select('*, inboxes(email_address)')
            .eq('id', payload.new.id)
            .single();

          setMessages(prev => [enrichedMsg || (payload.new as MessageItem), ...prev].slice(0, 100));
          setStats(prev => ({ ...prev, messages: prev.messages + 1 }));
        })
        .subscribe();

      return () => {
        supabase.removeChannel(messagesSubscription);
      };
    }
  }

  async function fetchInitialData(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

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
        .select('*, inboxes(email_address)')
        .order('created_at', { ascending: false })
        .limit(100);

      const { data: userList } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      setStats({ inboxes: inboxCount || 0, messages: msgCount || 0, users: userCount || 0 });
      setInboxes((recentInboxes as InboxItem[]) || []);
      setMessages((recentMessages as MessageItem[]) || []);
      setUsers((userList as UserItem[]) || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
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

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Filtered lists
  const filteredInboxes = useMemo(() => {
    const qGlobal = globalSearch.toLowerCase().trim();
    const qSection = inboxSearch.toLowerCase().trim();

    return inboxes.filter((inbox) => {
      const email = (inbox.email_address || '').toLowerCase();
      const username = (inbox.users?.username || '').toLowerCase();
      const userId = String(inbox.user_id || '').toLowerCase();
      const id = String(inbox.id || '').toLowerCase();

      const matchesGlobal = !qGlobal || email.includes(qGlobal) || username.includes(qGlobal) || userId.includes(qGlobal) || id.includes(qGlobal);
      const matchesSection = !qSection || email.includes(qSection) || username.includes(qSection) || userId.includes(qSection) || id.includes(qSection);

      return matchesGlobal && matchesSection;
    });
  }, [inboxes, globalSearch, inboxSearch]);

  const filteredUsers = useMemo(() => {
    const qGlobal = globalSearch.toLowerCase().trim();
    const qSection = userSearch.toLowerCase().trim();

    return users.filter((user) => {
      const username = (user.username || '').toLowerCase();
      const userId = String(user.id || '').toLowerCase();

      const matchesGlobal = !qGlobal || username.includes(qGlobal) || userId.includes(qGlobal);
      const matchesSection = !qSection || username.includes(qSection) || userId.includes(qSection);

      return matchesGlobal && matchesSection;
    });
  }, [users, globalSearch, userSearch]);

  const filteredMessages = useMemo(() => {
    const qGlobal = globalSearch.toLowerCase().trim();
    const qSection = messageSearch.toLowerCase().trim();

    return messages.filter((message) => {
      const subject = (message.subject || '').toLowerCase();
      const sender = (message.sender || '').toLowerCase();
      const bodyText = (message.body_text || '').toLowerCase();
      const bodyHtml = (message.body_html || '').toLowerCase();
      const targetEmail = (message.inboxes?.email_address || '').toLowerCase();

      const matchesGlobal = !qGlobal || 
        subject.includes(qGlobal) || 
        sender.includes(qGlobal) || 
        bodyText.includes(qGlobal) || 
        bodyHtml.includes(qGlobal) ||
        targetEmail.includes(qGlobal);

      const matchesSection = !qSection || 
        subject.includes(qSection) || 
        sender.includes(qSection) || 
        bodyText.includes(qSection) || 
        bodyHtml.includes(qSection) ||
        targetEmail.includes(qSection);

      return matchesGlobal && matchesSection;
    });
  }, [messages, globalSearch, messageSearch]);

  const hasAnyFilter = Boolean(globalSearch || inboxSearch || userSearch || messageSearch);

  const clearAllFilters = () => {
    setGlobalSearch('');
    setInboxSearch('');
    setUserSearch('');
    setMessageSearch('');
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
      <div className="max-w-[1440px] mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800 pb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-500" />
              Fake Mail Controller
            </h1>
            <p className="text-zinc-500 mt-1">System Management, Inboxes & Realtime Logs</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchInitialData(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-50"
              title="Refresh all data"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin text-blue-400")} />
              <span>Refresh</span>
            </button>
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

        {/* Global Search Bar */}
        <div className="glass rounded-2xl p-4 md:p-5 border border-zinc-800/80 bg-zinc-950/40">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Global Search: search across inboxes, Telegram users, and messages simultaneously..."
                className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl pl-11 pr-10 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 rounded-md"
                  title="Clear global search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {hasAnyFilter && (
              <button
                onClick={clearAllFilters}
                className="px-4 py-3 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                Clear All Searches
              </button>
            )}
          </div>

          {globalSearch && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span className="text-zinc-500">Global matches for "{globalSearch}":</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                {filteredInboxes.length} inboxes
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                {filteredUsers.length} users
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                {filteredMessages.length} messages
              </span>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Total Users" value={stats.users} icon={<Users />} color="text-amber-400" />
          <StatCard title="Active Inboxes" value={stats.inboxes} icon={<Inbox />} color="text-blue-400" />
          <StatCard title="Messages" value={stats.messages} icon={<Mail />} color="text-indigo-400" />
        </div>

        {/* 3-Column Section Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* 1. Inboxes Control Center (lg:col-span-2) */}
          <section className="lg:col-span-2 glass rounded-2xl overflow-hidden flex flex-col h-[650px] border border-zinc-800">
            {/* Header & Section Search */}
            <div className="p-5 border-b border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-400" />
                  <h2 className="text-lg font-semibold tracking-wide">Inboxes Control Center</h2>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 font-mono">
                    {filteredInboxes.length} of {inboxes.length}
                  </span>
                </div>
              </div>

              {/* Inbox Dedicated Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                  placeholder="Search inboxes by email, username, or user ID..."
                  className="w-full bg-black/60 border border-zinc-800 rounded-lg pl-9 pr-9 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60 focus:border-blue-500/60 transition-all"
                />
                {inboxSearch && (
                  <button
                    onClick={() => setInboxSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"
                    title="Clear inbox search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Inboxes Table */}
            <div className="overflow-x-auto overflow-y-auto flex-1">
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-zinc-500 bg-black/60 sticky top-0 backdrop-blur-md z-10 border-b border-zinc-800">
                  <tr>
                    <th className="px-6 py-3 font-medium">Email / Owner</th>
                    <th className="px-6 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {filteredInboxes.map((inbox) => (
                    <tr key={inbox.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-blue-300 font-mono">{inbox.email_address}</span>
                          <button
                            onClick={() => copyToClipboard(inbox.email_address, inbox.id)}
                            className="text-zinc-500 hover:text-zinc-300 p-1"
                            title="Copy email address"
                          >
                            {copiedId === inbox.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-zinc-400" /> 
                            {inbox.users?.username ? `@${inbox.users.username}` : 'No Username'}
                          </span>
                          <span className="text-zinc-700">•</span>
                          <span className="text-zinc-500 font-mono">ID: {inbox.user_id}</span>
                          <span className="text-zinc-700">•</span>
                          <span className="text-zinc-500 text-[10px]">
                            {inbox.created_at ? formatDistanceToNow(new Date(inbox.created_at), { addSuffix: true }) : ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => setTransferModal({ open: true, inboxId: inbox.id, currentEmail: inbox.email_address })}
                            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-blue-400 transition-all border border-zinc-800"
                            title="Transfer ownership"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteInbox(inbox.id)}
                            className="p-2 rounded-lg bg-zinc-900 hover:bg-red-500/10 text-zinc-400 hover:text-red-500 transition-all border border-zinc-800"
                            title="Delete inbox"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  
                  {filteredInboxes.length === 0 && !loading && (
                    <tr>
                      <td colSpan={2} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2 text-zinc-500">
                          <Inbox className="w-8 h-8 opacity-40" />
                          <p className="text-sm font-medium">No inboxes found matching your search.</p>
                          {(inboxSearch || globalSearch) && (
                            <button
                              onClick={() => { setInboxSearch(''); setGlobalSearch(''); }}
                              className="text-xs text-blue-400 hover:underline pt-1"
                            >
                              Reset search filters
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 2. Active Telegram Users (lg:col-span-1) */}
          <section className="glass rounded-2xl overflow-hidden flex flex-col h-[650px] border border-zinc-800">
            {/* Header & User Search */}
            <div className="p-5 border-b border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg font-semibold tracking-wide">Telegram Users</h2>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 font-mono text-xs">
                  {filteredUsers.length} of {users.length}
                </span>
              </div>

              {/* User Dedicated Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search username or user ID..."
                  className="w-full bg-black/60 border border-zinc-800 rounded-lg pl-9 pr-9 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500/60 focus:border-amber-500/60 transition-all"
                />
                {userSearch && (
                  <button
                    onClick={() => setUserSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"
                    title="Clear user search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Users List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredUsers.map((user) => (
                <div 
                  key={user.id} 
                  className="group p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:bg-zinc-900/60 hover:border-zinc-700/60 transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-200 truncate">
                          {user.username ? `@${user.username}` : 'No username'}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono flex items-center gap-1.5">
                          <span>ID: {user.id}</span>
                          <button
                            onClick={() => copyToClipboard(String(user.id), `u-${user.id}`)}
                            className="text-zinc-600 hover:text-zinc-400 p-0.5"
                            title="Copy user ID"
                          >
                            {copiedId === `u-${user.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick filter inboxes by this user */}
                    <button
                      onClick={() => {
                        setInboxSearch(user.username || String(user.id));
                      }}
                      className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-300 font-medium transition-all shrink-0"
                      title="Filter inboxes belonging to this user"
                    >
                      Filter Inboxes
                    </button>
                  </div>
                </div>
              ))}

              {filteredUsers.length === 0 && !loading && (
                <div className="text-center text-zinc-500 py-12 space-y-2">
                  <Users className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="text-sm font-medium">No users found matching your search.</p>
                  {(userSearch || globalSearch) && (
                    <button
                      onClick={() => { setUserSearch(''); setGlobalSearch(''); }}
                      className="text-xs text-amber-400 hover:underline pt-1 block mx-auto"
                    >
                      Reset user search
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 3. Live Messages (lg:col-span-1) */}
          <section className="glass rounded-2xl overflow-hidden flex flex-col h-[650px] border border-zinc-800">
            {/* Header & Message Search */}
            <div className="p-5 border-b border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-lg font-semibold tracking-wide">Live Messages</h2>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 font-mono text-xs">
                  {filteredMessages.length} of {messages.length}
                </span>
              </div>

              {/* Message Dedicated Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  placeholder="Search sender, subject, body..."
                  className="w-full bg-black/60 border border-zinc-800 rounded-lg pl-9 pr-9 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60 focus:border-emerald-500/60 transition-all"
                />
                {messageSearch && (
                  <button
                    onClick={() => setMessageSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-0.5"
                    title="Clear message search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredMessages.map((message) => (
                <div 
                  key={message.id} 
                  onClick={() => setSelectedMessage(message)}
                  className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:bg-zinc-900/70 hover:border-emerald-500/30 cursor-pointer relative overflow-hidden group transition-all"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/50 group-hover:bg-emerald-400 transition-colors" />
                  
                  <div className="flex justify-between items-start gap-2 mb-1.5 pl-2">
                    <h3 className="text-xs font-semibold text-zinc-200 truncate group-hover:text-emerald-300 transition-colors">
                      {message.subject || '(No Subject)'}
                    </h3>
                    <span className="text-[10px] text-zinc-500 block shrink-0 font-mono">
                      {message.created_at ? formatDistanceToNow(new Date(message.created_at), { addSuffix: true }) : ''}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 truncate pl-2 flex items-center gap-1">
                    <span className="text-zinc-500">From:</span> {message.sender || 'Unknown Sender'}
                  </p>

                  {message.inboxes?.email_address && (
                    <p className="text-[10px] text-zinc-500 truncate pl-2 mt-0.5">
                      To: {message.inboxes.email_address}
                    </p>
                  )}

                  {message.body_text && (
                    <p className="text-[10px] text-zinc-500 line-clamp-2 pl-2 mt-1.5 italic font-sans opacity-80">
                      "{message.body_text.slice(0, 120)}"
                    </p>
                  )}

                  <div className="pl-2 mt-2 flex items-center justify-between text-[10px] text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                      <Eye className="w-3 h-3" /> Click to view full message
                    </span>
                  </div>
                </div>
              ))}

              {filteredMessages.length === 0 && !loading && (
                <div className="text-center text-zinc-500 py-12 space-y-2">
                  <Mail className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="text-sm font-medium">No messages found matching your search.</p>
                  {(messageSearch || globalSearch) && (
                    <button
                      onClick={() => { setMessageSearch(''); setGlobalSearch(''); }}
                      className="text-xs text-emerald-400 hover:underline pt-1 block mx-auto"
                    >
                      Reset message search
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

        </div>
      </div>

      {/* Message Viewer Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl glass rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-950/60">
              <div className="space-y-1 pr-6 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Message Viewer
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">
                    {selectedMessage.created_at ? format(new Date(selectedMessage.created_at), 'PPP pp') : ''}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-zinc-100 break-words mt-1">
                  {selectedMessage.subject || '(No Subject)'}
                </h2>
              </div>
              <button 
                onClick={() => setSelectedMessage(null)} 
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Metadata */}
            <div className="px-6 py-4 border-b border-zinc-800/60 bg-zinc-900/30 text-xs space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 w-16">Sender:</span>
                <span className="text-zinc-200 font-mono selection:bg-blue-500/30">{selectedMessage.sender}</span>
                <button
                  onClick={() => copyToClipboard(selectedMessage.sender, 'modal-sender')}
                  className="text-zinc-500 hover:text-zinc-300 p-0.5"
                  title="Copy sender"
                >
                  {copiedId === 'modal-sender' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              {selectedMessage.inboxes?.email_address && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500 w-16">Recipient:</span>
                  <span className="text-blue-300 font-mono selection:bg-blue-500/30">{selectedMessage.inboxes.email_address}</span>
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-zinc-500" />
                  Message Content
                </h4>
                <div className="bg-zinc-950/80 rounded-xl p-4 border border-zinc-800 text-sm font-sans text-zinc-300 leading-relaxed whitespace-pre-wrap selection:bg-blue-500/30">
                  {selectedMessage.body_text || selectedMessage.body_html || '(Empty message body)'}
                </div>
              </div>

              {selectedMessage.body_html && selectedMessage.body_text && (
                <details className="text-xs text-zinc-500 pt-2 border-t border-zinc-800/40">
                  <summary className="cursor-pointer hover:text-zinc-400 font-medium select-none">
                    View raw HTML source
                  </summary>
                  <pre className="mt-2 p-3 rounded-lg bg-black text-[11px] font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap border border-zinc-850">
                    {selectedMessage.body_html}
                  </pre>
                </details>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-950/60 flex justify-end">
              <button
                onClick={() => setSelectedMessage(null)}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
