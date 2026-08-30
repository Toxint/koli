import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { Icone } from "@/components/ui/Icone";
import { pluriel } from "@/lib/format";
import { origineDepuisEnTetes } from "@/lib/auth/google";
import { listerEquipeAction } from "@/lib/drivers/equipe";
import { invitationCouranteAction } from "@/lib/drivers/invitations";
import { EquipeLivraison } from "@/components/domain/EquipeLivraison";

/**
 * Mes livreurs — l'équipe de livraison du vendeur (§5.3).
 *
 * « Au début, chaque vendeur peut utiliser son propre livreur. » Cet écran est
 * l'endroit où cette phrase devient une chose qu'on peut faire : on invite ses
 * livreurs par un lien, on les voit, on en retire.
 *
 * Il n'y a **aucune recherche de livreur** ici, et c'est délibéré. Chercher
 * supposerait un annuaire de tous les livreurs de la plateforme, consultable
 * par quiconque ouvre un compte vendeur. Le vendeur n'a pas à découvrir des
 * livreurs : il en a déjà, et il veut les retrouver dans l'application.
 */
export default async function VendeurLivreursPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SELLER" || !user.sellerProfile) {
    redirect("/connexion");
  }

  const [equipe, invitation] = await Promise.all([
    listerEquipeAction(),
    invitationCouranteAction(),
  ]);

  /*
   * L'adresse du lien se construit à partir de l'hôte RÉELLEMENT demandé.
   *
   * `origineDepuisEnTetes` lit `x-forwarded-host` puis `host` — pas l'adresse
   * d'écoute du serveur. La nuance décide de tout : lancé sur `0.0.0.0` et
   * visité depuis un téléphone en `192.168.x.x`, le serveur aurait fabriqué un
   * lien vers `localhost`, c'est-à-dire vers le téléphone du livreur lui-même.
   * Le lien aurait été copié, envoyé, et n'aurait mené nulle part.
   */
  const origine = origineDepuisEnTetes(await headers());

  const disponibles = equipe.filter((m) => m.disponible && m.actif).length;

  return (
    <div className="min-h-screen bg-cream text-ink lg:pl-[var(--largeur-menu)]">
      <MenuEspace
        user={user}
        nomAffiche={user.sellerProfile.businessName || user.name}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mes livreurs</h1>
          <p className="mt-1 text-xs text-ink-muted">
            {equipe.length === 0
              ? "Personne dans votre équipe pour l'instant"
              : `${pluriel(equipe.length, "livreur")} — ${disponibles} disponible${disponibles > 1 ? "s" : ""} en ce moment`}
          </p>
        </div>

        <EquipeLivraison
          equipe={equipe.map((m) => ({ ...m, depuis: m.depuis.toISOString() }))}
          invitation={
            invitation
              ? {
                  token: invitation.token,
                  expiresAt: invitation.expiresAt.toISOString(),
                  entrees: invitation.entrees,
                }
              : null
          }
          origine={origine}
        />

        {/*
         * Ce que le livreur voit de son côté — dit ici, parce que c'est la
         * question que le vendeur pose en premier quand il partage le lien.
         */}
        <div className="rounded-2xl border border-hairline bg-white p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Icone nom="info" className="h-4 w-4 text-brand" />
            Ce que voit votre livreur
          </h2>
          <ul className="mt-3 space-y-2 text-xs leading-relaxed text-ink-muted">
            <li>
              Il ouvre votre lien, crée son compte, et rejoint votre équipe
              automatiquement. Vous n&apos;avez rien à saisir.
            </li>
            <li>
              Il indique où il livre et s&apos;il prend des courses. Vous le
              lisez ici avant de lui confier une livraison.
            </li>
            <li>
              §25 — il ne voit <strong>ni le montant de la marchandise, ni votre
              commission</strong>. Seulement ce qui lui revient et ce qu&apos;il
              lui faut pour livrer.
            </li>
            <li>
              Il peut travailler pour d&apos;autres vendeurs. Vous ne voyez que
              les courses qu&apos;il a faites pour vous.
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
