// Empreinte digitale : WebAuthn (authentificateur de la plateforme).
// L'identifiant de l'empreinte (credential id) est désormais enregistré dans la
// base de données et rattaché à l'employé : plus aucun code PIN n'est stocké
// sur l'appareil. Le pointage se fait via la fonction `punch_credential`.

import { supabase } from "@/integrations/supabase/client";

function b64url(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string) {
  const s = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s.padEnd(Math.ceil(s.length / 4) * 4, "="));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(size: number) {
  const b = new Uint8Array(size);
  crypto.getRandomValues(b);
  return b;
}

export function biometricsSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    !!navigator.credentials
  );
}

/** Identifiants d'empreintes enregistrés en base (employés actifs). */
export async function fetchBiometricCredentialIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("list_biometric_credentials");
  if (error) throw error;
  return ((data ?? []) as { credential_id: string }[]).map((r) => r.credential_id);
}

/** Nombre d'empreintes enrôlées pour un employé (lecture direction). */
export async function countBiometricsForEmployee(employeeId: string) {
  const { count, error } = await supabase
    .from("employee_credentials")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", employeeId);
  if (error) throw error;
  return count ?? 0;
}

export async function removeBiometricsForEmployee(employeeId: string) {
  const { error } = await supabase.rpc("admin_delete_credentials", {
    p_employee_id: employeeId,
  });
  if (error) throw error;
}

/** Enrôle une empreinte sur cet appareil et l'enregistre en base pour l'employé. */
export async function enrollBiometric(employeeId: string, label: string) {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: "Amrok Supermarché" },
      user: { id: randomBytes(16), name: label || "employé", displayName: label || "Employé" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("cancelled");

  const credentialId = b64url(credential.rawId);
  const { error } = await supabase.rpc("admin_save_credential", {
    p_employee_id: employeeId,
    p_credential_id: credentialId,
    p_device_label: navigator.userAgent.slice(0, 80),
  });
  if (error) throw error;
  return credentialId;
}

/** Vérifie l'empreinte et retourne l'identifiant reconnu. */
export async function verifyBiometric(): Promise<string> {
  const ids = await fetchBiometricCredentialIds();
  if (ids.length === 0) throw new Error("no_enrollment");

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: ids.map((id) => ({
        type: "public-key" as const,
        id: fromB64url(id),
      })),
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("cancelled");
  const id = b64url(assertion.rawId);
  if (!ids.includes(id)) throw new Error("unknown_credential");
  return id;
}
