import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { DefinitionsLogoKoli } from "@/components/ui/LogoKoli";

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
 * Rétablit l'état du menu latéral AVANT le premier rendu.
 *
 * Sans cela, la page s'affiche menu déployé puis se replie une fois React
 * monté : un sursaut de mise en page à chaque navigation, pour qui a choisi de
 * replier. Le script est minuscule et synchrone, précisément pour s'exécuter
 * avant la peinture.
 *
 * Le `try` est indispensable : `localStorage` lève en navigation privée sur
 * certains navigateurs, et une exception ici casserait tout le document.
 */
const RETABLIR_MENU = `try{
  if(localStorage.getItem('koli-menu-replie')==='1'){
    document.documentElement.style.setProperty('--largeur-menu','4.75rem');
    document.documentElement.dataset.menuKoliReplie='1';
  }
}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${jakarta.variable} ${inter.variable} ${serifAccent.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: RETABLIR_MENU }} />
      </head>
      <body className="bg-cream text-ink antialiased">
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
