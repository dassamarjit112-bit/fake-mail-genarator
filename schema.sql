-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table to track Telegram profiles
create table if not exists public.users (
    id bigint primary key, -- Telegram User ID
    username text,
    created_at timestamp with time zone default now()
);

-- Inboxes table
create table if not exists public.inboxes (
    id uuid primary key default uuid_generate_v4(),
    user_id bigint references public.users(id) on delete cascade,
    email_address text unique not null,
    created_at timestamp with time zone default now()
);

-- Messages table
create table if not exists public.messages (
    id uuid primary key default uuid_generate_v4(),
    inbox_id uuid references public.inboxes(id) on delete cascade,
    sender text,
    subject text,
    body_html text,
    body_text text,
    timestamp timestamp with time zone default now(),
    created_at timestamp with time zone default now()
);

-- Indexes for performance
create index if not exists idx_inboxes_user_id_created on public.inboxes(user_id, created_at desc);
create index if not exists idx_inboxes_email_address on public.inboxes(email_address);
create index if not exists idx_messages_inbox_id on public.messages(inbox_id);
create index if not exists idx_users_username on public.users(username);

-- Sessions table for Grammy
create table if not exists public.sessions (
    id text primary key,
    session text
);

-- Enable Realtime for both tables
alter publication supabase_realtime add table inboxes;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table sessions;


