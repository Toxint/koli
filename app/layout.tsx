import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { DefinitionsLogoKoli } from "@/components/ui/LogoKoli";
import { getPaymentMode } from "@/lib/config/mode";

/**
 * Plus Jakarta Sans — dessinee pour les interfaces : elegante aux grandes
 * tailles, lisible en petit corps sur mobile.
 *
 * Quatre graisses seulement (400/500/600/700) : chaque graisse est un fichier
 * a telecharger, et le public vise est majoritairement sur reseau mobile
 * lent (§70). `display: "swap"` affiche immediatement le texte avec la police
 * systeme plutot que de laisser un blanc le temps du chargement.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

/**
 * Inter — reservee aux GRANDS TITRES de la vitrine.
 *
 * Jakarta est faite pour les interfaces : ses formes s'ouvrent en petit corps,
 * mais a 80 pixels elles paraissent molles. Inter tient l'echelle : dessin
 * neutre, chasse serree, tres lisible en graisse extreme — c'est ce qui donne
 * aux titres leur densite.
 *
 * Deux graisses seulement, et uniquement sur la vitrine : un visiteur sur
 * reseau mobile lent ne telecharge pas une police de plus pour consulter son
 * tableau de bord.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-titre-source",
  display: "swap",
});

/**
 * Instrument Serif — un seul mot, en italique.
 *
 * Trois verbes a l'imperatif alignes forment un bloc dur. Poser le dernier en
 * serif italique casse la repetition et designe l'endroit ou tout se joue : la
 * validation du client, seul moment ou l'argent change de mains.
 *
 * Une graisse, un style. Elle ne sert nulle part ailleurs.
 */
const serifAccent = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["italic"],
  variable: "--font-accent-source",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "KOLI — Achetez. Recevez. Validez.",
    template: "%s · KOLI",
  },
  description:
    "KOLI sécurise vos achats en ligne et facilite les transactions entre clients et vendeurs.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#047857",
};

/**
 * Efface le souvenir du menu LATÉRAL, qui n'existe plus.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Le menu est passé d'une barre latérale repliable à une barre            │
 * │  HORIZONTALE. Il n'occupe plus de colonne, et rien ne se replie.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Ce script rétablissait la largeur repliée avant la première peinture. Laissé
 * tel quel, il réintroduirait **4,75 rem de marge fantôme** à gauche de chaque
 * page — mais seulement pour les gens qui avaient replié l'ancien menu. Un
 * défaut invisible sur cette machine, et bien réel chez eux.
 *
 * Il retire donc la clef au lieu de la lire. Une fois passée chez tout le
 * monde, cette ligne pourra disparaître à son tour.
 *
 * Le `try` reste indispensable : `localStorage` lève en navigation privée sur
 * certains navigateurs, et une exception ici casserait tout le document.
 */
const OUBLIER_ANCIEN_MENU = `try{localStorage.removeItem('koli-menu-replie')}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${jakarta.variable} ${inter.variable} ${serifAccent.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: OUBLIER_ANCIEN_MENU }} />
      </head>
      {/*
       * Le mode de paiement, porte par le DOCUMENT.
       *
       * Les mentions « mode test — aucun paiement reel » sont ecrites dans une
       * vingtaine d'ecrans, dont quatre composants CLIENT et le menu lateral,
       * appele depuis vingt-sept pages. Leur passer un prop, c'etait
       * vingt-sept occasions d'en oublier un — et la page oubliee aurait menti
       * en pretendant qu'aucun argent ne circule pendant qu'on preleve.
       *
       * Une seule source, ici, et une regle CSS qui masque `[data-mention-test]`
       * des que le mode n'est plus `test` (voir `app/globals.css`). Zero
       * JavaScript : le §70 vise des telephones sur reseau lent, et un
       * fournisseur de contexte sur chaque page pour un booleen serait cher
       * paye.
       */}
      <body
        data-mode-paiement={getPaymentMode()}
        className="bg-cream text-ink antialiased"
      >
        {/*
         * Les degrades de la marque, definis UNE FOIS pour toute
         * l'application. Voir `LogoKoli` : un degrade SVG se designe par
         * identifiant, et les repeter a chaque instance ferait soit du
         * JavaScript sur chaque page, soit des identifiants dupliques dont
         * seule la premiere occurrence compte.
         *
         * En tete du `body` et non en pied : un `<defs>` rendu APRES le
         * premier logo laisse celui-ci sans remplissage le temps d'une image
         * — un clignotement bref, mais bien visible au chargement.
         */}
        <DefinitionsLogoKoli />
        {children}
      </body>
    </html>
  );
}
