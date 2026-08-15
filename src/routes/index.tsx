import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Delete, LogIn, LogOut, ShieldCheck, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import logo from "@/assets/amrok-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pointage employés — Amrok Supermarché" },
      {
        name: "description",
        content:
          "Borne de pointage Amrok Supermarché : saisissez votre code PIN pour enregistrer votre arrivée ou votre départ.",
      },
      { property: "og:title", content: "Pointage employés — Amrok Supermarché" },
      {
        property: "og:description",
        content: "Enregistrez votre arrivée ou votre départ avec votre code PIN personnel.",
      },
    ],
  }),
  component: KioskPage,
});

type PunchResult =
  | { ok: true; action: "in" | "out"; name: string; at: string; since?: string }
  | { ok: false; error: string };

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function durationLabel(from: string, to: string) {
  const mins = Math.max(0, Math.round((+new Date(to) - +new Date(from)) / 60000));
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}`;
}

function KioskPage() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PunchResult | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(t);
  }, [result]);

  const press = (digit: string) => {
    if (busy || pin.length >= 6) return;
    setResult(null);
    setPin((p) => p + digit);
  };

  const submit = async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("punch_pin", { p_pin: pin });
    setBusy(false);
    setPin("");
    if (error) {
      setResult({ ok: false, error: "server" });
      return;
    }
    setResult(data as unknown as PunchResult);
  };

  return (
    <main className="min-h-screen bg-background pb-10">
      <header className="surface-brand px-5 pt-6 pb-14 text-primary-foreground">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="Logo Amrok Supermarché"
              width={816}
              height={816}
              className="size-11 rounded-xl bg-primary-foreground/95 p-1"
            />
            <div>
              <p className="font-display text-lg leading-tight font-bold">Amrok Supermarché</p>
              <p className="text-xs opacity-80">Borne de pointage du personnel</p>
            </div>
          </div>
          <Link
            to="/auth"
            className="rounded-full border border-primary-foreground/30 px-3 py-1.5 text-xs font-medium opacity-90 transition-opacity hover:opacity-100"
          >
            <ShieldCheck className="mr-1 inline size-3.5" />
            Direction
          </Link>
        </div>
        <div className="mx-auto mt-8 max-w-2xl text-center">
          <p className="font-display text-5xl font-extrabold tabular-nums">
            {now ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}
          </p>
          <p className="mt-1 text-sm opacity-80">
            {now
              ? now.toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : ""}
          </p>
        </div>
      </header>

      <section className="mx-auto -mt-8 max-w-md px-5">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          {result ? (
            <ResultCard result={result} />
          ) : (
            <>
              <h1 className="text-center font-display text-lg font-semibold">
                Entrez votre code PIN
              </h1>
              <div className="mt-4 flex justify-center gap-2.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span
                    key={i}
                    className={`size-3.5 rounded-full transition-colors ${
                      i < pin.length ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => press(d)}
                    className="keypad-key active:keypad-key-active h-16"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPin((p) => p.slice(0, -1))}
                  aria-label="Effacer un chiffre"
                  className="keypad-key active:keypad-key-active flex h-16 items-center justify-center text-muted-foreground"
                >
                  <Delete className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={() => press("0")}
                  className="keypad-key active:keypad-key-active h-16"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => setPin("")}
                  className="keypad-key active:keypad-key-active h-16 text-base text-muted-foreground"
                >
                  C
                </button>
              </div>

              <Button
                size="lg"
                onClick={submit}
                disabled={pin.length < 4 || busy}
                className="mt-4 h-14 w-full rounded-2xl font-display text-base font-semibold"
              >
                {busy ? "Enregistrement…" : "Pointer"}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Le système enregistre automatiquement une arrivée, puis un départ.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function ResultCard({ result }: { result: PunchResult }) {
  if (!result.ok) {
    const message =
      result.error === "not_found"
        ? "Code PIN inconnu ou compte désactivé."
        : result.error === "invalid"
          ? "Le code doit contenir au moins 4 chiffres."
          : "Erreur de connexion, réessayez.";
    return (
      <div className="py-8 text-center">
        <XCircle className="mx-auto size-14 text-destructive" />
        <h2 className="mt-4 font-display text-xl font-bold">Pointage refusé</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  const isIn = result.action === "in";
  return (
    <div className="py-8 text-center">
      <div
        className={`mx-auto flex size-16 items-center justify-center rounded-full ${
          isIn ? "bg-success/15 text-success" : "bg-accent/20 text-accent-foreground"
        }`}
      >
        {isIn ? <LogIn className="size-8" /> : <LogOut className="size-8" />}
      </div>
      <p className="mt-4 text-sm font-medium text-muted-foreground">
        {isIn ? "Bienvenue" : "Bonne fin de journée"}
      </p>
      <h2 className="font-display text-2xl font-bold">{result.name}</h2>
      <p className="mt-3 text-sm">
        {isIn ? "Arrivée enregistrée à" : "Départ enregistré à"}{" "}
        <span className="font-semibold">{formatTime(result.at)}</span>
      </p>
      {!isIn && result.since && (
        <p className="mt-1 text-sm text-muted-foreground">
          Durée de la journée : {durationLabel(result.since, result.at)}
        </p>
      )}
    </div>
  );
}
