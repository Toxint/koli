import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/actions";
import { prisma } from "@/lib/db/prisma";
import { MenuEspace } from "@/components/ui/MenuEspace";
import { formatMontant, formatTotaux } from "@/lib/format";
import { commeDevise, type Devise } from "@/data/markets";
import { libelleStatut, classesBadgeStatut } from "@/lib/orders/statusLabels";
import {
  ActionListe,
  CarteListe,
  Cellule,
  Colonne,
  EnTeteTableau,
  LigneTableau,
  ListeVide,
  Pastille,
} from "@/components/ui/Liste";
import { Compteur } from "@/components/ui/Compteur";
import Link from "next/link";
import { Icone } from "@/components/ui/Icone";
import { MentionModeTest } from "@/components/ui/MentionModeTest";

const JOUR_FR = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });

/** Une commande est « en cours » tant qu'elle n'est ni close ni annulée. */
const CLOSES = new Set(["COMPLETED", "CANCELLED", "REFUNDED"]);

export default async function ClientDashboardPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "CLIENT" && user.role !== "ADMIN")) {
    redirect("/connexion");
  }

  const customerProfileId = user.customerProfile?.id;

  const orders = customerProfileId
    ? await prisma.order.findMany({
        where: { customerId: customerProfileId },
        include: {
          items: { include: { product: true } },
          seller: true,
          payment: true,
          delivery: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const totalDe = (o: (typeof orders)[number]) =>
    o.items.reduce((acc, i) => acc + i.unitPrice * i.quantity, o.deliveryFee);

  const enCours = orders.filter((o) => !CLOSES.has(o.status)).length;
  const terminees = orders.filter((o) => o.status === "COMPLETED").length;

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │  LE TOTAL PAYÉ NE S'ADDITIONNE PAS. Un acheteur peut commander à un     │
   * │  vendeur d'Abidjan et à un autre de Kinshasa : additionner des XOF et   │
   * │  des CDF donnerait un nombre qui ne veut rien dire, présenté comme un   │
   * │  montant.                                                               │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * `formatTotaux` les JUXTAPOSE, séparés par « · ». C'est la même règle que
   * sur les écrans de l'administration.
   *
   * ⚠ Et on ne compte que ce qui a ÉTÉ PAYÉ : le total des commandes créées
   * gonflerait le chiffre de tout ce qui n'a jamais abouti.
   */
  const parDevise: Partial<Record<Devise, number>> = {};
  for (const o of orders) {
    if (o.payment?.status !== "SUCCEEDED") continue;
    const d = commeDevise(o.currency);
    parDevise[d] = (parDevise[d] ?? 0) + totalDe(o);
  }
  const totalPaye = formatTotaux(parDevise);

  return (
    <div className="min-h-screen bg-cream text-ink">
      <MenuEspace user={user} />

      <main className="mx-auto max-w-[86rem] space-y-4 px-4 py-6 sm:px-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-titre text-2xl font-extrabold tracking-tight text-heading">
              Bienvenue, {user.name}
            </h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              Vos achats sécurisés et le suivi de vos colis.
              <MentionModeTest> Mode test — aucun paiement réel.</MentionModeTest>
            </p>
          </div>
          <ActionListe href="/client/factures" icone="recu">
            Mes reçus
          </ActionListe>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">
          <Compteur
            libelle="Total payé"
            /* Aucun paiement abouti ⇒ « — » et non « 0 FCFA » : un zéro dans
               une monnaie qu'on n'a pas choisie affirme quelque chose de faux. */
            valeur={totalPaye ?? "—"}
            note="Ce que vos paiements aboutis ont réglé"
            accent
          />
          <Compteur
            libelle="Commandes"
            valeur={String(orders.length)}
            note="Depuis l'ouverture de votre compte"
          />
          <Compteur
            libelle="En cours"
            valeur={String(enCours)}
            note="Ni terminées, ni annulées"
          />
          <Compteur
            libelle="Terminées"
            valeur={String(terminees)}
            note="Réception confirmée, fonds libérés"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <h2 className="font-titre text-lg font-bold text-heading">
            Mes commandes
          </h2>
        </div>

        <CarteListe>
          {orders.length === 0 ? (
            <ListeVide
              titre="Aucune commande pour l'instant"
              explication="Vos achats apparaîtront ici dès qu'un vendeur vous aura envoyé un lien de paiement KOLI."
            />
          ) : (
            <table className="w-full min-w-[54rem] border-collapse">
              <caption className="sr-only">
                Vos commandes, de la plus récente à la plus ancienne
              </caption>
              <EnTeteTableau>
                <Colonne>Référence</Colonne>
                <Colonne>Vendeur</Colonne>
                <Colonne>Statut</Colonne>
                <Colonne aDroite>Total</Colonne>
                <Colonne>Passée le</Colonne>
                <Colonne aDroite>Actions</Colonne>
              </EnTeteTableau>

              <tbody>
                {orders.map((order) => (
                  <LigneTableau key={order.id}>
                    <Cellule>
                      <span className="font-mono text-sm font-bold text-brand">
                        {order.reference}
                      </span>
                    </Cellule>

                    <Cellule>
                      <span className="block max-w-[16rem] whitespace-normal font-semibold text-ink">
                        {order.seller.businessName}
                      </span>
                    </Cellule>

                    <Cellule>
                      <Pastille classes={classesBadgeStatut(order.status)}>
                        {libelleStatut(order.status)}
                      </Pastille>
                    </Cellule>

                    {/*
                      * ⚠ La devise vient de la COMMANDE, jamais d'un défaut.
                      *
                      * Cet écran affichait `formatCFA(...)` — c'est-à-dire XOF
                      * écrit en dur. Un acheteur qui commande à Kinshasa y
                      * lisait ses totaux en francs CFA, soit environ quatre
                      * fois leur valeur, sans que rien ne le signale. Et
                      * contrairement au vendeur, le client achète à PLUSIEURS
                      * vendeurs : deux lignes voisines peuvent légitimement
                      * porter deux monnaies.
                      */}
                    <Cellule aDroite>
                      <span className="font-semibold text-ink">
                        {formatMontant(totalDe(order), commeDevise(order.currency))}
                      </span>
                    </Cellule>

                    <Cellule>
                      <span className="text-ink-muted">
                        {JOUR_FR.format(order.createdAt)}
                      </span>
                    </Cellule>

                    <Cellule aDroite>
                      <Link
                        href={`/pay/${order.reference}`}
                        aria-label={`Suivre la commande ${order.reference}`}
                        title="Suivi"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors hover:bg-brand-border"
                      >
                        <Icone nom="colis" className="h-4 w-4" />
                      </Link>
                    </Cellule>
                  </LigneTableau>
                ))}
              </tbody>
            </table>
          )}
        </CarteListe>
      </main>
    </div>
  );
}
