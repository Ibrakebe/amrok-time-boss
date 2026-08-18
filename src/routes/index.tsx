import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Delete,
  Fingerprint,
  Grid3x3,
  LogIn,
  LogOut,
  ScanBarcode,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  biometricsSupported,
  fetchBiometricCredentialIds,
  verifyBiometric,
} from "@/lib/biometrics";
import { APP_TIME_ZONE, formatTime, hoursLabel, minutesBetween } from "@/lib/time";
import logo from "@/assets/amrok-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pointage employés — Amrok Supermarché" },
      {
        name: "description",
        content:
          "Borne de pointage Amrok Supermarché : code PIN, badge code-barres ou empreinte digitale pour enregistrer arrivée et départ.",
      },
      { property: "og:title", content: "Pointage employés — Amrok Supermarché" },
      {
        property: "og:description",
        content: "Pointez avec votre code PIN, votre badge code-barres ou votre empreinte digitale.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KioskPage,
});

type PunchResult =
  | {
      ok: true;
      action: "in" | "out";
      name: string;
      at: string;
      since?: string;
      site?: string;
    }
  | { ok: false; error: string };

type Mode = "keypad" | "barcode" | "fingerprint";

function durationLabel(from: string, to: string) {
  return hoursLabel(minutesBetween(from, to));
}


function KioskPage() {
  const [mode, setMode] = useState<Mode>("keypad");
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

  const punch = useCallback(async (code: string) => {
    if (code.length < 4) {
      setResult({ ok: false, error: "invalid" });
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("punch_pin", { p_pin: code });
    setBusy(false);
    setPin("");
    setResult(error ? { ok: false, error: "server" } : (data as unknown as PunchResult));
  }, []);

  const punchCredential = useCallback(async (credentialId: string) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("punch_credential", {
      p_credential_id: credentialId,
    });
    setBusy(false);
    setResult(error ? { ok: false, error: "server" } : (data as unknown as PunchResult));
  }, []);

  const press = (digit: string) => {
    if (busy || pin.length >= 6) return;
    setResult(null);
    setPin((p) => p + digit);
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
            {now
              ? now.toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: APP_TIME_ZONE,
                })
              : "--:--"}
          </p>
          <p className="mt-1 text-sm opacity-80">
            {now
              ? now.toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  timeZone: APP_TIME_ZONE,
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
              <div className="mb-5 grid grid-cols-3 gap-1.5 rounded-2xl bg-muted p-1.5">
                {(
                  [
                    { id: "keypad", label: "Clavier", icon: Grid3x3 },
                    { id: "barcode", label: "Code-barres", icon: ScanBarcode },
                    { id: "fingerprint", label: "Empreinte", icon: Fingerprint },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setMode(tab.id);
                      setPin("");
                    }}
                    className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors ${
                      mode === tab.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="size-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {mode === "keypad" && (
                <KeypadMode
                  pin={pin}
                  busy={busy}
                  press={press}
                  setPin={setPin}
                  onSubmit={() => punch(pin)}
                />
              )}
              {mode === "barcode" && <BarcodeMode busy={busy} onScan={punch} />}
              {mode === "fingerprint" && <FingerprintMode busy={busy} onVerified={punch} />}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function KeypadMode({
  pin,
  busy,
  press,
  setPin,
  onSubmit,
}: {
  pin: string;
  busy: boolean;
  press: (d: string) => void;
  setPin: (updater: (p: string) => string) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <h1 className="text-center font-display text-lg font-semibold">Entrez votre code PIN</h1>
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
          onClick={() => setPin(() => "")}
          className="keypad-key active:keypad-key-active h-16 text-base text-muted-foreground"
        >
          C
        </button>
      </div>

      <Button
        size="lg"
        onClick={onSubmit}
        disabled={pin.length < 4 || busy}
        className="mt-4 h-14 w-full rounded-2xl font-display text-base font-semibold"
      >
        {busy ? "Enregistrement…" : "Pointer"}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Le système enregistre automatiquement une arrivée, puis un départ.
      </p>
    </>
  );
}

function BarcodeMode({ busy, onScan }: { busy: boolean; onScan: (code: string) => void }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = () => {
    const code = value.trim();
    setValue("");
    if (code) onScan(code);
    inputRef.current?.focus();
  };

  return (
    <div className="text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent/20 text-accent-foreground">
        <ScanBarcode className="size-8" />
      </div>
      <h1 className="mt-4 font-display text-lg font-semibold">Scannez votre badge</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Présentez le code-barres devant le lecteur : le pointage se fait automatiquement.
      </p>

      <Input
        ref={inputRef}
        value={value}
        inputMode="none"
        autoComplete="off"
        aria-label="Code-barres du badge"
        placeholder="En attente du scan…"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            send();
          }
        }}
        onBlur={() => inputRef.current?.focus()}
        className="mt-5 h-14 rounded-2xl text-center font-display text-xl tracking-[0.3em]"
      />

      <Button
        size="lg"
        onClick={send}
        disabled={value.trim().length < 4 || busy}
        className="mt-4 h-14 w-full rounded-2xl font-display text-base font-semibold"
      >
        {busy ? "Enregistrement…" : "Valider le badge"}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        Le badge doit contenir le code PIN de l'employé. La plupart des lecteurs USB ajoutent
        automatiquement une validation en fin de scan.
      </p>
    </div>
  );
}

function FingerprintMode({
  busy,
  onVerified,
}: {
  busy: boolean;
  onVerified: (pin: string) => void;
}) {
  const [supported, setSupported] = useState(true);
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setSupported(biometricsSupported());
    setCount(listBiometricLinks().length);
  }, []);

  const scan = async () => {
    setMessage(null);
    setWorking(true);
    try {
      const { pin } = await verifyBiometric();
      onVerified(pin);
    } catch (error) {
      const code = error instanceof Error ? error.message : "error";
      setMessage(
        code === "no_enrollment"
          ? "Aucune empreinte enregistrée sur cette borne. La direction doit l'enrôler depuis la fiche de l'employé."
          : "Empreinte non reconnue ou annulée.",
      );
    } finally {
      setWorking(false);
    }
  };

  if (!supported) {
    return (
      <div className="py-6 text-center">
        <Fingerprint className="mx-auto size-12 text-muted-foreground" />
        <h1 className="mt-4 font-display text-lg font-semibold">Empreinte indisponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cet appareil ou ce navigateur ne prend pas en charge le lecteur d'empreinte. Utilisez le
          clavier ou le badge code-barres.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={scan}
        disabled={busy || working}
        className="mx-auto flex size-24 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform active:scale-95 disabled:opacity-60"
        aria-label="Pointer avec l'empreinte digitale"
      >
        <Fingerprint className="size-12" />
      </button>
      <h1 className="mt-4 font-display text-lg font-semibold">Posez votre doigt</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {count > 0
          ? `${count} empreinte${count > 1 ? "s" : ""} enrôlée${count > 1 ? "s" : ""} sur cette borne.`
          : "Aucune empreinte enrôlée sur cette borne."}
      </p>

      {message && <p className="mt-3 text-sm font-medium text-accent-foreground">{message}</p>}

      <Button
        size="lg"
        onClick={scan}
        disabled={busy || working}
        className="mt-5 h-14 w-full rounded-2xl font-display text-base font-semibold"
      >
        {busy || working ? "Vérification…" : "Pointer avec l'empreinte"}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        L'enrôlement des empreintes se fait uniquement depuis l'espace direction, sur la fiche de
        l'employé.
      </p>
    </div>
  );
}

function ResultCard({ result }: { result: PunchResult }) {
  if (!result.ok) {
    const message =
      result.error === "not_found"
        ? "Code PIN ou badge inconnu, ou compte désactivé."
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
      {result.site && <p className="mt-1 text-xs text-muted-foreground">{result.site}</p>}
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
