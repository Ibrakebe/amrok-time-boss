CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  position text NOT NULL DEFAULT 'Employé',
  pin_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage employees" ON public.employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  clock_in timestamptz NOT NULL DEFAULT now(),
  clock_out timestamptz
);
CREATE INDEX time_entries_employee_idx ON public.time_entries (employee_id, clock_in DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage entries" ON public.time_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Pointage par PIN (aucune donnée exposée, PIN jamais lisible)
CREATE OR REPLACE FUNCTION public.punch_pin(p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE emp record; open_entry record; res jsonb;
BEGIN
  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  SELECT id, full_name INTO emp FROM public.employees
    WHERE is_active AND pin_hash = extensions.crypt(p_pin, pin_hash) LIMIT 1;
  IF emp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  SELECT id, clock_in INTO open_entry FROM public.time_entries
    WHERE employee_id = emp.id AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1;
  IF open_entry.id IS NOT NULL THEN
    UPDATE public.time_entries SET clock_out = now() WHERE id = open_entry.id;
    res := jsonb_build_object('ok', true, 'action', 'out', 'name', emp.full_name,
      'at', now(), 'since', open_entry.clock_in);
  ELSE
    INSERT INTO public.time_entries (employee_id) VALUES (emp.id);
    res := jsonb_build_object('ok', true, 'action', 'in', 'name', emp.full_name, 'at', now());
  END IF;
  RETURN res;
END; $$;
REVOKE ALL ON FUNCTION public.punch_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.punch_pin(text) TO anon, authenticated, service_role;

-- Création / mise à jour d'un employé par la direction
CREATE OR REPLACE FUNCTION public.admin_save_employee(
  p_id uuid, p_name text, p_position text, p_pin text, p_active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL THEN
    IF p_pin IS NULL OR length(p_pin) < 4 THEN RAISE EXCEPTION 'pin_required'; END IF;
    INSERT INTO public.employees (full_name, position, pin_hash, is_active)
    VALUES (p_name, coalesce(nullif(p_position,''),'Employé'),
            extensions.crypt(p_pin, extensions.gen_salt('bf')), coalesce(p_active, true))
    RETURNING id INTO new_id;
    RETURN new_id;
  END IF;
  UPDATE public.employees SET
    full_name = coalesce(nullif(p_name,''), full_name),
    position = coalesce(nullif(p_position,''), position),
    is_active = coalesce(p_active, is_active),
    pin_hash = CASE WHEN p_pin IS NOT NULL AND length(p_pin) >= 4
                    THEN extensions.crypt(p_pin, extensions.gen_salt('bf')) ELSE pin_hash END
  WHERE id = p_id;
  RETURN p_id;
END; $$;
REVOKE ALL ON FUNCTION public.admin_save_employee(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_employee(uuid, text, text, text, boolean) TO authenticated, service_role;

-- Le premier compte inscrit devient direction
CREATE OR REPLACE FUNCTION public.claim_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN public.has_role(auth.uid(), 'admin');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin')
    ON CONFLICT DO NOTHING;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.claim_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_admin() TO authenticated, service_role;