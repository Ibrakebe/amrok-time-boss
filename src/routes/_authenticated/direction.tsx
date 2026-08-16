import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Fingerprint,
  LogOut,
  Plus,
  Users,
  Clock,
  UserCog,
  Trash2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  biometricsSupported,
  enrollBiometric,
  hasBiometricForEmployee,
  removeBiometricForEmployee,
} from "@/lib/biometrics";
import logo from "@/assets/amrok-logo.png";

export const Route = createFileRoute("/_authenticated/direction")({
  head: () => ({
    meta: [
      { title: "Tableau de bord direction — Amrok & Le Tiafka" },
      {
        name: "description",
        content:
          "Présences en temps réel, heures travaillées et gestion du personnel d'Amrok Supermarché et du Tiafka Resto.",
      },
      { property: "og:title", content: "Tableau de bord direction — Amrok & Le Tiafka" },
      {
        property: "og:description",
        content: "Suivi des présences, des heures et du personnel des deux structures.",
      },
    ],
  }),
  component: DirectionPage,
});

const SITES = ["Amrok Supermarché", "Le Tiafka Resto"] as const;
type Site = (typeof SITES)[number];

type Employee = {
  id: string;
  full_name: string;
  position: string;
  is_active: boolean;
  site: string;
};

type Entry = {
  id: string;
  employee_id: string;
  clock_in: string;
  clock_out: string | null;
  employees: { full_name: string; position: string; site: string } | null;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const hoursLabel = (mins: number) =>
  `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}`;

function minutesOf(entry: Entry) {
  if (!entry.clock_out) return 0;
  return Math.max(0, Math.round((+new Date(entry.clock_out) - +new Date(entry.clock_in)) / 60000));
}

function SiteBadge({ site }: { site?: string | null }) {
  const isResto = site === "Le Tiafka Resto";
  return (
    <Badge
      variant="outline"
      className={
        isResto
          ? "border-accent/40 bg-accent/15 text-accent-foreground"
          : "border-primary/30 bg-primary/10 text-primary"
      }
    >
      {site ?? "—"}
    </Badge>
  );
}

function DirectionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [from, setFrom] = useState(isoDay(monthStart));
  const [to, setTo] = useState(isoDay(today));
  const [siteFilter, setSiteFilter] = useState<"all" | Site>("all");

  const { data: isAdmin, isLoading: roleLoading } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      await supabase.rpc("claim_admin");
      const { data } = await supabase.auth.getUser();
      if (!data.user) return false;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "admin");
      return (roles?.length ?? 0) > 0;
    },
  });

  const present = useQuery({
    queryKey: ["present"],
    enabled: !!isAdmin,
    refetchInterval: 30000,
    queryFn: async (): Promise<Entry[]> => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, employee_id, clock_in, clock_out, employees(full_name, position, site)")
        .is("clock_out", null)
        .order("clock_in", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const entries = useQuery({
    queryKey: ["entries", from, to],
    enabled: !!isAdmin,
    queryFn: async (): Promise<Entry[]> => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("id, employee_id, clock_in, clock_out, employees(full_name, position, site)")
        .gte("clock_in", `${from}T00:00:00`)
        .lte("clock_in", `${to}T23:59:59`)
        .order("clock_in", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const employees = useQuery({
    queryKey: ["employees"],
    enabled: !!isAdmin,
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, position, is_active, site")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const matchesSite = (site?: string | null) => siteFilter === "all" || site === siteFilter;

  const presentRows = (present.data ?? []).filter((e) => matchesSite(e.employees?.site));
  const entryRows = (entries.data ?? []).filter((e) => matchesSite(e.employees?.site));
  const staffRows = (employees.data ?? []).filter((e) => matchesSite(e.site));

  const totals = useMemo(() => {
    const map = new Map<
      string,
      { name: string; position: string; site: string; mins: number; days: Set<string> }
    >();
    for (const e of entryRows) {
      const key = e.employee_id;
      const row =
        map.get(key) ??
        {
          name: e.employees?.full_name ?? "—",
          position: e.employees?.position ?? "",
          site: e.employees?.site ?? "",
          mins: 0,
          days: new Set<string>(),
        };
      row.mins += minutesOf(e);
      row.days.add(e.clock_in.slice(0, 10));
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.mins - a.mins);
  }, [entryRows]);

  const exportCsv = () => {
    const rows = [
      ["Structure", "Employé", "Poste", "Date", "Arrivée", "Départ", "Heures"],
      ...entryRows.map((e) => [
        e.employees?.site ?? "",
        e.employees?.full_name ?? "",
        e.employees?.position ?? "",
        dayLabel(e.clock_in),
        hhmm(e.clock_in),
        e.clock_out ? hhmm(e.clock_out) : "en cours",
        e.clock_out ? (minutesOf(e) / 60).toFixed(2).replace(".", ",") : "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pointage-${siteFilter === "all" ? "toutes-structures" : siteFilter.toLowerCase().replace(/\s+/g, "-")}-${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth" });
  };

  if (roleLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Chargement…</p>;
  }

  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-xl font-bold">Accès réservé</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Votre compte n'a pas les droits de direction. Demandez à un responsable de vous les
            attribuer.
          </p>
          <Button variant="outline" className="mt-5" onClick={signOut}>
            Se déconnecter
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background pb-12">
      <header className="surface-brand px-5 pt-6 pb-10 text-primary-foreground">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Logo du groupe Amrok"
              width={816}
              height={816}
              className="size-10 rounded-xl bg-primary-foreground/95 p-1"
            />
            <div>
              <p className="font-display leading-tight font-bold">Direction</p>
              <p className="text-xs opacity-80">Amrok Supermarché · Le Tiafka Resto</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <LogOut className="size-4" /> Quitter
          </Button>
        </div>

        <div className="mx-auto mt-6 flex max-w-4xl gap-1.5 rounded-2xl bg-primary-foreground/10 p-1.5">
          {(["all", ...SITES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSiteFilter(s)}
              className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                siteFilter === s
                  ? "bg-primary-foreground text-primary"
                  : "text-primary-foreground/80 hover:text-primary-foreground"
              }`}
            >
              {s === "all" ? "Les deux structures" : s}
            </button>
          ))}
        </div>

        <div className="mx-auto mt-4 grid max-w-4xl grid-cols-3 gap-3">
          <Stat label="Présents" value={String(presentRows.length)} />
          <Stat
            label="Employés actifs"
            value={String(staffRows.filter((e) => e.is_active).length)}
          />
          <Stat
            label="Heures (période)"
            value={hoursLabel(totals.reduce((s, r) => s + r.mins, 0))}
          />
        </div>
      </header>

      <section className="mx-auto -mt-4 max-w-4xl px-5">
        <Tabs defaultValue="present">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="present">
              <Users className="mr-1 size-4" /> Présents
            </TabsTrigger>
            <TabsTrigger value="hours">
              <Clock className="mr-1 size-4" /> Heures
            </TabsTrigger>
            <TabsTrigger value="staff">
              <UserCog className="mr-1 size-4" /> Employés
            </TabsTrigger>
          </TabsList>

          <TabsContent value="present" className="mt-4 space-y-3">
            {presentRows.length === 0 && <Empty text="Personne n'est en poste actuellement." />}
            {presentRows.map((e) => (
              <Card key={e.id}>
                <div>
                  <p className="font-display font-semibold">{e.employees?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{e.employees?.position}</p>
                  <div className="mt-1.5">
                    <SiteBadge site={e.employees?.site} />
                  </div>
                </div>
                <div className="text-right">
                  <Badge className="bg-success text-success-foreground">En poste</Badge>
                  <p className="mt-1 text-xs text-muted-foreground">Depuis {hhmm(e.clock_in)}</p>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="hours" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="space-y-1">
                <Label htmlFor="from" className="text-xs">
                  Du
                </Label>
                <Input
                  id="from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="to" className="text-xs">
                  Au
                </Label>
                <Input
                  id="to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-10"
                />
              </div>
              <Button variant="outline" onClick={exportCsv} className="h-10">
                <Download className="size-4" /> Export CSV
              </Button>
            </div>

            {totals.length === 0 && <Empty text="Aucun pointage sur cette période." />}
            {totals.map((r) => (
              <Card key={r.name}>
                <div>
                  <p className="font-display font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.position} · {r.days.size} jour(s) travaillé(s)
                  </p>
                  <div className="mt-1.5">
                    <SiteBadge site={r.site} />
                  </div>
                </div>
                <p className="font-display text-lg font-bold tabular-nums">{hoursLabel(r.mins)}</p>
              </Card>
            ))}

            {entryRows.length > 0 && (
              <div className="rounded-2xl border border-border bg-card">
                <p className="border-b border-border px-4 py-3 font-display text-sm font-semibold">
                  Détail des pointages
                </p>
                <ul className="divide-y divide-border">
                  {entryRows.map((e) => (
                    <li key={e.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <span>
                        <span className="font-medium">{e.employees?.full_name}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {e.employees?.site} · {dayLabel(e.clock_in)}
                        </span>
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {hhmm(e.clock_in)} → {e.clock_out ? hhmm(e.clock_out) : "…"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="staff" className="mt-4 space-y-3">
            <EmployeeDialog
              defaultSite={siteFilter === "all" ? SITES[0] : siteFilter}
              onSaved={() => employees.refetch()}
            />
            {staffRows.length === 0 && <Empty text="Aucun employé enregistré pour l'instant." />}
            {(siteFilter === "all" ? SITES : [siteFilter]).map((site) => {
              const list = staffRows.filter((e) => e.site === site);
              if (list.length === 0) return null;
              return (
                <div key={site} className="space-y-3">
                  <div className="flex items-center gap-2 pt-2">
                    <SiteBadge site={site} />
                    <span className="text-xs text-muted-foreground">
                      {list.length} employé(s)
                    </span>
                  </div>
                  {list.map((emp) => (
                    <Card key={emp.id}>
                      <div>
                        <p className="font-display font-semibold">{emp.full_name}</p>
                        <p className="text-xs text-muted-foreground">{emp.position}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!emp.is_active && <Badge variant="secondary">Désactivé</Badge>}
                        <EmployeeDialog employee={emp} onSaved={() => employees.refetch()} />
                      </div>
                    </Card>
                  ))}
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-primary-foreground/10 px-3 py-3 text-center">
      <p className="font-display text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] opacity-80">{label}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-[var(--shadow-soft)]">
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function EmployeeDialog({
  employee,
  defaultSite,
  onSaved,
}: {
  employee?: Employee;
  defaultSite?: Site;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(employee?.full_name ?? "");
  const [position, setPosition] = useState(employee?.position ?? "");
  const [site, setSite] = useState<Site>(
    (employee?.site as Site) ?? defaultSite ?? SITES[0],
  );
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(employee?.is_active ?? true);
  const [enrollBio, setEnrollBio] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnrolled, setBioEnrolled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBioSupported(biometricsSupported());
    setBioEnrolled(employee ? hasBiometricForEmployee(employee.id) : false);
  }, [open, employee]);

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_save_employee", {
        p_id: (employee?.id ?? null) as unknown as string,
        p_name: name,
        p_position: position,
        p_pin: (pin ? pin : null) as unknown as string,
        p_active: active,
        p_site: site,
      });
      if (error) throw error;

      const employeeId = (data as unknown as string) ?? employee?.id;
      if (enrollBio && pin.length >= 4 && employeeId) {
        await enrollBiometric(pin, `${name} · ${site}`, employeeId);
      }
    },
    onSuccess: () => {
      toast.success(employee ? "Employé mis à jour" : "Employé ajouté");
      setPin("");
      setEnrollBio(false);
      setOpen(false);
      onSaved();
    },
    onError: (error: Error) => {
      toast.error("Enregistrement impossible", {
        description: error.message.includes("pin_required")
          ? "Un code PIN de 4 chiffres minimum est requis."
          : error.message,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {employee ? (
          <Button variant="outline" size="sm">
            Modifier
          </Button>
        ) : (
          <Button className="h-12 w-full rounded-2xl">
            <Plus className="size-4" /> Ajouter un employé
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {employee ? "Modifier l'employé" : "Nouvel employé"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emp-name">Nom complet</Label>
            <Input id="emp-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Structure</Label>
            <Select value={site} onValueChange={(v) => setSite(v as Site)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SITES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp-position">Poste</Label>
            <Input
              id="emp-position"
              value={position}
              placeholder="Caissier, Rayon, Serveur, Cuisine…"
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp-pin">
              {employee ? "Nouveau code PIN (facultatif)" : "Code PIN (4 à 6 chiffres)"}
            </Label>
            <Input
              id="emp-pin"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-border px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="emp-bio" className="flex items-center gap-1.5">
                  <Fingerprint className="size-4" /> Empreinte digitale
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {bioEnrolled
                    ? "Empreinte enrôlée sur cet appareil."
                    : "Enrôler l'empreinte sur cet appareil de pointage."}
                </p>
              </div>
              <Switch
                id="emp-bio"
                checked={enrollBio}
                disabled={!bioSupported}
                onCheckedChange={setEnrollBio}
              />
            </div>
            {!bioSupported && (
              <p className="text-xs text-muted-foreground">
                Cet appareil ne dispose pas de lecteur d'empreinte compatible.
              </p>
            )}
            {bioSupported && enrollBio && pin.length < 4 && (
              <p className="text-xs text-muted-foreground">
                Saisissez le code PIN ci-dessus : l'empreinte y sera associée lors de
                l'enregistrement.
              </p>
            )}
            {bioEnrolled && employee && (
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full rounded-xl text-xs text-muted-foreground"
                onClick={() => {
                  removeBiometricForEmployee(employee.id);
                  setBioEnrolled(false);
                  toast.success("Empreinte retirée de cet appareil");
                }}
              >
                <Trash2 className="mr-1 size-3.5" /> Retirer l'empreinte de cet appareil
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
            <Label htmlFor="emp-active">Compte actif</Label>
            <Switch id="emp-active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || name.trim().length < 2}
            className="w-full"
          >
            {save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
