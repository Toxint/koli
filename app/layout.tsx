import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

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
    <html lang="fr" className={jakarta.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: RETABLIR_MENU }} />
      </head>
      <body className="bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
