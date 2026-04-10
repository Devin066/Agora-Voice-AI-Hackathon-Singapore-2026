"use client";

import { ArrowRight, BriefcaseIcon, Check, GraduationCap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Step = "persona" | "role" | "case";
type Persona = "law_student" | "professional";
type Role = "prosecutor" | "defense_attorney";

const personas = [
  {
    id: "law_student" as Persona,
    title: "Law Student",
    imageSrc: "/img/01lawstudent.png",
    subtitle: "Structured & Guided",
    features: [
      "Step-by-step guidance throughout",
      "AI-powered suggestions & hints",
      "Simplified legal concepts",
      "Practice mode with feedback",
      "Learning-focused atmosphere",
    ],
    icon: GraduationCap,
    accent: "blue",
  },
  {
    id: "professional" as Persona,
    title: "Legal Professional",
    imageSrc: "/img/02professional.png",
    subtitle: "Advanced & Realistic",
    features: [
      "Real courtroom dynamics",
      "Complex legal scenarios",
      "High-stakes decision making",
      "Minimal assistance",
      "Professional intensity",
    ],
    icon: BriefcaseIcon,
    accent: "amber",
  },
];

const roles = [
  {
    id: "prosecutor" as Role,
    title: "Prosecutor",
    subtitle: "Present evidence to prove guilt",
    description:
      "Your duty is to present a compelling case and convince the court of the defendant's guilt.",
    icon: "scale",
    color: "blue",
  },
  {
    id: "defense_attorney" as Role,
    title: "Defense Attorney",
    subtitle: "Defend the accused",
    description:
      "Your mission is to protect the rights of the accused and provide the strongest defense possible.",
    icon: "shield",
    color: "emerald",
  },
];

const cases = [
  { id: "theft-001", title: "Theft Case", subtitle: "Property Crime" },
  { id: "fraud-001", title: "Fraud Case", subtitle: "Financial Crime" },
  { id: "assault-001", title: "Assault Case", subtitle: "Violent Crime" },
];

export function SimulatorClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("persona");
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  const handlePersonaSelect = (persona: Persona) => {
    setSelectedPersona(persona);
    setTimeout(() => setStep("role"), 400);
  };

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setTimeout(() => setStep("case"), 400);
  };

  const handleCaseSelect = (caseId: string) => {
    if (selectedRole) {
      router.push(
        `/simulator?case=${caseId}&persona=${selectedPersona}&role=selectedRole`,
      );
    }
  };

  if (step === "persona") {
    return (
      <div className="flex flex-col items-center">
        <div className="text-center mb-6">
          <h2 className="font-medium text-xl tracking-wide">
            Select Character
          </h2>
        </div>

        <div className="w-full max-w-5xl rounded-[28px] border border-border/60 bg-card/20 p-3 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.8)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {personas.map((persona, index) => {
              const isSelected = selectedPersona === persona.id;

              return (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => handlePersonaSelect(persona.id)}
                  className={cn(
                    "relative isolate overflow-hidden rounded-[22px] border transition-all duration-300",
                    "h-[360px] sm:h-[460px]",
                    "bg-background/40 hover:bg-background/60",
                    "hover:-translate-y-1 hover:shadow-[0_30px_80px_-55px_rgba(0,0,0,0.95)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    index === 0 ? "sm:rounded-r-[16px]" : "sm:rounded-l-[16px]",
                    isSelected
                      ? persona.accent === "blue"
                        ? "border-blue-400 shadow-[0_0_0_2px_rgba(96,165,250,0.65),0_0_40px_rgba(59,130,246,0.55),0_45px_120px_-70px_rgba(59,130,246,1)]"
                        : "border-amber-300 shadow-[0_0_0_2px_rgba(252,211,77,0.65),0_0_40px_rgba(245,158,11,0.55),0_45px_120px_-70px_rgba(245,158,11,1)]"
                      : "border-border/60 hover:border-muted-foreground/50",
                  )}
                >
                  <div
                    className={cn(
                      "pointer-events-none absolute inset-0 rounded-[22px] ring-0 transition-all duration-300",
                      isSelected
                        ? persona.accent === "blue"
                          ? "ring-4 ring-blue-400/70 drop-shadow-[0_0_24px_rgba(59,130,246,0.9)]"
                          : "ring-4 ring-amber-300/70 drop-shadow-[0_0_24px_rgba(245,158,11,0.9)]"
                        : "group-hover:ring-2 group-hover:ring-primary/30 group-hover:drop-shadow-[0_0_18px_rgba(255,255,255,0.18)]",
                    )}
                  />
                  <div
                    className={cn(
                      "absolute inset-0 transition-opacity duration-300",
                      persona.accent === "blue"
                        ? "bg-[radial-gradient(90%_80%_at_50%_25%,rgba(59,130,246,0.65),rgba(59,130,246,0.14)_55%,rgba(0,0,0,0)_100%)]"
                        : "bg-[radial-gradient(90%_80%_at_50%_25%,rgba(245,158,11,0.65),rgba(245,158,11,0.14)_55%,rgba(0,0,0,0)_100%)]",
                    )}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/35 to-background/0" />

                  <div className="relative h-full flex items-end justify-center px-6 pt-6">
                    <img
                      src={persona.imageSrc}
                      alt={persona.title}
                      className={cn(
                        "h-[88%] w-auto max-w-full object-contain transition-all duration-300",
                        "drop-shadow-[0_35px_70px_rgba(0,0,0,0.6)]",
                        isSelected
                          ? "scale-[1.02] saturate-110 contrast-105"
                          : "group-hover:scale-[1.01] group-hover:saturate-110",
                      )}
                    />
                  </div>

                  <div className="absolute inset-x-4 bottom-4">
                    <div
                      className={cn(
                        "rounded-lg border bg-background/55 backdrop-blur px-4 py-3 text-center transition-colors duration-300",
                        isSelected
                          ? persona.accent === "blue"
                            ? "border-blue-500/60 bg-blue-500/10"
                            : "border-amber-500/60 bg-amber-500/10"
                          : "border-border/60 group-hover:border-primary/30",
                      )}
                    >
                      <div className="text-sm font-semibold tracking-[0.18em] uppercase">
                        {persona.title}
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "absolute top-4 right-4 size-10 rounded-full border flex items-center justify-center transition-all duration-300",
                      "bg-background/25 backdrop-blur",
                      isSelected
                        ? persona.accent === "blue"
                          ? "border-blue-500/80 bg-blue-500/15 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                          : "border-amber-500/80 bg-amber-500/15 shadow-[0_0_0_1px_rgba(245,158,11,0.35)]"
                        : "border-border/60 group-hover:border-primary/40 group-hover:bg-background/35",
                    )}
                  >
                    {isSelected && (
                      <Check
                        className={cn(
                          "size-5",
                          persona.accent === "blue"
                            ? "text-blue-400"
                            : "text-amber-300",
                        )}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (step === "role") {
    return (
      <div className="flex flex-col items-center">
        <div className="text-center mb-8">
          <h2 className="font-medium text-xl mb-2">Select Your Role</h2>
          <p className="text-sm text-muted-foreground">
            Choose your position in the courtroom
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-2xl">
          {roles.map((role) => {
            const isSelected = selectedRole === role.id;

            return (
              <button
                key={role.id}
                type="button"
                onClick={() => handleRoleSelect(role.id)}
                className={cn(
                  "relative p-6 rounded-xl border-2 text-left transition-all duration-300 group",
                  isSelected
                    ? role.color === "blue"
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-emerald-500 bg-emerald-500/10"
                    : "border-border hover:border-muted-foreground/50 bg-card/50",
                )}
              >
                <div
                  className={cn(
                    "w-12 h-12 rounded-lg flex items-center justify-center mb-4",
                    role.color === "blue"
                      ? "bg-blue-500/20 text-blue-500"
                      : "bg-emerald-500/20 text-emerald-500",
                  )}
                >
                  {role.icon === "scale" ? (
                    <svg
                      className="size-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <title>Scale</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="size-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <title>Shield</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  )}
                </div>

                <h3 className="font-medium text-lg mb-1">{role.title}</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  {role.subtitle}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  {role.description}
                </p>

                <div
                  className={cn(
                    "absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                    isSelected
                      ? role.color === "blue"
                        ? "border-blue-500 bg-blue-500"
                        : "border-emerald-500 bg-emerald-500"
                      : "border-border group-hover:border-muted-foreground/50",
                  )}
                >
                  {isSelected && <Check className="size-3 text-white" />}
                </div>
              </button>
            );
          })}
        </div>
        <Button
          variant="ghost"
          onClick={() => setStep("persona")}
          className="mt-6 text-muted-foreground"
        >
          <ArrowRight className="size-4 mr-1 rotate-180" />
          Back
        </Button>
      </div>
    );
  }

  if (step === "case") {
    const indonesiaCases = cases.filter((c) => c.id === "theft-001");
    const singaporeCases = cases
      .filter((c) => c.id !== "theft-001")
      .map((c) => ({ ...c, comingSoon: true as const }));

    return (
      <div className="flex flex-col items-center">
        <div className="text-center mb-8">
          <h2 className="font-medium text-xl mb-2">Choose a Case</h2>
          <p className="text-sm text-muted-foreground">
            Select a case to begin your trial
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-5xl">
          <div className="rounded-2xl border border-border/60 bg-card/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl leading-none">🇮🇩</span>
                <h3 className="text-sm font-semibold tracking-wide">
                  Indonesia Case
                </h3>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {indonesiaCases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCaseSelect(c.id)}
                  className="w-full p-4 rounded-xl border-2 border-border bg-card/50 text-left hover:border-muted-foreground/60 hover:bg-muted/30 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{c.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {c.subtitle}
                      </p>
                    </div>
                    <ArrowRight className="size-5 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="relative rounded-2xl border border-border/60 bg-card/20 p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl leading-none">🇸🇬</span>
                <h3 className="text-sm font-semibold tracking-wide">
                  Singapore Case
                </h3>
              </div>
            </div>

            <div className="flex flex-col gap-3 blur-[3px] opacity-60">
              {singaporeCases.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled
                  className="w-full p-4 rounded-xl border-2 border-border/60 bg-card/30 text-left"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-medium">{c.title}</h4>
                      <p className="text-sm text-muted-foreground">
                        {c.subtitle}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs rounded-full border border-border/70 bg-background/40 px-3 py-1 text-muted-foreground">
                      Coming Soon
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-2xl border border-border/60 bg-background/40 px-6 py-4 backdrop-blur-md shadow-[0_30px_80px_-55px_rgba(0,0,0,0.95)]">
                <div className="text-center">
                  <div className="text-3xl font-semibold tracking-[0.2em] uppercase">
                    Coming Soon
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground tracking-wide">
                    Singapore cases are not available yet
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          onClick={() => setStep("role")}
          className="mt-6 text-muted-foreground"
        >
          <ArrowRight className="size-4 mr-1 rotate-180" />
          Back
        </Button>
      </div>
    );
  }

  return null;
}
