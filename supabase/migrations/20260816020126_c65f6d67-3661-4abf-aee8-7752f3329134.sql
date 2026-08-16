ALTER TABLE public.employees
  ADD COLUMN site text NOT NULL DEFAULT 'Amrok Supermarché';

ALTER TABLE public.employees
  ADD CONSTRAINT employees_site_check CHECK (site IN ('Amrok Supermarché', 'Le Tiafka Resto'));

CREATE OR REPLACE FUNCTION public.admin_save_employee(p_id uuid, p_name text, p_position text, p_pin text, p_active boolean, p_site text DEFAULT 'Amrok Supermarché')
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_site IS NOT NULL AND p_site NOT IN ('Amrok Supermarché', 'Le Tiafka Resto') THEN
    RAISE EXCEPTION 'invalid_site';
  END IF;
  IF p_id IS NULL THEN
    IF p_pin IS NULL OR length(p_pin) < 4 THEN RAISE EXCEPTION 'pin_required'; END IF;
    INSERT INTO public.employees (full_name, position, pin_hash, is_active, site)
    VALUES (p_name, coalesce(nullif(p_position,''),'Employé'),
            extensions.crypt(p_pin, extensions.gen_salt('bf')), coalesce(p_active, true),
            coalesce(nullif(p_site,''), 'Amrok Supermarché'))
    RETURNING id INTO new_id;
    RETURN new_id;
  END IF;
  UPDATE public.employees SET
    full_name = coalesce(nullif(p_name,''), full_name),
    position = coalesce(nullif(p_position,''), position),
    site = coalesce(nullif(p_site,''), site),
    is_active = coalesce(p_active, is_active),
    pin_hash = CASE WHEN p_pin IS NOT NULL AND length(p_pin) >= 4
                    THEN extensions.crypt(p_pin, extensions.gen_salt('bf')) ELSE pin_hash END
  WHERE id = p_id;
  RETURN p_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.punch_pin(p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE emp record; open_entry record; res jsonb;
BEGIN
  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  SELECT id, full_name, site INTO emp FROM public.employees
    WHERE is_active AND pin_hash = extensions.crypt(p_pin, pin_hash) LIMIT 1;
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
END; $function$;