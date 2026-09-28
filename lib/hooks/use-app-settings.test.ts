import { describe, expect, it } from "vitest";
import { mapAppSettingsErrorMessage } from "@/lib/hooks/use-app-settings";

// Pure mapping tested directly — no need to mount the mutation/react-query
// machinery to cover this branch.

describe("mapAppSettingsErrorMessage", () => {
  it("maps PGRST205 (table/column not found in schema cache) to the fixed support message", () => {
    const message = mapAppSettingsErrorMessage({
      code: "PGRST205",
      message: "Could not find the table 'public.app_settings' in the schema cache",
    });

    expect(message).toBe(
      "No se pudo guardar: la base de datos de este negocio todavía no tiene la Configuración instalada. Avisá al soporte.",
    );
    expect(message).not.toContain("schema cache");
  });

  it("maps any other error code to a generic message with the technical code appended separately", () => {
    const message = mapAppSettingsErrorMessage({
      code: "23503",
      message: "update or delete on table violates foreign key constraint",
    });

    expect(message).not.toContain("foreign key constraint");
    expect(message).toContain("23503");
  });

  it("falls back to the generic message with no code suffix when the error carries no code", () => {
    const message = mapAppSettingsErrorMessage({ message: "Failed to fetch" });

    expect(message).not.toContain("Failed to fetch");
    expect(message).not.toMatch(/\(código: /);
  });
});
