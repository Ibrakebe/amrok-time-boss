CREATE TABLE public.employee_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  credential_id text NOT NULL UNIQUE,
  device_label text NOT NULL DEFAULT 'Borne de pointage',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_credentials TO authenticated;
GRANT ALL ON public.employee_credentials TO service_role;

ALTER TABLE public.employee_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage credentials" ON public.employee_credentials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_save_credential(p_employee_id uuid, p_credential_id text, p_device_label text DEFAULT 'Borne de pointage')
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_credential_id IS NULL OR length(p_credential_id) < 8 THEN RAISE EXCEPTION 'invalid_credential'; END IF;
  INSERT INTO public.employee_credentials (employee_id, credential_id, device_label)
  VALUES (p_employee_id, p_credential_id, coalesce(nullif(p_device_label,''), 'Borne de pointage'))
  ON CONFLICT (credential_id) DO UPDATE SET employee_id = excluded.employee_id, device_label = excluded.device_label
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_credentials(p_employee_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.employee_credentials WHERE employee_id = p_employee_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

CREATE OR REPLACE FUNCTION public.list_biometric_credentials()
RETURNS TABLE(credential_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.credential_id
  FROM public.employee_credentials c
  JOIN public.employees e ON e.id = c.employee_id
  WHERE e.is_active
$$;

CREATE OR REPLACE FUNCTION public.punch_credential(p_credential_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE emp record; open_entry record; res jsonb;
BEGIN
  SELECT e.id, e.full_name, e.site INTO emp
  FROM public.employee_credentials c
  JOIN public.employees e ON e.id = c.employee_id
  WHERE c.credential_id = p_credential_id AND e.is_active
  LIMIT 1;
  IF emp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  SELECT id, clock_in INTO open_entry FROM public.time_entries
    WHERE employee_id = emp.id AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1;
  IF open_entry.id IS NOT NULL THEN
    UPDATE public.time_entries SET clock_out = now() WHERE id = open_entry.id;
    res := jsonb_build_object('ok', true, 'action', 'out', 'name', emp.full_name,
      'site', emp.site, 'at', now(), 'since', open_entry.clock_in);
  ELSE
    INSERT INTO public.time_entries (employee_id) VALUES (emp.id);
    res := jsonb_build_object('ok', true, 'action', 'in', 'name', emp.full_name,
      'site', emp.site, 'at', now());
  END IF;
  RETURN res;
END; $$;

GRANT EXECUTE ON FUNCTION public.list_biometric_credentials() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.punch_credential(text) TO anon, authenticated;
