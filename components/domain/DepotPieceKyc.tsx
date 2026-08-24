"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deposerPieceKycAction } from "@/lib/kyc/actions";
import { Icone } from "@/components/ui/Icone";

const TAILLE_MAX = 5 * 1024 * 1024;

/**
 * Dépôt d'une pièce justificative (§37).
 *
 * `capture` n'est PAS forcé : sur un téléphone, l'attribut ouvre directement
 * l'appareil photo et empêche de choisir un fichier déjà enregistré. Or
 * beaucoup de commerçants ont déjà la photo de leur pièce dans leur galerie,
 * ou un PDF reçu par messagerie. Le navigateur propose les deux.
 *
 * Le contrôle de taille est refait ici, avant l'envoi : il ne remplace pas
 * celui du serveur — qui seul fait autorité — mais évite de faire monter cinq
 * mégaoctets sur un réseau mobile pour se les faire refuser à l'arrivée.
 */
export function DepotPieceKyc({
  type,
  dejaDeposee,
}: {
  type: string;
  dejaDeposee: boolean;
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [nomChoisi, setNomChoisi] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const envoyer = (fichier: File) => {
    setErreur(null);

    if (fichier.size > TAILLE_MAX) {
      setErreur(
        `Fichier trop lourd (${Math.round(fichier.size / 1024 / 1024)} Mo). Maximum 5 Mo.`
      );
      return;
    }

    const donnees = new FormData();
    donnees.set("type", type);
    donnees.set("fichier", fichier);

    demarrer(async () => {
      const res = await deposerPieceKycAction(donnees);
      if (!res.success) {
        setErreur(res.error);
        return;
      }
      setNomChoisi(null);
      if (champ.current) champ.current.value = "";
      router.refresh();
    });
  };

  return (
    <div className="mt-2">
      <label className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-brand-border bg-white hover:bg-brand-soft/50 text-brand text-xs font-bold transition-all cursor-pointer">
        <Icone nom="telechargement" className="w-4 h-4 rotate-180" />
        {enCours
          ? "Envoi en cours…"
          : dejaDeposee
            ? "Remplacer le fichier"
            : "Choisir un fichier"}
        <input
          ref={champ}
          type="file"
          className="sr-only"
          disabled={enCours}
          /* Le navigateur filtre déjà l'essentiel, mais ce n'est qu'un confort :
             le serveur reconnaît le type en LISANT le fichier. */
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setNomChoisi(f.name);
            envoyer(f);
          }}
        />
      </label>

      {nomChoisi && enCours && (
        <p className="text-xs text-ink-muted mt-1 break-all">{nomChoisi}</p>
      )}

      {erreur && (
        <p role="alert" className="text-xs text-danger font-medium mt-1">
          {erreur}
        </p>
      )}
    </div>
  );
}
