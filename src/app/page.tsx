'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  FileText,
  ChevronLeft,
  ChevronRight,
  Code,
  Sparkles,
  ExternalLink,
  Filter
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
  } | Array<{ email_address?: string | null }> | null;
}

function getInboxEmail(inboxes: MessageItem['inboxes']): string | null {
  if (!inboxes) return null;
  if (Array.isArray(inboxes)) {
    return inboxes[0]?.email_address || null;
  }
  return inboxes.email_address || null;
}

export default function Dashboard() {
  const router = useRouter();

  // Global counts for all data (head queries)
  const [stats, setStats] = useState({ inboxes: 0, messages: 0, users: 0 });
  const [authLoading, setAuthLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search queries (Global & Section-Specific)
  const [globalSearch, setGlobalSearch] = useState('');
  const [debouncedGlobalSearch, setDebouncedGlobalSearch] = useState('');

  const [inboxSearch, setInboxSearch] = useState('');
  const [debouncedInboxSearch, setDebouncedInboxSearch] = useState('');

  const [userSearch, setUserSearch] = useState('');
  const [debouncedUserSearch, setDebouncedUserSearch] = useState('');

  const [messageSearch, setMessageSearch] = useState('');
  const [debouncedMessageSearch, setDebouncedMessageSearch] = useState('');

  // Inboxes Server-Side State
  const [inboxes, setInboxes] = useState<InboxItem[]>([]);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [inboxPage, setInboxPage] = useState(1);
  const [inboxPageSize, setInboxPageSize] = useState(25);
  const [inboxLoading, setInboxLoading] = useState(false);

  // Users Server-Side State
  const [users, setUsers] = useState<UserItem[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(25);
  const [userLoading, setUserLoading] = useState(false);

  // Messages Server-Side State
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messageTotal, setMessageTotal] = useState(0);
  const [messagePage, setMessagePage] = useState(1);
  const [messagePageSize, setMessagePageSize] = useState(25);
  const [messageLoading, setMessageLoading] = useState(false);

  // Message Viewer Modal State
  const [selectedMessage, setSelectedMessage] = useState<MessageItem | null>(null);
  const [loadingMessageDetails, setLoadingMessageDetails] = useState(false);
  const [messageViewTab, setMessageViewTab] = useState<'preview' | 'text' | 'raw'>('preview');

  // Other Modals & Utilities
  const [transferModal, setTransferModal] = useState<{ open: boolean; inboxId?: string; currentEmail?: string }>({ open: false });
  const [targetUsername, setTargetUsername] = useState('');
  const [passwordModal, setPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Debounce timers
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedGlobalSearch(globalSearch);
      setInboxPage(1);
      setUserPage(1);
      setMessagePage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [globalSearch]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedInboxSearch(inboxSearch);
      setInboxPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [inboxSearch]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedUserSearch(userSearch);
      setUserPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [userSearch]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedMessageSearch(messageSearch);
      setMessagePage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [messageSearch]);

  // Check auth on load
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
    } else {
      setAuthLoading(false);
      fetchGlobalCounts();

      // Realtime subscription for incoming messages
      const messagesSubscription = supabase
        .channel('realtime_messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
          setStats(prev => ({ ...prev, messages: prev.messages + 1 }));
          setMessageTotal(prev => prev + 1);

          // If on page 1 without search, prepend the new message
          if (messagePage === 1 && !debouncedMessageSearch && !debouncedGlobalSearch) {
            const { data: enrichedMsg } = await supabase
              .from('messages')
              .select('id, inbox_id, sender, subject, body_text, timestamp, created_at, inboxes(email_address)')
              .eq('id', payload.new.id)
              .single();

            setMessages(prev => [(enrichedMsg as unknown as MessageItem) || (payload.new as MessageItem), ...prev.slice(0, messagePageSize - 1)]);
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(messagesSubscription);
      };
    }
  }

  // Lightweight HEAD requests to get exact total database counts without downloading data
  const fetchGlobalCounts = async () => {
    try {
      const [inboxRes, msgRes, userRes] = await Promise.all([
        supabase.from('inboxes').select('*', { count: 'exact', head: true }),
        supabase.from('messages').select('*', { count: 'exact', head: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }),
      ]);

      setStats({
        inboxes: inboxRes.count || 0,
        messages: msgRes.count || 0,
        users: userRes.count || 0
      });
    } catch (err) {
      console.error('Error fetching global counts:', err);
    }
  };

  // 1. Fetch Inboxes (Server-side paginated & filtered directly in DB)
  const fetchInboxes = useCallback(async () => {
    setInboxLoading(true);
    try {
      const queryTerm = (debouncedInboxSearch || debouncedGlobalSearch).trim();
      const from = (inboxPage - 1) * inboxPageSize;
      const to = from + inboxPageSize - 1;

      let req = supabase
        .from('inboxes')
        .select('*, users(username)', { count: 'exact' });

      if (queryTerm) {
        const clean = queryTerm.replace(/[,()%"']/g, '').trim();
        const isNumeric = /^\d+$/.test(clean);

        if (isNumeric) {
          req = req.or(`email_address.ilike.%${clean}%,user_id.eq.${clean}`);
        } else {
          // Check if any username matches to include user_id in the search
          const { data: matchedUsers } = await supabase
            .from('users')
            .select('id')
            .ilike('username', `%${clean}%`)
            .limit(10);

          if (matchedUsers && matchedUsers.length > 0) {
            const ids = matchedUsers.map(u => u.id).join(',');
            req = req.or(`email_address.ilike.%${clean}%,user_id.in.(${ids})`);
          } else {
            req = req.ilike('email_address', `%${clean}%`);
          }
        }
      }

      const { data, count, error } = await req
        .order('created_at', { ascending: false })
        .range(from, to);

      if (!error && data) {
        setInboxes(data as unknown as InboxItem[]);
        if (count !== null) setInboxTotal(count);
      }
    } catch (err) {
      console.error('Error fetching inboxes:', err);
    } finally {
      setInboxLoading(false);
    }
  }, [inboxPage, inboxPageSize, debouncedInboxSearch, debouncedGlobalSearch]);

  // 2. Fetch Users (Server-side paginated & filtered directly in DB)
  const fetchUsers = useCallback(async () => {
    setUserLoading(true);
    try {
      const queryTerm = (debouncedUserSearch || debouncedGlobalSearch).trim();
      const from = (userPage - 1) * userPageSize;
      const to = from + userPageSize - 1;

      let req = supabase
        .from('users')
        .select('*', { count: 'exact' });

      if (queryTerm) {
        const clean = queryTerm.replace(/[,()%"']/g, '').trim();
        const isNumeric = /^\d+$/.test(clean);
        if (isNumeric) {
          req = req.or(`username.ilike.%${clean}%,id.eq.${clean}`);
        } else {
          req = req.ilike('username', `%${clean}%`);
        }
      }

      const { data, count, error } = await req
        .order('created_at', { ascending: false })
        .range(from, to);

      if (!error && data) {
        setUsers(data as UserItem[]);
        if (count !== null) setUserTotal(count);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setUserLoading(false);
    }
  }, [userPage, userPageSize, debouncedUserSearch, debouncedGlobalSearch]);

  // 3. Fetch Messages (Server-side paginated & filtered directly in DB)
  const fetchMessages = useCallback(async () => {
    setMessageLoading(true);
    try {
      const queryTerm = (debouncedMessageSearch || debouncedGlobalSearch).trim();
      const from = (messagePage - 1) * messagePageSize;
      const to = from + messagePageSize - 1;

      // Select summary fields only for fast bandwidth & low quota usage
      let req = supabase
        .from('messages')
        .select('id, inbox_id, sender, subject, body_text, timestamp, created_at, inboxes(email_address)', { count: 'exact' });

      if (queryTerm) {
        const clean = queryTerm.replace(/[,()%"']/g, '').trim();
        req = req.or(`subject.ilike.%${clean}%,sender.ilike.%${clean}%,body_text.ilike.%${clean}%`);
      }

      const { data, count, error } = await req
        .order('created_at', { ascending: false })
        .range(from, to);

      if (!error && data) {
        setMessages(data as unknown as MessageItem[]);
        if (count !== null) setMessageTotal(count);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setMessageLoading(false);
    }
  }, [messagePage, messagePageSize, debouncedMessageSearch, debouncedGlobalSearch]);

  // Trigger loads when dependencies update
  useEffect(() => {
    if (!authLoading) fetchInboxes();
  }, [fetchInboxes, authLoading]);

  useEffect(() => {
    if (!authLoading) fetchUsers();
  }, [fetchUsers, authLoading]);

  useEffect(() => {
    if (!authLoading) fetchMessages();
  }, [fetchMessages, authLoading]);

  // Refresh all sections
  const handleRefreshAll = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchGlobalCounts(),
      fetchInboxes(),
      fetchUsers(),
      fetchMessages(),
    ]);
    setRefreshing(false);
  };

  // Tap on a message -> Open Full Message Viewer Modal & load full body
  const handleOpenMessage = async (msg: MessageItem) => {
    setSelectedMessage(msg);
    setMessageViewTab('preview');
    setLoadingMessageDetails(true);

    try {
      // Fetch full message with complete HTML & Text content
      const { data, error } = await supabase
        .from('messages')
        .select('*, inboxes(email_address)')
        .eq('id', msg.id)
        .single();

      if (!error && data) {
        setSelectedMessage(data as unknown as MessageItem);
        if (data.body_html) {
          setMessageViewTab('preview');
        } else {
          setMessageViewTab('text');
        }
      }
    } catch (err) {
      console.error('Error loading full message:', err);
    } finally {
      setLoadingMessageDetails(false);
    }
  };

  // Inbox deletion
  const deleteInbox = async (id: string) => {
    if (!confirm('Are you sure you want to delete this inbox and all its messages?')) return;
    const { error } = await supabase.from('inboxes').delete().eq('id', id);
    if (!error) {
      fetchGlobalCounts();
      fetchInboxes();
      fetchMessages();
    }
  };

  // Inbox transfer
  const handleTransfer = async () => {
    if (!targetUsername || !transferModal.inboxId) return;

    const { data: targetUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .ilike('username', targetUsername.trim())
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
      fetchInboxes();
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

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const clearAllFilters = () => {
    setGlobalSearch('');
    setInboxSearch('');
    setUserSearch('');
    setMessageSearch('');
    setInboxPage(1);
    setUserPage(1);
    setMessagePage(1);
  };

  const hasAnyFilter = Boolean(globalSearch || inboxSearch || userSearch || messageSearch);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-3 sm:p-5 md:p-8">
      <div className="max-w-[1480px] mx-auto space-y-6 sm:space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800 pb-6 sm:pb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent flex items-center gap-3">
              <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-blue-500 shrink-0" />
              Fake Mail Controller
            </h1>
            <p className="text-zinc-500 text-xs sm:text-sm mt-1">
              Smart Database Search & Unlimited Scale Architecture (Free Quota Optimized)
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              onClick={handleRefreshAll}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all disabled:opacity-50"
              title="Refresh all data & counts"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin text-blue-400")} />
              <span>Refresh</span>
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-medium text-emerald-400">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Sync
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

        {/* Global Smart Search Bar */}
        <div className="glass rounded-2xl p-4 sm:p-5 border border-zinc-800/80 bg-zinc-950/60 shadow-xl">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-zinc-500 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Smart Search: query across lakhs of inboxes, Telegram users, and messages directly in database..."
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
                className="px-4 py-3 text-xs font-semibold rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
                Clear All Searches
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-zinc-500 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Smart Mode:
              </span>
              {globalSearch ? (
                <>
                  <span className="text-zinc-400">Database matches for "{globalSearch}":</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono font-medium">
                    {inboxTotal.toLocaleString()} inboxes
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono font-medium">
                    {userTotal.toLocaleString()} users
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium">
                    {messageTotal.toLocaleString()} messages
                  </span>
                </>
              ) : (
                <span className="text-zinc-500">
                  Searches entire database of lakhs of records on demand without exhausting bandwidth limits.
                </span>
              )}
            </div>
            {(inboxLoading || userLoading || messageLoading) && (
              <div className="flex items-center gap-1.5 text-blue-400 font-mono text-[11px]">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Querying database...
              </div>
            )}
          </div>
        </div>

        {/* Global Stats Grid (Shows exact counts even with lakhs of records) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          <StatCard 
            title="Total Users" 
            value={stats.users.toLocaleString()} 
            subtext="Registered Telegram Profiles"
            icon={<Users className="w-6 h-6" />} 
            color="text-amber-400" 
          />
          <StatCard 
            title="Active Inboxes" 
            value={stats.inboxes.toLocaleString()} 
            subtext="Unique Email Addresses in DB"
            icon={<Inbox className="w-6 h-6" />} 
            color="text-blue-400" 
          />
          <StatCard 
            title="Total Messages" 
            value={stats.messages.toLocaleString()} 
            subtext="Delivered & Logged Emails"
            icon={<Mail className="w-6 h-6" />} 
            color="text-indigo-400" 
          />
        </div>

        {/* 3-Column Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 sm:gap-8">
          
          {/* ================= 1. INBOXES CONTROL CENTER (lg:col-span-2) ================= */}
          <section className="lg:col-span-2 glass rounded-2xl overflow-hidden flex flex-col h-[700px] border border-zinc-800 bg-zinc-950/40">
            {/* Header & Inbox Search */}
            <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/40 space-y-3 shrink-0">
              <div className="flex justify-between items-center gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Shield className="w-5 h-5 text-blue-400 shrink-0" />
                  <h2 className="text-base sm:text-lg font-semibold tracking-wide truncate">Inboxes Control Center</h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 font-mono text-xs">
                    {inboxTotal.toLocaleString()} {inboxTotal === 1 ? 'inbox' : 'inboxes'}
                  </span>
                </div>
              </div>

              {/* Dedicated Search Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                  placeholder="Search all inboxes by email, username, or user ID..."
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
            <div className="overflow-x-auto overflow-y-auto flex-1 relative">
              {inboxLoading && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-20">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 shadow-xl">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    <span>Loading inboxes...</span>
                  </div>
                </div>
              )}
              <table className="w-full text-left">
                <thead className="text-xs uppercase text-zinc-500 bg-black/70 sticky top-0 backdrop-blur-md z-10 border-b border-zinc-800">
                  <tr>
                    <th className="px-5 py-3 font-medium">Email / Owner</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {inboxes.map((inbox) => (
                    <tr key={inbox.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-blue-300 font-mono select-all">
                            {inbox.email_address}
                          </span>
                          <button
                            onClick={() => copyToClipboard(inbox.email_address, inbox.id)}
                            className="text-zinc-500 hover:text-zinc-300 p-1"
                            title="Copy email address"
                          >
                            {copiedKey === inbox.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1 text-zinc-400">
                            <User className="w-3 h-3 text-zinc-500" /> 
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
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                          <button 
                            onClick={() => {
                              setMessageSearch(inbox.email_address);
                              setGlobalSearch('');
                            }}
                            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 transition-all border border-zinc-800"
                            title="Filter messages for this email"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => setTransferModal({ open: true, inboxId: inbox.id, currentEmail: inbox.email_address })}
                            className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-blue-400 transition-all border border-zinc-800"
                            title="Transfer ownership"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => deleteInbox(inbox.id)}
                            className="p-2 rounded-lg bg-zinc-900 hover:bg-red-500/10 text-zinc-400 hover:text-red-500 transition-all border border-zinc-800"
                            title="Delete inbox"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  
                  {inboxes.length === 0 && !inboxLoading && (
                    <tr>
                      <td colSpan={2} className="px-6 py-16 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2 text-zinc-500">
                          <Inbox className="w-8 h-8 opacity-40" />
                          <p className="text-sm font-medium">No inboxes found matching database query.</p>
                          {(inboxSearch || globalSearch) && (
                            <button
                              onClick={() => { setInboxSearch(''); setGlobalSearch(''); }}
                              className="text-xs text-blue-400 hover:underline pt-1"
                            >
                              Reset inbox search
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between gap-3 text-xs text-zinc-400 shrink-0">
              <div className="flex items-center gap-2">
                <span>
                  Showing {inboxTotal === 0 ? 0 : (inboxPage - 1) * inboxPageSize + 1}–{Math.min(inboxPage * inboxPageSize, inboxTotal)} of {inboxTotal.toLocaleString()}
                </span>
                <select
                  value={inboxPageSize}
                  onChange={(e) => {
                    setInboxPageSize(Number(e.target.value));
                    setInboxPage(1);
                  }}
                  className="bg-black border border-zinc-800 rounded px-1.5 py-0.5 text-zinc-300 text-[11px] focus:outline-none"
                >
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setInboxPage(prev => Math.max(prev - 1, 1))}
                  disabled={inboxPage <= 1 || inboxLoading}
                  className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-40 disabled:hover:text-zinc-400 transition-colors"
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono text-zinc-300 px-1 text-[11px]">
                  Page {inboxPage} of {Math.max(1, Math.ceil(inboxTotal / inboxPageSize))}
                </span>
                <button
                  onClick={() => setInboxPage(prev => prev + 1)}
                  disabled={inboxPage * inboxPageSize >= inboxTotal || inboxLoading}
                  className="p-1.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-40 disabled:hover:text-zinc-400 transition-colors"
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>

          {/* ================= 2. ACTIVE TELEGRAM USERS (lg:col-span-1) ================= */}
          <section className="glass rounded-2xl overflow-hidden flex flex-col h-[700px] border border-zinc-800 bg-zinc-950/40">
            {/* Header & User Search */}
            <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/40 space-y-3 shrink-0">
              <div className="flex justify-between items-center gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Users className="w-5 h-5 text-amber-400 shrink-0" />
                  <h2 className="text-base sm:text-lg font-semibold tracking-wide truncate">Telegram Users</h2>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 font-mono text-xs shrink-0">
                  {userTotal.toLocaleString()}
                </span>
              </div>

              {/* Dedicated User Search */}
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
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 relative">
              {userLoading && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-20">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 shadow-xl">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Loading users...</span>
                  </div>
                </div>
              )}

              {users.map((user) => (
                <div 
                  key={user.id} 
                  className="group p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:bg-zinc-900/60 hover:border-zinc-700/60 transition-all"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
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
                            {copiedKey === `u-${user.id}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setInboxSearch(user.username || String(user.id));
                        setGlobalSearch('');
                      }}
                      className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-300 font-medium transition-all shrink-0"
                      title="Filter inboxes belonging to this user"
                    >
                      Inboxes
                    </button>
                  </div>
                </div>
              ))}

              {users.length === 0 && !userLoading && (
                <div className="text-center text-zinc-500 py-16 space-y-2">
                  <Users className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="text-sm font-medium">No users found.</p>
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

            {/* Pagination Controls */}
            <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400 shrink-0">
              <span className="text-[11px]">
                {userTotal === 0 ? 0 : (userPage - 1) * userPageSize + 1}–{Math.min(userPage * userPageSize, userTotal)} of {userTotal.toLocaleString()}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setUserPage(prev => Math.max(prev - 1, 1))}
                  disabled={userPage <= 1 || userLoading}
                  className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-40 transition-colors"
                  title="Previous"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-zinc-300 text-[11px]">
                  {userPage} / {Math.max(1, Math.ceil(userTotal / userPageSize))}
                </span>
                <button
                  onClick={() => setUserPage(prev => prev + 1)}
                  disabled={userPage * userPageSize >= userTotal || userLoading}
                  className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-40 transition-colors"
                  title="Next"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </section>

          {/* ================= 3. LIVE MESSAGES & FULL SEARCH (lg:col-span-1) ================= */}
          <section className="glass rounded-2xl overflow-hidden flex flex-col h-[700px] border border-zinc-800 bg-zinc-950/40">
            {/* Header & Message Search */}
            <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/40 space-y-3 shrink-0">
              <div className="flex justify-between items-center gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Activity className="w-5 h-5 text-emerald-400 shrink-0" />
                  <h2 className="text-base sm:text-lg font-semibold tracking-wide truncate">Live Messages</h2>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 font-mono text-xs shrink-0">
                  {messageTotal.toLocaleString()}
                </span>
              </div>

              {/* Dedicated Message Search */}
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  placeholder="Search subject, sender, body..."
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
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 relative">
              {messageLoading && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-20">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 shadow-xl">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>Searching messages...</span>
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div 
                  key={message.id} 
                  onClick={() => handleOpenMessage(message)}
                  className="p-3.5 rounded-xl bg-zinc-900/30 border border-zinc-800/60 hover:bg-zinc-900/80 hover:border-emerald-500/40 active:scale-[0.99] cursor-pointer relative overflow-hidden group transition-all"
                  title="Tap to view full message"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/50 group-hover:bg-emerald-400 transition-colors" />
                  
                  <div className="flex justify-between items-start gap-2 mb-1 pl-2">
                    <h3 className="text-xs font-semibold text-zinc-100 truncate group-hover:text-emerald-300 transition-colors">
                      {message.subject || '(No Subject)'}
                    </h3>
                    <span className="text-[10px] text-zinc-500 block shrink-0 font-mono">
                      {message.created_at ? formatDistanceToNow(new Date(message.created_at), { addSuffix: true }) : ''}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 truncate pl-2">
                    <span className="text-zinc-500">From:</span> {message.sender || 'Unknown Sender'}
                  </p>

                  {getInboxEmail(message.inboxes) && (
                    <p className="text-[10px] text-blue-400/80 truncate pl-2 mt-0.5 font-mono">
                      To: {getInboxEmail(message.inboxes)}
                    </p>
                  )}

                  {message.body_text && (
                    <p className="text-[10px] text-zinc-500 line-clamp-2 pl-2 mt-1.5 font-sans">
                      {message.body_text}
                    </p>
                  )}

                  <div className="pl-2 mt-2 flex items-center text-[10px] text-emerald-400 font-medium opacity-90 group-hover:opacity-100 transition-opacity">
                    <Eye className="w-3 h-3 mr-1" /> Tap to view full email
                  </div>
                </div>
              ))}

              {messages.length === 0 && !messageLoading && (
                <div className="text-center text-zinc-500 py-16 space-y-2">
                  <Mail className="w-8 h-8 opacity-40 mx-auto" />
                  <p className="text-sm font-medium">No messages found.</p>
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

            {/* Pagination Controls */}
            <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs text-zinc-400 shrink-0">
              <span className="text-[11px]">
                {messageTotal === 0 ? 0 : (messagePage - 1) * messagePageSize + 1}–{Math.min(messagePage * messagePageSize, messageTotal)} of {messageTotal.toLocaleString()}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setMessagePage(prev => Math.max(prev - 1, 1))}
                  disabled={messagePage <= 1 || messageLoading}
                  className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-40 transition-colors"
                  title="Previous"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-zinc-300 text-[11px]">
                  {messagePage} / {Math.max(1, Math.ceil(messageTotal / messagePageSize))}
                </span>
                <button
                  onClick={() => setMessagePage(prev => prev + 1)}
                  disabled={messagePage * messagePageSize >= messageTotal || messageLoading}
                  className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white disabled:opacity-40 transition-colors"
                  title="Next"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </section>

        </div>
      </div>

      {/* ================= FULL MESSAGE VIEWER MODAL (When tapping on any message) ================= */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-4xl glass rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] bg-zinc-950 animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-zinc-800 flex justify-between items-start bg-zinc-900/40 shrink-0">
              <div className="space-y-1.5 pr-4 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Full Email Viewer
                  </span>
                  {selectedMessage.created_at && (
                    <span className="text-xs text-zinc-400 flex items-center gap-1 font-mono">
                      {format(new Date(selectedMessage.created_at), 'PPP p')}
                      <span className="text-zinc-600">({formatDistanceToNow(new Date(selectedMessage.created_at), { addSuffix: true })})</span>
                    </span>
                  )}
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-white break-words">
                  {selectedMessage.subject || '(No Subject)'}
                </h2>
              </div>
              <button 
                onClick={() => setSelectedMessage(null)} 
                className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0"
                title="Close viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Email Metadata Card */}
            <div className="px-4 sm:px-6 py-3.5 border-b border-zinc-800 bg-zinc-900/20 text-xs space-y-2 shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-zinc-500 w-14 font-medium">From:</span>
                <span className="text-zinc-200 font-mono select-all bg-zinc-900/60 px-2 py-0.5 rounded border border-zinc-800">
                  {selectedMessage.sender}
                </span>
                <button
                  onClick={() => copyToClipboard(selectedMessage.sender, 'm-sender')}
                  className="text-zinc-400 hover:text-white p-1"
                  title="Copy sender"
                >
                  {copiedKey === 'm-sender' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {getInboxEmail(selectedMessage.inboxes) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-zinc-500 w-14 font-medium">To:</span>
                  <span className="text-blue-300 font-mono select-all bg-blue-950/30 px-2 py-0.5 rounded border border-blue-900/40">
                    {getInboxEmail(selectedMessage.inboxes)}
                  </span>
                  <button
                    onClick={() => copyToClipboard(getInboxEmail(selectedMessage.inboxes) || '', 'm-recipient')}
                    className="text-zinc-400 hover:text-white p-1"
                    title="Copy recipient"
                  >
                    {copiedKey === 'm-recipient' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>

            {/* View Mode Switcher Tabs */}
            <div className="px-4 sm:px-6 py-2.5 border-b border-zinc-800/80 bg-zinc-900/30 flex items-center justify-between gap-3 shrink-0 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setMessageViewTab('preview')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                    messageViewTab === 'preview' 
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow" 
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Formatted Email
                </button>
                <button
                  onClick={() => setMessageViewTab('text')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                    messageViewTab === 'text' 
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow" 
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                  )}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Plain Text
                </button>
                <button
                  onClick={() => setMessageViewTab('raw')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5",
                    messageViewTab === 'raw' 
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow" 
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
                  )}
                >
                  <Code className="w-3.5 h-3.5" />
                  HTML Source
                </button>
              </div>

              {loadingMessageDetails && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                  <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                  Fetching full message...
                </div>
              )}
            </div>

            {/* Email Body Content Container */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-black/60">
              {messageViewTab === 'preview' && (
                <div>
                  {selectedMessage.body_html ? (
                    <div className="rounded-xl overflow-hidden border border-zinc-800 shadow-xl bg-white">
                      <iframe
                        srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 24px;
      margin: 0;
      color: #18181b;
      background-color: #ffffff;
      line-height: 1.6;
      word-break: break-word;
    }
    img { max-width: 100%; height: auto; }
    a { color: #2563eb; }
    pre, code { background: #f4f4f5; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  ${selectedMessage.body_html}
</body>
</html>`}
                        title="Formatted Email Preview"
                        sandbox="allow-popups allow-popups-to-escape-sandbox"
                        className="w-full h-[480px] bg-white border-0"
                      />
                    </div>
                  ) : (
                    <div className="bg-zinc-950 rounded-xl p-5 border border-zinc-800 text-sm font-sans text-zinc-300 leading-relaxed whitespace-pre-wrap select-all">
                      {selectedMessage.body_text || '(No content in this email)'}
                    </div>
                  )}
                </div>
              )}

              {messageViewTab === 'text' && (
                <div className="relative">
                  <div className="bg-zinc-950 rounded-xl p-5 border border-zinc-800 text-sm font-mono text-zinc-200 leading-relaxed whitespace-pre-wrap select-all">
                    {selectedMessage.body_text || selectedMessage.body_html || '(No plain text content)'}
                  </div>
                  <button
                    onClick={() => copyToClipboard(selectedMessage.body_text || selectedMessage.body_html || '', 'm-body')}
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 shadow"
                  >
                    {copiedKey === 'm-body' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy Text
                  </button>
                </div>
              )}

              {messageViewTab === 'raw' && (
                <div className="relative">
                  <pre className="bg-black rounded-xl p-5 border border-zinc-850 text-xs font-mono text-emerald-400/90 leading-relaxed overflow-x-auto whitespace-pre-wrap select-all max-h-[500px]">
                    {selectedMessage.body_html || selectedMessage.body_text || '(No raw HTML available)'}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(selectedMessage.body_html || selectedMessage.body_text || '', 'm-raw')}
                    className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 shadow"
                  >
                    {copiedKey === 'm-raw' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy Source
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-3 shrink-0 flex-wrap">
              <div className="flex items-center gap-2">
                {getInboxEmail(selectedMessage.inboxes) && (
                  <button
                    onClick={() => {
                      const email = getInboxEmail(selectedMessage.inboxes) || '';
                      setSelectedMessage(null);
                      setMessageSearch(email);
                    }}
                    className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-medium text-zinc-300 hover:text-white border border-zinc-800 transition-colors flex items-center gap-1.5"
                  >
                    <Filter className="w-3.5 h-3.5 text-blue-400" />
                    Filter all messages to this inbox
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedMessage(null)}
                className="px-6 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= TRANSFER MODAL ================= */}
      {transferModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass rounded-2xl p-6 sm:p-8 border border-zinc-800 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Transfer Email</h2>
              <button onClick={() => setTransferModal({ open: false })} className="text-zinc-500 hover:text-white"><X /></button>
            </div>
            <p className="text-sm text-zinc-400 mb-6">
              Transferring <span className="text-blue-400 font-mono font-medium">"{transferModal.currentEmail}"</span> to a new Telegram owner.
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

      {/* ================= CHANGE PASSWORD MODAL ================= */}
      {passwordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass rounded-2xl p-6 sm:p-8 border border-zinc-800 animate-in fade-in zoom-in duration-200">
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

function StatCard({ title, value, subtext, icon, color }: { title: string; value: string | number; subtext?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="glass rounded-2xl p-5 sm:p-6 relative overflow-hidden group hover:scale-[1.01] transition-transform border border-zinc-800 bg-zinc-950/40">
      <div className={cn("absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500", color, "w-28 h-28")}>
        {icon}
      </div>
      <div className="flex items-center gap-3 text-zinc-400 mb-3 relative z-10">
        <div className={cn("p-2 rounded-lg bg-zinc-900 border border-zinc-800", color)}>{icon}</div>
        <span className="text-xs font-bold uppercase tracking-widest">{title}</span>
      </div>
      <div className="text-2xl sm:text-3xl font-bold tracking-tight relative z-10 text-white font-mono">{value}</div>
      {subtext && <p className="text-[11px] text-zinc-500 mt-1 relative z-10">{subtext}</p>}
    </div>
  );
}
