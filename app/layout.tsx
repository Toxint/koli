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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={jakarta.variable}>
      <body className="bg-white text-ink antialiased">{children}</body>
    </html>
  );
}
