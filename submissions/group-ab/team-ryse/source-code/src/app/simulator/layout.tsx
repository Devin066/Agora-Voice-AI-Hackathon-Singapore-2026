"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function ConvoV3Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Sidebar side="left" variant="sidebar" collapsible="offcanvas">
        <SidebarHeader className="border-b border-black p-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
            Script & Notes
          </span>
        </SidebarHeader>
        <SidebarContent className="p-4 space-y-3">
          <div className="p-3 border-2 border-black bg-zinc-50 text-xs">
            <p className="font-bold mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Argument 1
            </p>
            <p className="text-black leading-relaxed">
              Thank you, Your Honor. We would like to emphasize that our client,
              Fitria, has worked faithfully. However, simply because of 50
              matches, the company immediately terminated her employment without
              going through the stages of SP 1 through SP 3. Isn't this overly
              reactive and inhumane?
            </p>
          </div>
          <div className="p-3 border-2 border-black bg-zinc-50 text-xs">
            <p className="font-bold mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Argument 2
            </p>
            <p className="text-black leading-relaxed">
              However, we question the process by which the "Confession Letter"
              was issued. Our client was under psychological pressure at the
              time. Without legal representation, she was forced to confess to
              her actions in order to return home. Does the company have other
              physical evidence, such as CCTV footage?
            </p>
          </div>
          <div className="p-3 border-2 border-black bg-zinc-50 text-xs">
            <p className="font-bold mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
              Argument 3
            </p>
            <p className="text-black leading-relaxed">
              Even though she was found guilty, our client still has the right
              to her future. We demand full severance pay and long-service
              bonuses. The value of 50 matches is not worth the loss of our
              client's livelihood.
            </p>
          </div>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2">
          <SidebarTrigger />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
