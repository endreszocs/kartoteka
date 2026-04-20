-- Presbiteri jegyzőkönyvek modul
-- Az Erdélyi Református Egyházkerület Kánon I. Rész 39.§ értelmében

CREATE TABLE IF NOT EXISTS public.presbiteri_jegyzokonyvek (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  congregation_id uuid NOT NULL,
  tipus text NOT NULL DEFAULT 'presbiteri', -- 'presbiteri' vagy 'kozgyulesi'
  ev integer NOT NULL,
  ules_sorszam integer NOT NULL,
  datum date NOT NULL,
  hely text,
  kezdes text,
  zaras text,
  hatarozatkepesseg boolean DEFAULT true,
  elnok_neve text,
  jegyzo_neve text,
  hitelesito1 text,
  hitelesito2 text,
  allapot text NOT NULL DEFAULT 'draft',
  megjegyzes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presbiteri_jegyzokonyvek_pkey PRIMARY KEY (id),
  CONSTRAINT presbiteri_jegyzokonyvek_unique UNIQUE (congregation_id, ev, ules_sorszam)
);

CREATE TABLE IF NOT EXISTS public.jegyzokonyv_resztvevok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  jegyzokonyv_id uuid NOT NULL REFERENCES public.presbiteri_jegyzokonyvek(id) ON DELETE CASCADE,
  nev text NOT NULL,
  statusz text NOT NULL DEFAULT 'jelen',
  szerep text,
  CONSTRAINT jegyzokonyv_resztvevok_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.jegyzokonyv_napirendi_pontok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  jegyzokonyv_id uuid NOT NULL REFERENCES public.presbiteri_jegyzokonyvek(id) ON DELETE CASCADE,
  sorszam integer NOT NULL,
  cim text NOT NULL,
  eloado text,
  targyalas text,
  szavazas_igen integer DEFAULT 0,
  szavazas_nem integer DEFAULT 0,
  szavazas_tartozkodo integer DEFAULT 0,
  CONSTRAINT jegyzokonyv_napirendi_pontok_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.jegyzokonyv_hatarozatok (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  jegyzokonyv_id uuid NOT NULL REFERENCES public.presbiteri_jegyzokonyvek(id) ON DELETE CASCADE,
  napirendi_pont_id uuid REFERENCES public.jegyzokonyv_napirendi_pontok(id) ON DELETE SET NULL,
  sorszam integer NOT NULL,
  ev integer NOT NULL,
  szoveg text NOT NULL,
  felelos text,
  hatarido date,
  allapot text DEFAULT 'elfogadva',
  CONSTRAINT jegyzokonyv_hatarozatok_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.presbiteri_jegyzokonyvek ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jegyzokonyv_resztvevok ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jegyzokonyv_napirendi_pontok ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jegyzokonyv_hatarozatok ENABLE ROW LEVEL SECURITY;

CREATE POLICY jk_congregation_access ON public.presbiteri_jegyzokonyvek
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active' AND p.congregation_id = congregation_id));

CREATE POLICY jk_resztvevok_access ON public.jegyzokonyv_resztvevok
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.presbiteri_jegyzokonyvek j JOIN public.profiles p ON p.id = auth.uid() WHERE j.id = jegyzokonyv_id AND p.congregation_id = j.congregation_id AND p.status = 'active'));

CREATE POLICY jk_napirendi_access ON public.jegyzokonyv_napirendi_pontok
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.presbiteri_jegyzokonyvek j JOIN public.profiles p ON p.id = auth.uid() WHERE j.id = jegyzokonyv_id AND p.congregation_id = j.congregation_id AND p.status = 'active'));

CREATE POLICY jk_hatarozatok_access ON public.jegyzokonyv_hatarozatok
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.presbiteri_jegyzokonyvek j JOIN public.profiles p ON p.id = auth.uid() WHERE j.id = jegyzokonyv_id AND p.congregation_id = j.congregation_id AND p.status = 'active'));
