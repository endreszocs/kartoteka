-- Dokumentum beküldési és jóváhagyási workflow tábla.
-- Az egyházmegye és kerület közötti hivatalos dokumentumkezelést kezeli.

CREATE TABLE IF NOT EXISTS public.document_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  diocese_id uuid,
  year integer NOT NULL,
  document_type text NOT NULL,  -- 'szamadas', 'koltsegvetes', 'koltsegvetes_modositas', 'vagyonleltar', 'valasztok_nevjegyzeke'
  modification_number integer,  -- null vagy 1-3 (költségvetés módosítás sorszáma)
  status text NOT NULL DEFAULT 'submitted',  -- 'submitted', 'received', 'reviewed', 'finalized'
  submitted_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  received_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  finalized_at timestamptz,
  finalized_by uuid,
  forwarded_to_kerulet boolean NOT NULL DEFAULT false,
  forwarded_at timestamptz,
  snapshot_data jsonb NOT NULL DEFAULT '{}',  -- a dokumentum fagyasztott pillanatképe
  notes text,
  CONSTRAINT document_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT document_submissions_unique UNIQUE (congregation_id, year, document_type, modification_number)
);

-- Indexek
CREATE INDEX IF NOT EXISTS document_submissions_diocese_year_idx
  ON public.document_submissions (diocese_id, year);
CREATE INDEX IF NOT EXISTS document_submissions_status_idx
  ON public.document_submissions (status);

-- RLS
ALTER TABLE public.document_submissions ENABLE ROW LEVEL SECURITY;

-- Gyülekezet látja és beküldheti a sajátját
CREATE POLICY document_submissions_congregation_access
  ON public.document_submissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.congregation_id = document_submissions.congregation_id
    )
  );

-- Esperes/egyházmegyei admin: saját egyházmegye dokumentumai
CREATE POLICY document_submissions_diocese_access
  ON public.document_submissions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.status = 'active'
        AND p.role IN ('esperes', 'egyhazmegyei_admin', 'admin')
        AND (p.diocese_id = document_submissions.diocese_id OR p.role = 'admin')
    )
  );
