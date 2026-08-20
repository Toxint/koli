import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  themeColor: "#059669",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      {/* `dark:text-slate-100` est indispensable : sans lui, tout texte sans
          classe de couleur explicite heritait d'un gris tres fonce. Sur la page
          de paiement en mode sombre, le destinataire et l'adresse de livraison
          etaient de fait invisibles. */}
      <body className="font-sans bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
