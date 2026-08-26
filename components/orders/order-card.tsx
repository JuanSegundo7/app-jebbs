"use client";

import type React from "react";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Eye,
  User,
  DollarSign,
  Edit,
  ArrowRight,
  Copy,
  Timer,
  Pencil,
  Check,
  X,
} from "lucide-react";
import type { Order } from "@/lib/types";
import { formatCurrency, getRelativeTime } from "@/lib/utils/format";
import { useTogglePaymentStatus, useQuickPatchOrder } from "@/lib/hooks/orders/use-orders";
import { cn } from "@/lib/utils";
import { orderSourceConfig } from "@/lib/utils/order-source";
import { formatOrderForWhatsapp } from "@/lib/utils/formatOrderWhatsapp";
import { formatOrderForDelivery } from "@/lib/utils/formatOrderDelivery";
import { toast } from "sonner";

const statusConfig = {
  new: { label: "Nuevo", className: "bg-blue-500 text-white" },
  ready: { label: "Listo", className: "bg-green-500 text-white" },
  completed: { label: "Completado", className: "bg-gray-500 text-white" },
  canceled: { label: "Cancelado", className: "bg-red-500 text-white" },
};

const statusBorderColor: Record<string, string> = {
  new: "border-l-blue-500",
  ready: "border-l-green-500",
  completed: "border-l-zinc-500",
  canceled: "border-l-red-500",
};

interface OrderCardProps {
  order: Order;
  onViewDetails: (order: Order) => void;
  onEditOrder?: (order: Order) => void;
  isDragging?: boolean;
  visualStatus?: Order["status"];
  onChangeStatus?: (order: Order) => void;
}

export function OrderCard({
  order,
  onViewDetails,
  onEditOrder,
  isDragging,
  onChangeStatus,
  visualStatus = order.status,
}: OrderCardProps) {
  const canEdit = order.status === "new" || order.status === "ready";
  const togglePayment = useTogglePaymentStatus();
  const quickPatch = useQuickPatchOrder();
  const [isEditing, setIsEditing] = useState(false);
  const [draftAmount, setDraftAmount] = useState("");
  const [draftMethod, setDraftMethod] = useState<"cash" | "transfer">(order.payment_method);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftAmount(String(order.total_amount));
    setDraftMethod(order.payment_method);
    setIsEditing(true);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  const handleSaveEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    const parsed = parseInt(draftAmount, 10);
    if (isNaN(parsed) || parsed < 0) {
      toast.error("Monto inválido");
      return;
    }
    quickPatch.mutate(
      { orderId: order.id, total_amount: parsed, payment_method: draftMethod },
      {
        onSuccess: () => {
          toast.success("Pedido actualizado");
          setIsEditing(false);
        },
        onError: () => toast.error("Error al guardar"),
      },
    );
  };

  const handlePaymentToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePayment.mutate({ orderId: order.id, isPaid: !order.is_paid });
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = formatOrderForWhatsapp(order);
    await navigator.clipboard.writeText(text);
    toast.success("Pedido copiado para WhatsApp");
  };

  const handleCopyDelivery = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = formatOrderForDelivery(order);
    await navigator.clipboard.writeText(text);
    toast.success("Pedido copiado para delivery");
  };

  const status = visualStatus ?? order.status;
  const config = statusConfig[status as keyof typeof statusConfig];

  console.log(order);

  return (
    <Card
      className={cn(
        "transition-all hover:shadow-md cursor-grab bg-card border-l-4",
        statusBorderColor[status] ?? "border-l-border",
        isDragging && "rotate-1",
      )}
    >
      <CardContent className="p-4">
        {/* Delivery time banner — shown at the very top when available */}
        {order.delivery_time && (
          <div className="flex items-center gap-2 mb-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-1.5">
            <Timer className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {order.delivery_type === "delivery" ? "Entrega:" : "Retira:"}{" "}
              {order.delivery_time}
            </span>
          </div>
        )}

        {/* Header: order number + time ago + status badge + payment */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <p className="font-mono text-lg font-semibold">
              #{order.order_number}
            </p>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{getRelativeTime(order.created_at)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer rounded-full"
              onClick={handleCopy}
              title="Copiar para WhatsApp"
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer rounded-full"
              onClick={handleCopyDelivery}
              title="Copiar para delivery"
            >
              🛵
            </Button>
            <Badge className={config.className}>{config.label}</Badge>
            <button
              onClick={handlePaymentToggle}
              className={cn(
                "rounded-full p-2 transition-colors cursor-pointer",
                order.is_paid
                  ? "bg-green-100 text-green-600 hover:bg-green-200"
                  : "bg-red-100 text-red-600 hover:bg-red-200",
              )}
              title={
                order.is_paid
                  ? "Pagado - Click para marcar como no pagado"
                  : "No pagado - Click para marcar como pagado"
              }
            >
              <DollarSign className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Customer name */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <User className="h-4 w-4" />
          <span>{order.customer_name}</span>
        </div>

        {/* Footer: total + actions */}
        <div className="flex items-center justify-between pt-3 border-t">
          {!isEditing ? (
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold font-mono">
                {formatCurrency(order.total_amount)}
              </p>
              {canEdit && (
                <button
                  onClick={handleStartEdit}
                  title="Editar precio y método de pago"
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="number"
                min="0"
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                autoFocus
                className="w-28 h-8 rounded-md border border-input bg-background px-2 text-lg font-bold focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex gap-1.5">
                {(["cash", "transfer"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraftMethod(m);
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer",
                      draftMethod === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border hover:bg-accent",
                    )}
                  >
                    {m === "cash" ? "💵 Efectivo" : "🏦 Transferencia"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!isEditing ? (
            <div className="flex items-center gap-2">
              {canEdit && onEditOrder && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditOrder(order);
                  }}
                >
                  <Edit className="mr-1.5 h-4 w-4" />
                  Editar
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                className="cursor-pointer"
                onClick={() => onViewDetails(order)}
              >
                <Eye className="mr-1.5 h-4 w-4" />
                Ver detalles
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 self-start">
              <button
                onClick={handleSaveEdit}
                disabled={quickPatch.isPending}
                className="p-1.5 rounded text-green-600 hover:bg-green-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={handleCancelEdit}
                className="p-1.5 rounded text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Status advance button */}
        {!isEditing && (
          <div className="mt-3 w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              {order.payment_method === "cash" && (
                <Badge variant="outline" className="text-xs gap-1 bg-card">
                  💵 Efectivo
                </Badge>
              )}
              {order.source && (
                <Badge className={orderSourceConfig[order.source].className}>
                  {orderSourceConfig[order.source].label}
                </Badge>
              )}
            </div>
            {onChangeStatus &&
              (order.status === "new" || order.status === "ready") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="cursor-pointer bg-card"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeStatus(order);
                  }}
                >
                  <ArrowRight className="mr-1.5 h-4 w-4" />
                  {order.status === "new" ? "Listo" : "Completar"}
                </Button>
              )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
