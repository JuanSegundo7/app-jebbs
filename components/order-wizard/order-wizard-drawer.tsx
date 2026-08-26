"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useBurgers, useExtras } from "@/lib/hooks/use-menu";
import { useCustomers, useCustomerAddresses } from "@/lib/hooks/use-customers";
import { useAllCombos } from "@/lib/hooks/use-combos";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/format";
import { EditCustomerModal } from "../orders/edit/edit-customer-modal";
import { useOrderWizard } from "./hooks/use-order-wizard";
import { useMemo, useEffect } from "react";

import {
  CustomerStep,
  CombosStep,
  BurgersStep,
  SummaryStep,
} from "./steps/index";
import type { OrderSource, OrderWithItems } from "@/lib/types";
import { SidesStep } from "./steps/side-step";

interface OrderWizardDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "create" | "edit";
  orderToEdit?: OrderWithItems | null;
}

type WizardStep = "customer" | "combos" | "burgers" | "sides" | "summary";

const CUSTOMERS_PER_PAGE = 5;

export function OrderWizardDrawer({
  open,
  onOpenChange,
  mode = "create",
  orderToEdit,
}: OrderWizardDrawerProps) {
  const [step, setStep] = useState<WizardStep>("customer");
  const [customerPage, setCustomerPage] = useState(1);

  const isSubmittingRef = useRef(false);

  // ================= DATA LOADING =================
  const { data: burgers } = useBurgers();
  const { data: extras } = useExtras();
  const { data: combos } = useAllCombos();

  // ================= COMPUTED DATA =================
  const meatExtra = useMemo(
    () => extras?.find((e) => e.name === "Medallón"),
    [extras],
  );

  const friesExtra = useMemo(
    () => extras?.find((e) => e.name === "Papas fritas chicas"),
    [extras],
  );

  const availableSides = useMemo(
    () =>
      (extras?.filter((e) => e.category === "sides" && e.is_available) ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [extras],
  );

  const extrasByCategory = useMemo(() => {
    if (!extras) return {};
    const grouped = extras.reduce(
      (acc, extra) => {
        if (extra.category === "sides") return acc;
        if (!acc[extra.category]) acc[extra.category] = [];
        acc[extra.category].push(extra);
        return acc;
      },
      {} as Record<string, any[]>,
    );
    Object.values(grouped).forEach((list) =>
      list.sort((a, b) => a.name.localeCompare(b.name)),
    );
    return grouped;
  }, [extras]);

  const wizard = useOrderWizard({
    meatExtra,
    friesExtra,
    mode,
    orderToEdit,
    allBurgers: burgers || [],
    allCombos: combos || [],
    allExtras: extras || [],
  });

  // ================= RESET AL ABRIR (solo en create) =================
  useEffect(() => {
    if (open && mode === "create") {
      wizard.resetAll();
      setStep("customer");
      setCustomerPage(1);
    }
  }, [open]);

  // ================= CUSTOMER SEARCH (server-side, evita el corte de 1000 filas de PostgREST) =================
  const { data: filteredCustomers = [] } = useCustomers(
    wizard.customer.customerSearch,
  );

  // ================= CUSTOMER ADDRESSES =================
  const { data: customerAddresses, isLoading: isLoadingAddresses } =
    useCustomerAddresses(wizard.customer.selectedCustomer?.id);

  const selectedAddressObj = useMemo(() => {
    if (!customerAddresses || !wizard.customer.selectedAddress) return null;
    return customerAddresses.find(
      (addr) => addr.id === wizard.customer.selectedAddress,
    );
  }, [customerAddresses, wizard.customer.selectedAddress]);

  useEffect(() => {
    setCustomerPage(1);
  }, [wizard.customer.customerSearch]);

  const customerTotalPages = Math.ceil(
    filteredCustomers.length / CUSTOMERS_PER_PAGE,
  );

  // ================= ITEM COUNTS (para badges) =================
  const totalBurgerItems = wizard.burgers.selectedBurgers.reduce(
    (acc, b) => acc + b.quantity,
    0,
  );
  const totalComboItems = wizard.combos.selectedCombos.length;
  const totalSideItems = wizard.sides.selectedSides.reduce(
    (acc, s) => acc + s.quantity,
    0,
  );
  const totalItems = totalBurgerItems + totalComboItems + totalSideItems;

  const showTotalBar =
    step === "combos" || step === "burgers" || step === "sides";

  // ================= HANDLERS =================
  const handleClose = (open: boolean) => {
    if (!open) {
      setStep("customer");
      setCustomerPage(1);
    }
    onOpenChange(open);
  };

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    try {
      await wizard.handleSubmit();
      handleClose(false);
    } catch (error) {
      // Without this catch, any error thrown inside wizard.handleSubmit
      // (e.g. a Supabase insert failure) became an unhandled rejection: the
      // drawer stayed open, isSubmittingRef reset silently in `finally`,
      // and the user had zero indication the order was never created.
      console.error("Error al guardar el pedido:", error);
      toast.error("Error al guardar el pedido");
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleEditCustomer = () => {
    wizard.customer.setIsEditingCustomer(true);
  };

  // A PedidosYa order must never carry a `customers` row (see
  // use-order-wizard.ts's handleSubmit, which skips createCustomer for this
  // source). If a customer was already selected before switching source,
  // clear it — same reasoning as handleToggleNewCustomer below. Also clear
  // isNewCustomer/newAddressData: customer-step.tsx hides those fields once
  // source is "pedidosya", but the state itself survives underneath, and a
  // leftover address there could otherwise make hasAddress read as true in
  // summary-step.tsx. use-order-wizard.ts's handleSubmit forces pickup for
  // any "pedidosya" order regardless, so this is defense in depth, not the
  // only thing preventing a bad submit.
  const handleSourceChange = (source: OrderSource) => {
    wizard.settings.setSource(source);
    if (source === "pedidosya") {
      wizard.customer.setSelectedCustomer(null);
      wizard.customer.setSelectedAddress(undefined);
      wizard.customer.setIsNewCustomer(false);
      wizard.customer.setNewAddressData({ label: "", address: "", notes: "" });
    }
  };

  // 🔑 FIX: When toggling to "new customer", clear the previously selected
  // existing customer so the submit doesn't use stale selectedCustomer data.
  const handleToggleNewCustomer = (isNew: boolean) => {
    wizard.customer.setIsNewCustomer(isNew);
    if (isNew) {
      wizard.customer.setSelectedCustomer(null);
      wizard.customer.setSelectedAddress(undefined);
    } else {
      // Switching back to existing: clear new customer form data
      wizard.customer.setNewCustomerData({ name: "", phone: "" });
      wizard.customer.setNewAddressData({ label: "", address: "", notes: "" });
    }
  };

  // ================= STEP DEFINITIONS =================
  const steps = [
    { key: "customer", label: "Cliente" },
    { key: "combos", label: "Combos" },
    { key: "burgers", label: "Hamburguesas" },
    { key: "sides", label: "Acomp." },
    { key: "summary", label: "Resumen" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  // ================= NAVIGATION =================
  const goNext = () => {
    if (step === "customer") setStep("combos");
    else if (step === "combos") setStep("burgers");
    else if (step === "burgers") setStep("sides");
    else if (step === "sides") setStep("summary");
  };

  const goBack = () => {
    if (step === "combos") setStep("customer");
    else if (step === "burgers") setStep("combos");
    else if (step === "sides") setStep("burgers");
    else if (step === "summary") setStep("sides");
  };

  // ================= RENDER =================
  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent
          side="right"
          className="flex h-full w-full max-w-2xl flex-col p-0 sm:max-w-2xl"
        >
          {/* HEADER */}
          <SheetHeader className="border-b px-6 py-4">
            <SheetTitle className="text-lg">
              {mode === "edit"
                ? `Editar Pedido #${orderToEdit?.order_number}`
                : "Crear Pedido"}
            </SheetTitle>

            <div className="flex items-center gap-2 pt-2 overflow-x-auto pb-1">
              {steps.map((s, i) => (
                <div key={s.key} className="flex items-center shrink-0">
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                      step === s.key
                        ? "bg-primary text-primary-foreground"
                        : currentStepIndex > i
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {currentStepIndex > i ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className="ml-1.5 text-xs">{s.label}</span>
                  {i < steps.length - 1 && (
                    <div className="mx-2 h-px w-5 bg-border" />
                  )}
                </div>
              ))}
            </div>
          </SheetHeader>

          {/* CONTENT */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {step === "customer" && (
                <CustomerStep
                  source={wizard.settings.source}
                  onSourceChange={handleSourceChange}
                  customerSearch={wizard.customer.customerSearch}
                  onCustomerSearchChange={wizard.customer.setCustomerSearch}
                  filteredCustomers={filteredCustomers}
                  selectedCustomer={wizard.customer.selectedCustomer}
                  onSelectCustomer={wizard.customer.setSelectedCustomer}
                  isNewCustomer={wizard.customer.isNewCustomer}
                  onToggleNewCustomer={handleToggleNewCustomer}
                  newCustomerData={wizard.customer.newCustomerData}
                  onNewCustomerDataChange={wizard.customer.setNewCustomerData}
                  newAddressData={wizard.customer.newAddressData}
                  onNewAddressDataChange={wizard.customer.setNewAddressData}
                  selectedAddress={wizard.customer.selectedAddress}
                  onSelectAddress={wizard.customer.setSelectedAddress}
                  isLoadingAddresses={isLoadingAddresses}
                  onEditCustomer={handleEditCustomer}
                  mode={mode}
                  page={customerPage}
                  totalPages={customerTotalPages}
                />
              )}

              {step === "combos" && (
                <CombosStep
                  availableCombos={combos || []}
                  onAddCombo={wizard.combos.addCombo}
                  onRemoveCombo={wizard.combos.removeCombo}
                  selectedCombos={wizard.combos.selectedCombos}
                  availableBurgers={burgers || []}
                  getRemainingQuantity={wizard.combos.getRemainingQuantity}
                  canAddBurgerToSlot={wizard.combos.canAddBurgerToSlot}
                  onAddBurgerToSlot={wizard.combos.addBurgerToSlot}
                  onRemoveBurgerFromSlot={wizard.combos.removeBurgerFromSlot}
                  onIncreaseBurgerQty={wizard.combos.increaseBurgerQty}
                  onDecreaseBurgerQty={wizard.combos.decreaseBurgerQty}
                  onUpdateBurgerMeat={wizard.combos.updateBurgerMeat}
                  onUpdateBurgerFries={wizard.combos.updateComboBurgerFries}
                  onToggleBurgerVeggie={wizard.combos.toggleComboBurgerVeggie}
                  onSelectExtraForSlot={wizard.combos.selectExtraForSlot}
                  onRemoveExtraFromSlot={wizard.combos.removeOneExtraFromSlot}
                  onToggleBurgerIngredient={
                    wizard.combos.toggleComboBurgerIngredient
                  }
                  onToggleBurgerExtra={wizard.combos.toggleComboBurgerExtra}
                  onUpdateBurgerExtraQty={
                    wizard.combos.updateComboBurgerExtraQty
                  }
                  expandedBurgerId={wizard.combos.expandedBurgerId}
                  onToggleBurgerExpanded={wizard.combos.toggleBurgerExpanded}
                  meatExtra={meatExtra}
                  friesExtra={friesExtra}
                  extrasByCategory={extrasByCategory}
                  availableSides={availableSides}
                />
              )}

              {step === "burgers" && (
                <BurgersStep
                  availableBurgers={burgers || []}
                  onAddBurger={wizard.burgers.addBurger}
                  selectedBurgers={wizard.burgers.selectedBurgers}
                  onRemoveBurger={wizard.burgers.removeBurger}
                  onUpdateQuantity={wizard.burgers.updateQuantity}
                  onToggleIngredient={wizard.burgers.toggleIngredient}
                  onUpdateMeatCount={wizard.burgers.updateMeatCount}
                  onUpdateFriesQuantity={wizard.burgers.updateFriesQuantity}
                  onToggleVeggie={wizard.burgers.toggleVeggie}
                  onToggleExtra={wizard.burgers.toggleExtra}
                  onUpdateExtraQuantity={wizard.burgers.updateExtraQuantity}
                  expandedBurger={wizard.burgers.expandedBurger}
                  onToggleExpanded={wizard.burgers.toggleExpanded}
                  meatExtra={meatExtra}
                  friesExtra={friesExtra}
                  extrasByCategory={extrasByCategory}
                />
              )}

              {step === "sides" && (
                <SidesStep
                  availableSides={availableSides}
                  selectedSides={wizard.sides.selectedSides}
                  extrasByCategory={extrasByCategory}
                  onAddSide={wizard.sides.addSide}
                  onRemoveSide={wizard.sides.removeSide}
                  onUpdateQuantity={wizard.sides.updateQuantity}
                  onToggleExpanded={wizard.sides.toggleExpanded}
                  onToggleExtra={wizard.sides.toggleExtra}
                  onUpdateExtraQuantity={wizard.sides.updateExtraQuantity}
                />
              )}

              {step === "summary" && (
                <SummaryStep
                  isNewCustomer={wizard.customer.isNewCustomer}
                  customerName={
                    wizard.customer.selectedCustomer?.name ??
                    wizard.customer.newCustomerData.name
                  }
                  customerPhone={
                    wizard.customer.selectedCustomer?.phone ??
                    wizard.customer.newCustomerData.phone
                  }
                  selectedAddress={selectedAddressObj}
                  newAddressData={wizard.customer.newAddressData}
                  selectedBurgers={wizard.burgers.selectedBurgers}
                  selectedCombos={wizard.combos.selectedCombos}
                  selectedSides={wizard.sides.selectedSides}
                  subtotal={wizard.subtotal}
                  extrasTotal={wizard.extrasTotal}
                  orderTotal={wizard.orderTotal}
                  meatExtra={meatExtra}
                  friesExtra={friesExtra}
                  source={wizard.settings.source}
                  priceAdjustment={wizard.settings.priceAdjustment}
                  onPriceAdjustmentChange={wizard.settings.setPriceAdjustment}
                  discountType={wizard.settings.discountType}
                  discountValue={wizard.settings.discountValue}
                  discountAmount={wizard.discountAmount}
                  onDiscountTypeChange={wizard.settings.setDiscountType}
                  onDiscountValueChange={wizard.settings.setDiscountValue}
                  // Effective, not raw: for PedidosYa this reads "pickup"
                  // regardless of what settings.deliveryType still holds
                  // (see use-order-wizard.ts's effectiveDeliveryType) — so
                  // the "Envío" line in the Pedido breakdown below never
                  // shows a delivery charge that won't actually be saved.
                  // onDeliveryTypeChange still writes the real underlying
                  // setter; that's safe because the radio that calls it is
                  // hidden entirely for PedidosYa.
                  deliveryType={wizard.effectiveDeliveryType}
                  onDeliveryTypeChange={wizard.settings.setDeliveryType}
                  deliveryFee={wizard.settings.deliveryFee}
                  onDeliveryFeeChange={wizard.settings.setDeliveryFee}
                  paymentMethod={wizard.settings.paymentMethod}
                  onPaymentMethodChange={wizard.settings.setPaymentMethod}
                  notes={wizard.settings.notes}
                  onNotesChange={wizard.settings.setNotes}
                  deliveryTime={wizard.settings.deliveryTime}
                  onDeliveryTimeChange={wizard.settings.setDeliveryTime}
                />
              )}
            </div>
          </div>

          {/* TOTAL BAR */}
          {showTotalBar && (
            <div className="shrink-0 border-t bg-muted/40 px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  {totalItems > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                      {totalItems}
                    </span>
                  )}
                </div>
                <span className="text-base font-semibold text-foreground">
                  {formatCurrency(wizard.subtotal)}
                </span>
              </div>
              {totalItems > 0 && (
                <div className="mt-0.5 flex gap-3 text-xs text-muted-foreground">
                  {totalComboItems > 0 && (
                    <span>
                      {totalComboItems} combo{totalComboItems > 1 ? "s" : ""}
                    </span>
                  )}
                  {totalBurgerItems > 0 && (
                    <span>
                      {totalBurgerItems} hamburguesa
                      {totalBurgerItems > 1 ? "s" : ""}
                    </span>
                  )}
                  {totalSideItems > 0 && <span>{totalSideItems} acomp.</span>}
                </div>
              )}
            </div>
          )}

          {/* FOOTER */}
          <div className="shrink-0 flex items-center justify-between border-t px-6 py-4 z-10 bg-background">
            {step !== "customer" ? (
              <Button variant="outline" onClick={goBack} className="bg-card">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Atrás
              </Button>
            ) : (
              <div />
            )}

            {step === "customer" &&
              !wizard.customer.isNewCustomer &&
              customerTotalPages > 1 && (
                <div className="ios-glass rounded-full px-4 py-2 flex items-center gap-2 bg-card">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={customerPage === 1}
                    onClick={() => setCustomerPage((p) => p - 1)}
                  >
                    ←
                  </Button>
                  <span className="text-sm font-medium">
                    {customerPage} / {customerTotalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={customerPage === customerTotalPages}
                    onClick={() => setCustomerPage((p) => p + 1)}
                  >
                    →
                  </Button>
                </div>
              )}

            {step === "customer" && (
              <Button
                onClick={goNext}
                disabled={!wizard.canProceedFromCustomer}
              >
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "combos" && (
              <Button onClick={goNext} disabled={!wizard.canProceedFromCombos}>
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "burgers" && (
              <Button onClick={goNext}>
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "sides" && (
              <Button onClick={goNext} disabled={!wizard.canProceedFromSides}>
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}

            {step === "summary" && (
              <Button
                onClick={handleSubmit}
                disabled={!wizard.settings.deliveryType || wizard.isSubmitting}
              >
                {wizard.isSubmitting
                  ? mode === "edit"
                    ? "Guardando..."
                    : "Creando..."
                  : mode === "edit"
                    ? "Guardar cambios"
                    : "Crear pedido"}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {wizard.customer.selectedCustomer && (
        <EditCustomerModal
          open={wizard.customer.isEditingCustomer}
          onOpenChange={wizard.customer.setIsEditingCustomer}
          customer={wizard.customer.selectedCustomer}
          onSelectAddress={wizard.customer.setSelectedAddress}
          currentAddressId={wizard.customer.selectedAddress}
        />
      )}
    </>
  );
}
