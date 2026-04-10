import Link from "next/link";
import { HeartPulse, Mic, MonitorSmartphone } from "lucide-react";

const routes = [
  {
    href: "/grandpa",
    title: "Grandpa app",
    description: "Open the simple voice companion Grandpa uses.",
    icon: Mic,
  },
  {
    href: "/family",
    title: "Family app",
    description: "Open the caregiver view with care updates.",
    icon: HeartPulse,
  },
  {
    href: "/demo",
    title: "Care session",
    description: "Show Grandpa and family together for judges and video.",
    icon: MonitorSmartphone,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f6f1] px-4 py-8 text-zinc-950">
      <section className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl flex-col justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
          CareKaki
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Care without constant calling.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-600">
          A voice companion for Grandpa and a calm care app for family.
        </p>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {routes.map((route) => {
            const Icon = route.icon;
            return (
              <Link
                key={route.href}
                href={route.href}
                className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
              >
                <Icon className="h-7 w-7 text-emerald-700" />
                <h2 className="mt-5 text-xl font-semibold">{route.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  {route.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
