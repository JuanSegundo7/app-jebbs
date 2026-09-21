"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings/defaults";
import type { AppSettings } from "@/lib/types";

export function useAppSettings() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) throw error;
      return data as AppSettings;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Nunca undefined: degrada a los defaults sembrados por
// scripts/018-app-settings.sql mientras la query está en vuelo, si falló,
// o si la fila no existe todavía.
export function useSettings(): AppSettings {
  const { data } = useAppSettings();
  return data ?? DEFAULT_APP_SETTINGS;
}

export function useUpdateAppSettings() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => {
      const { data, error } = await supabase
        .from("app_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select()
        .single();

      if (error) throw error;
      return data as AppSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
    onError: (error: any) => {
      console.error("Error al actualizar la configuración:", error);
      toast.error("Error al actualizar la configuración: " + error.message);
    },
  });
}
