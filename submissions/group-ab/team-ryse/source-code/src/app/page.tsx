import type { Metadata } from "next";
import { SimulatorClient } from "./_features/simulator-client";

export const dynamic = "force-dynamic";

export default function AISimulatorPage() {
  return (
    <div className="container mx-auto py-10">
      <div className="text-center mb-6">
        <h1 className="font-medium text-2xl tracking-wide">
          AI Trial Simulator
        </h1>
      </div>
      <div className="mx-auto max-w-5xl">
        <SimulatorClient />
      </div>
    </div>
  );
}
