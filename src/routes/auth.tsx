import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import logo from "@/assets/amrok-logo.png";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Espace direction — Amrok Supermarché" },
      {
        name: "description",
        content:
          "Connexion réservée à la direction d'Amrok Supermarché pour suivre les présences, les heures et gérer les employés.",
      },
      { property: "og:title", content: "Espace direction — Amrok Supermarché" },
      {
        property: "og:description",
        content: "Connexion réservée à la direction pour le suivi des pointages.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/direction" });
    });
  }, [navigate]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Connexion impossible", { description: error.message });
      return;
    }
    await supabase.rpc("claim_admin");
    navigate({ to: "/direction" });
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin + "/auth" },
    });
    setBusy(false);
    if (error) {
      toast.error("Inscription impossible", { description: error.message });
      return;
    }
    if (!data.session) {
      toast.success("Compte créé", {
        description: "Confirmez votre adresse e-mail depuis le lien reçu, puis connectez-vous.",
      });
      return;
    }
    await supabase.rpc("claim_admin");
    navigate({ to: "/direction" });
  };

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <div className="surface-brand px-5 pt-6 pb-20 text-primary-foreground">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Link to="/" aria-label="Retour à la borne" className="opacity-90 hover:opacity-100">
            <ArrowLeft className="size-5" />
          </Link>
          <img
            src={logo}
            alt="Logo Amrok Supermarché"
            width={816}
            height={816}
            loading="lazy"
            className="size-10 rounded-xl bg-primary-foreground/95 p-1"
          />
          <div>
            <p className="font-display leading-tight font-bold">Espace direction</p>
            <p className="text-xs opacity-80">Amrok Supermarché</p>
          </div>
        </div>
      </div>

      <section className="mx-auto -mt-14 w-full max-w-md px-5">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Connexion</TabsTrigger>
              <TabsTrigger value="signup">Créer un compte</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={signIn} className="mt-4 space-y-4">
                <Fields
                  email={email}
                  password={password}
                  onEmail={setEmail}
                  onPassword={setPassword}
                />
                <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl">
                  {busy ? "Connexion…" : "Se connecter"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="mt-4 space-y-4">
                <Fields
                  email={email}
                  password={password}
                  onEmail={setEmail}
                  onPassword={setPassword}
                />
                <Button type="submit" disabled={busy} className="h-12 w-full rounded-xl">
                  {busy ? "Création…" : "Créer le compte"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Le premier compte créé obtient automatiquement les droits de direction.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </main>
  );
}

function Fields({
  email,
  password,
  onEmail,
  onPassword,
}: {
  email: string;
  password: string;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="email">Adresse e-mail</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="direction@amrok.sn"
          className="h-12"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          className="h-12"
        />
      </div>
    </>
  );
}
