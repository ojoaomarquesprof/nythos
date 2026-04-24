"use client";

import { useEffect, useState } from "react";
import { Bell, Search, Brain } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getGreeting } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

export function Header() {
  const greeting = getGreeting();


  const userName = profile?.full_name || "Psicóloga";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4">
        {/* Left: Logo (mobile only) + Greeting */}
        <div className="flex items-center gap-3">
          {/* Mobile logo */}
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shadow-sm md:hidden">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{greeting} 👋</p>
            <h2 className="text-base font-semibold tracking-tight -mt-0.5">
              {userName}
            </h2>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Search button */}
          <button className="p-2.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <Search className="w-5 h-5" />
          </button>

          {/* Notifications */}


          {/* Avatar (mobile only) */}
          <Avatar className="w-9 h-9 md:hidden ring-2 ring-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
