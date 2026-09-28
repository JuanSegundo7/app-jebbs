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

// PostgREST error: "table/column not found in schema cache" — the near-
// certain cause is that this client's DB never had scripts/022 (or a
// preceding migration) run against it. It is a manual per-client setup
// step, not a code bug — but surfacing Postgres' raw English sentence in a
// toast ("Could not find the column 'surface_tint' of 'app_settings' in the
// schema cache") IS a bug: it explains nothing to a non-technical shop
// owner. Mapped to a fixed, actionable message instead; every other code
// keeps a generic message with the technical code appended separately
// (never the raw Postgres sentence, which may leak schema/column names).
const SCHEMA_NOT_INSTALLED_CODE = "PGRST205";
const SCHEMA_NOT_INSTALLED_MESSAGE =
  "No se pudo guardar: la base de datos de este negocio todavía no tiene la Configuración instalada. Avisá al soporte.";
const GENERIC_SAVE_ERROR_MESSAGE = "No se pudo guardar la configuración. Intentá de nuevo.";

export function mapAppSettingsErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (error?.code === SCHEMA_NOT_INSTALLED_CODE) {
    return SCHEMA_NOT_INSTALLED_MESSAGE;
  }
  return error?.code ? `${GENERIC_SAVE_ERROR_MESSAGE} (código: ${error.code})` : GENERIC_SAVE_ERROR_MESSAGE;
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
      toast.error(mapAppSettingsErrorMessage(error));
    },
  });
}
