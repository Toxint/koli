import Link from "next/link";
import { LogoKoli } from "@/components/ui/LogoKoli";

interface AuthHeaderProps {
  title: string;
  subtitle: string;
}

export function AuthHeader({ title, subtitle }: AuthHeaderProps) {
  return (
    <div className="text-center mb-8">
      <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
        <LogoKoli
          taille={48}
          className="shrink-0 transition-transform group-hover:scale-105"
        />
        <div className="text-left">
          <span className="font-semibold text-2xl tracking-tight text-brand dark:text-white">
            KOLI
          </span>
          {/* Disparaît dès que le paiement devient réel — la règle est dans
              `app/globals.css`. Ce bandeau coiffe la connexion ET
              l'inscription : c'est la première chose que voit un nouveau
              venu, et ce serait la première chose fausse qu'il lirait. */}
          <span
            data-mention-test=""
            className="block text-[10px] font-semibold text-brand dark:text-emerald-400 uppercase tracking-widest -mt-1"
          >
            Mode Test MVP
          </span>
        </div>
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-brand dark:text-white tracking-tight">
        {title}
      </h1>
      <p className="text-sm text-ink-muted dark:text-slate-400 mt-2 max-w-sm mx-auto">
        {subtitle}
      </p>
    </div>
  );
}
