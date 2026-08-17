import { launchConfig } from "@/launch.config";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-neutral-500">
        <span>
          © {new Date().getFullYear()} {launchConfig.name}
        </span>
        <span className="text-neutral-400">{launchConfig.tagline}</span>
      </div>
    </footer>
  );
}
