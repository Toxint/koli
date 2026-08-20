import Link from "next/link";

interface AuthHeaderProps {
  title: string;
  subtitle: string;
}

export function AuthHeader({ title, subtitle }: AuthHeaderProps) {
  return (
    <div className="text-center mb-8">
      <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
        <div className="w-12 h-12 rounded-xl bg-brand flex items-center justify-center text-white font-semibold text-2xl shadow-lg shadow-brand/25 group-hover:scale-105 transition-transform">
          K
        </div>
        <div className="text-left">
          <span className="font-semibold text-2xl tracking-tight text-brand dark:text-white">
            KOLI
          </span>
          <span className="block text-[10px] font-semibold text-brand dark:text-emerald-400 uppercase tracking-widest -mt-1">
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
