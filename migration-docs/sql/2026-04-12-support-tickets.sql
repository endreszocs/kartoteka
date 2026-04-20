-- Segítség és támogatás rendszer
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid,
  user_id uuid NOT NULL,
  user_name text,
  user_email text,
  type text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal',
  subject text NOT NULL,
  description text,
  screenshot_url text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  admin_notes text,
  CONSTRAINT support_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT support_tickets_type_check CHECK (type IN ('bug', 'feature', 'question', 'quality_notice', 'general')),
  CONSTRAINT support_tickets_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT support_tickets_status_check CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'))
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON public.support_tickets (user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_user_access ON public.support_tickets
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY support_tickets_admin_access ON public.support_tickets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'esperes', 'egyhazmegyei_admin')
    )
  );
