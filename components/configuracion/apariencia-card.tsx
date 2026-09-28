"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSettings, useUpdateAppSettings } from "@/lib/hooks/use-app-settings";
import { useImageUpload } from "@/lib/hooks/use-image-upload";
import { resizeImageToPng } from "@/lib/utils/resizeImageToPng";
import { toast } from "sonner";
import { ColorInput } from "./color-input";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings/defaults";
import { deriveAccentPalette } from "@/lib/utils/deriveAccentPalette";
import { deriveSurfaceTint } from "@/lib/utils/deriveSurfaceTint";
import { accentPaletteToCssVars, surfaceTintToCssVars } from "@/lib/utils/themeCssVars";

// Redesign: the 3 color pickers (light accent, dark accent, background
// tint) used to call updateSettings.mutate() directly on every onChange,
// including every tick while dragging a native color picker. Now they write
// to a local draft and save through a ~400ms debounce, with an explicit
// "Guardar" button for saving right away.
const SAVE_DEBOUNCE_MS = 400;

interface AppearanceDraft {
  primary_color_light: string;
  primary_color_dark: string;
  surface_tint: string | null;
}

function draftFromSettings(settings: {
  primary_color_light: string;
  primary_color_dark: string;
  surface_tint: string | null;
}): AppearanceDraft {
  return {
    primary_color_light: settings.primary_color_light,
    primary_color_dark: settings.primary_color_dark,
    surface_tint: settings.surface_tint,
  };
}

// Read-only view of the current theme, NEVER writes document.documentElement
// (that's theme-color-provider.tsx's job). Used only to decide which half of
// the draft (light/dark) to show in the preview.
function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    const target = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(target.classList.contains("dark")));
    observer.observe(target, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export function AparienciaCard() {
  const settings = useSettings();
  const updateSettings = useUpdateAppSettings();
  const logoUpload = useImageUpload("branding", "logo/");
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resizedBlob = await resizeImageToPng(file);
      const resizedFile = new File([resizedBlob], "logo.png", { type: "image/png" });
      if (settings.logo_url) {
        await logoUpload.deleteImage(settings.logo_url);
      }
      const url = await logoUpload.uploadImage(resizedFile);
      updateSettings.mutate({ logo_url: url });
    } catch (error) {
      toast.error("No se pudo subir el logo");
    } finally {
      e.target.value = ""; // permite re-seleccionar el mismo archivo
    }
  };

  const handleRemoveLogo = async () => {
    if (settings.logo_url) {
      await logoUpload.deleteImage(settings.logo_url);
    }
    updateSettings.mutate({ logo_url: null });
  };

  const [draft, setDraft] = useState<AppearanceDraft>(() => draftFromSettings(settings));
  const [isDirty, setIsDirty] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDark = useIsDarkTheme();

  // No re-seed while there's an unsaved draft — a background refetch
  // (staleTime 5min, refetch on focus) must not clobber a half-picked color.
  useEffect(() => {
    if (!isDirty) setDraft(draftFromSettings(settings));
  }, [settings.primary_color_light, settings.primary_color_dark, settings.surface_tint, isDirty]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const scheduleSave = (next: AppearanceDraft) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      updateSettings.mutate(next);
      setIsDirty(false);
      saveTimeoutRef.current = null;
    }, SAVE_DEBOUNCE_MS);
  };

  const updateDraft = (patch: Partial<AppearanceDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setIsDirty(true);
    scheduleSave(next);
  };

  const handleSaveNow = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    updateSettings.mutate(draft);
    setIsDirty(false);
  };

  const handleRestoreDefaults = () => {
    updateDraft({
      primary_color_light: DEFAULT_APP_SETTINGS.primary_color_light,
      primary_color_dark: DEFAULT_APP_SETTINGS.primary_color_dark,
      surface_tint: DEFAULT_APP_SETTINGS.surface_tint,
    });
  };

  const handleRemoveTint = () => {
    updateDraft({ surface_tint: null });
  };

  // Live preview: CSS variables LOCAL to this container, never on
  // document.documentElement — so trying a color doesn't affect the rest of
  // the screen while the draft is unsaved. Reuses the same pure functions
  // and the same token mapping theme-color-provider.tsx uses for <html>, so
  // preview and real behavior can never diverge.
  const previewMode = isDark ? "dark" : "light";
  const previewBaseHex = isDark ? draft.primary_color_dark : draft.primary_color_light;
  const previewPalette = deriveAccentPalette(previewBaseHex, previewMode);
  const previewTint = deriveSurfaceTint(draft.surface_tint, previewMode);
  const previewStyle: React.CSSProperties = {
    ...accentPaletteToCssVars(previewPalette),
    ...surfaceTintToCssVars(previewTint),
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Apariencia</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
          <div className="flex items-center gap-3">
            <Image
              src={settings.logo_url ?? "/jebbs.jpg"}
              alt="Logo"
              width={48}
              height={48}
              className="h-12 w-12 rounded-lg object-cover border border-input"
            />
            <div>
              <p className="font-medium">Logo del negocio</p>
              <p className="text-caption text-muted-foreground">Aparece en el sidebar, el login y el ticket de cocina</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
            <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={logoUpload.isUploading}>
              {logoUpload.isUploading ? "Subiendo..." : "Cambiar imagen"}
            </Button>
            {settings.logo_url && (
              <Button variant="ghost" size="sm" onClick={handleRemoveLogo}>
                Quitar
              </Button>
            )}
          </div>
        </div>

        <ColorInput
          label="Color principal (modo claro)"
          hint="Botones, links y acentos cuando la app está en modo claro"
          value={draft.primary_color_light}
          onChange={(hex) => updateDraft({ primary_color_light: hex })}
          pickerAriaLabel="Color principal, modo claro"
        />

        <ColorInput
          label="Color principal (modo oscuro)"
          hint="Botones, links y acentos cuando la app está en modo oscuro"
          value={draft.primary_color_dark}
          onChange={(hex) => updateDraft({ primary_color_dark: hex })}
          pickerAriaLabel="Color principal, modo oscuro"
        />

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <ColorInput
              label="Tinte de fondo"
              hint="Un matiz sutil sobre las superficies planas (no afecta modales ni el sidebar)"
              value={draft.surface_tint ?? previewBaseHex}
              onChange={(hex) => updateDraft({ surface_tint: hex })}
              pickerAriaLabel="Tinte de fondo"
            />
          </div>
          {draft.surface_tint && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleRemoveTint}>
              Quitar
            </Button>
          )}
        </div>

        <div>
          <p className="text-caption text-muted-foreground mb-2">Vista previa</p>
          <div
            data-testid="apariencia-preview"
            className="rounded-lg border bg-surface-1 p-4 space-y-3"
            style={previewStyle}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Botón primario</Button>
              <Badge>Activo</Badge>
            </div>
            <div className="nav-rail-active bg-primary/10 text-primary w-fit rounded-md px-3 py-2 text-subheadline font-medium">
              Item de menú activo
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleRestoreDefaults} className="text-muted-foreground">
            Restaurar predeterminado
          </Button>
          <Button size="sm" onClick={handleSaveNow} disabled={!isDirty || updateSettings.isPending}>
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
