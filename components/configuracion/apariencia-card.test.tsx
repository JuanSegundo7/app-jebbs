// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AparienciaCard } from "@/components/configuracion/apariencia-card";
import { DEFAULT_APP_SETTINGS } from "@/lib/settings/defaults";

// Covers what the redesign asks for: no mutate on every picker tick
// (debounced instead), "Restaurar predeterminado" resets the draft, and the
// live preview never calls the mutation on its own.

const mutate = vi.fn();

vi.mock("@/lib/hooks/use-app-settings", () => ({
  useSettings: () => ({
    business_name: "JEBBS BURGERS",
    pickup_address: "479 n2539 e 20 y 21",
    whatsapp_template: "",
    delivery_template: "",
    default_delivery_fee: 2000,
    pedidosya_commission_pct: 0,
    default_delivery_minutes: 30,
    primary_color_light: "#123456",
    primary_color_dark: "#654321",
    logo_url: null,
    surface_tint: null,
  }),
  useUpdateAppSettings: () => ({
    mutate,
    isPending: false,
  }),
}));

vi.mock("@/lib/hooks/use-image-upload", () => ({
  useImageUpload: () => ({
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
    isUploading: false,
    uploadProgress: 0,
  }),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={(props.alt as string) ?? ""} {...props} />;
  },
}));

beforeEach(() => {
  mutate.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  cleanup();
});

describe("AparienciaCard", () => {
  it("does not call the update mutation until the ~400ms debounce elapses", () => {
    render(<AparienciaCard />);

    const lightPicker = screen.getByLabelText("Color principal, modo claro");
    fireEvent.change(lightPicker, { target: { value: "#00ff00" } });

    expect(mutate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(399);
    expect(mutate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ primary_color_light: "#00ff00" }),
    );
  });

  it("does not re-fire the mutation for every picker tick, only after the user stops", () => {
    render(<AparienciaCard />);

    const lightPicker = screen.getByLabelText("Color principal, modo claro");
    fireEvent.change(lightPicker, { target: { value: "#111111" } });
    vi.advanceTimersByTime(200);
    fireEvent.change(lightPicker, { target: { value: "#222222" } });
    vi.advanceTimersByTime(200);
    fireEvent.change(lightPicker, { target: { value: "#333333" } });

    expect(mutate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ primary_color_light: "#333333" }),
    );
  });

  it('"Restaurar predeterminado" resets the draft to DEFAULT_APP_SETTINGS values', () => {
    render(<AparienciaCard />);

    const restoreButton = screen.getByRole("button", { name: "Restaurar predeterminado" });
    fireEvent.click(restoreButton);

    const lightPicker = screen.getByLabelText("Color principal, modo claro") as HTMLInputElement;
    const darkPicker = screen.getByLabelText("Color principal, modo oscuro") as HTMLInputElement;
    expect(lightPicker.value).toBe(DEFAULT_APP_SETTINGS.primary_color_light);
    expect(darkPicker.value).toBe(DEFAULT_APP_SETTINGS.primary_color_dark);
  });

  it("renders a live preview that never triggers the update mutation by itself", () => {
    render(<AparienciaCard />);

    expect(screen.getByTestId("apariencia-preview")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(mutate).not.toHaveBeenCalled();
  });
});
