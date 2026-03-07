"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        console.warn("Teacher layout: Unauthenticated user, redirecting back to login");
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      
      if (profile?.role === "teacher" || profile?.role === "admin") {
        setAuthorized(true);
      } else {
        // Students cannot access teacher routes
        router.push("/dashboard");
      }
    };

    checkAccess();
  }, [router]);

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <Loader2 className="animate-spin text-indigo-500 w-12 h-12" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 transition-colors pt-8 pb-32">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
