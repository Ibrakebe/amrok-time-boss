// Empreinte digitale : WebAuthn (authentificateur de la plateforme).
// Le lien empreinte ⇄ code PIN est stocké uniquement sur l'appareil (borne),
// jamais envoyé au serveur : le pointage réutilise ensuite la fonction PIN.

const STORE_KEY = "amrok.biometrics.v1";

type BioLink = {
  credentialId: string;
  pin: string;
  label: string;
  employeeId?: string | undefined;
};

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

export function listBiometricLinks(): BioLink[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as BioLink[]) : [];
  } catch {
    return [];
  }
}

function saveLinks(links: BioLink[]) {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(links));
}

export function removeAllBiometricLinks() {
  window.localStorage.removeItem(STORE_KEY);
}

export function hasBiometricForEmployee(employeeId: string) {
  return listBiometricLinks().some((l) => l.employeeId === employeeId);
}

export function removeBiometricForEmployee(employeeId: string) {
  saveLinks(listBiometricLinks().filter((l) => l.employeeId !== employeeId));
}

/** Enrôle une empreinte sur cet appareil et l'associe à un code PIN. */
export async function enrollBiometric(pin: string, label: string, employeeId?: string) {
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
  const links = listBiometricLinks().filter(
    (l) => l.credentialId !== credentialId && (!employeeId || l.employeeId !== employeeId),
  );
  links.push({ credentialId, pin, label, employeeId });
  saveLinks(links);
  return credentialId;
}

/** Vérifie l'empreinte et retourne le PIN associé. */
export async function verifyBiometric(): Promise<{ pin: string; label: string }> {
  const links = listBiometricLinks();
  if (links.length === 0) throw new Error("no_enrollment");

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: links.map((l) => ({
        type: "public-key" as const,
        id: fromB64url(l.credentialId),
      })),
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error("cancelled");
  const id = b64url(assertion.rawId);
  const match = links.find((l) => l.credentialId === id);
  if (!match) throw new Error("unknown_credential");
  return { pin: match.pin, label: match.label };
}
