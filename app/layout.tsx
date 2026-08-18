import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Koli — Votre commande",
  description: "Confirmez votre commande et vos informations de livraison.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body className="font-sans text-gray-900 antialiased">{children}</body>
    </html>
  );
}
