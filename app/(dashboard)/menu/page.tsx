"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useNextStep } from "nextstepjs";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { HelpButton } from "@/components/onboarding/help-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Edit,
  Plus,
  Trash2,
  X,
  Eye,
  EyeOff,
  Upload,
  ImageIcon,
} from "lucide-react";
import {
  useAllBurgers,
  useCreateBurger,
  useUpdateBurger,
  useDeleteBurger,
} from "@/lib/hooks/use-menu-crud";
import type { Burger } from "@/lib/types";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { normalizeIngredientName } from "@/lib/utils/costing";
import { useImageUpload } from "@/lib/hooks/use-image-upload";
import { useSupplies } from "@/lib/hooks/use-supplies";

export default function MenuPage() {
  const { data: burgers, isLoading } = useAllBurgers();
  const createBurger = useCreateBurger();
  const updateBurger = useUpdateBurger();
  const deleteBurger = useDeleteBurger();
  // Only for the ingredient-name datalist/match badges below — /costos owns
  // the actual burger_supplies linkage, this page never writes to it.
  const { data: supplies } = useSupplies();
  const { uploadImage, deleteImage, isUploading, uploadProgress } =
    useImageUpload();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingBurger, setEditingBurger] = useState<Burger | null>(null);
  const [deletingBurger, setDeletingBurger] = useState<Burger | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    base_price: "",
    default_meat_quantity: "2",
    default_fries_quantity: "1",
    ingredients: "",
    is_available: true,
    image_url: null as string | null,
  });

  const [ingredientInput, setIngredientInput] = useState("");
  const [ingredientsList, setIngredientsList] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  /* ================= HANDLERS ================= */

  const handleOpenCreate = () => {
    setEditingBurger(null);
    setFormData({
      name: "",
      description: "",
      base_price: "",
      default_meat_quantity: "2",
      default_fries_quantity: "1",
      ingredients: "",
      is_available: true,
      image_url: null,
    });
    setIngredientsList([]);
    setIngredientInput("");
    setImageFile(null);
    setImagePreview(null);
    setDialogOpen(true);
  };

  // The "Ingredientes" tour step targets a field that only exists once the
  // create/edit Dialog is open — same problem the /costos and /gastos tours
  // solve for their tabbed content (Radix unmounts what isn't active/open).
  // This opens the create dialog for that one step instead of leaving the
  // step with nothing to highlight. `tourOpenedRef` tracks whether *this*
  // effect opened it (mirrors components/costos/recipes-tab.tsx's demo-burger
  // pattern), so a dialog the user opened by hand outside a tour is never
  // touched here, and the dialog closes itself if the tour is skipped/closed
  // instead of being left open and empty.
  const { currentTour, currentStep } = useNextStep();
  const tourOpenedRef = useRef(false);
  useEffect(() => {
    const inTourStep = currentTour === "menu" && currentStep >= 1;

    if (inTourStep) {
      if (!dialogOpen) {
        tourOpenedRef.current = true;
        handleOpenCreate();
      }
      return;
    }

    if (tourOpenedRef.current) {
      tourOpenedRef.current = false;
      setDialogOpen(false);
    }
  }, [currentTour, currentStep]);

  const handleOpenEdit = (burger: Burger) => {
    setEditingBurger(burger);
    setFormData({
      name: burger.name,
      description: burger.description || "",
      base_price: burger.base_price.toString(),
      default_meat_quantity: burger.default_meat_quantity?.toString() || "2",
      default_fries_quantity: burger.default_fries_quantity?.toString() || "1",
      ingredients: "",
      is_available: burger.is_available,
      image_url: burger.image_url || null,
    });
    setIngredientsList(burger.ingredients || []);
    setIngredientInput("");
    setImageFile(null);
    setImagePreview(burger.image_url || null);
    setDialogOpen(true);
  };

  const handleToggleAvailability = async (burger: Burger) => {
    await updateBurger.mutateAsync({
      id: burger.id,
      is_available: !burger.is_available,
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor selecciona una imagen válida");
      return;
    }

    // Validar tamaño (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast.error("La imagen no puede superar los 2MB");
      return;
    }

    setImageFile(file);

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormData({ ...formData, image_url: null });
  };

  const handleAddIngredient = () => {
    const trimmed = ingredientInput.trim();
    if (!trimmed) return;
    // Dedupe on the NORMALIZED name (case/accent-insensitive), not raw
    // equality — otherwise "Carne" and "carne" coexist as two different tags
    // pointing at the same real ingredient, and the /costos matching in
    // buildIngredientSuggestions would offer both separately.
    const normalized = normalizeIngredientName(trimmed);
    if (ingredientsList.some((i) => normalizeIngredientName(i) === normalized)) return;
    setIngredientsList([...ingredientsList, trimmed]);
    setIngredientInput("");
  };

  const handleRemoveIngredient = (ingredient: string) => {
    setIngredientsList(ingredientsList.filter((i) => i !== ingredient));
  };

  const handleSubmit = async () => {
    try {
      let imageUrl = formData.image_url;

      // Upload nueva imagen si hay
      if (imageFile) {
        // Si hay imagen anterior, eliminarla
        if (editingBurger?.image_url) {
          await deleteImage(editingBurger.image_url);
        }
        imageUrl = await uploadImage(imageFile);
      }

      const burgerData = {
        name: formData.name,
        description: formData.description || null,
        base_price: Number.parseFloat(formData.base_price),
        default_meat_quantity: Number.parseInt(formData.default_meat_quantity),
        default_fries_quantity: Number.parseInt(
          formData.default_fries_quantity,
        ),
        ingredients: ingredientsList,
        is_available: formData.is_available,
        image_url: imageUrl,
      };

      if (editingBurger) {
        await updateBurger.mutateAsync({ id: editingBurger.id, ...burgerData });
      } else {
        await createBurger.mutateAsync(burgerData);
      }

      setDialogOpen(false);
    } catch (error) {
      console.error("Error saving burger:", error);
      toast.error("Error al guardar hamburguesa");
    }
  };

  const handleDelete = async () => {
    if (!deletingBurger) return;

    try {
      // Eliminar imagen si tiene
      if (deletingBurger.image_url) {
        await deleteImage(deletingBurger.image_url);
      }

      await deleteBurger.mutateAsync(deletingBurger.id);
      setDeleteDialogOpen(false);
      setDeletingBurger(null);
    } catch (error) {
      // El error ya se maneja en el hook
    }
  };

  /* ================= RENDER ================= */

  return (
    <section className="flex flex-1 min-h-0 flex-col">
      <Header
        title="Menú"
        subtitle="Administra las hamburguesas del menú"
        extraActions={<HelpButton tour="menu" />}
      />

      <div className="flex-1 overflow-auto p-6 md:py-6 md:px-0">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-subheadline text-muted-foreground">
              {burgers?.length || 0} hamburguesas{" "}
              {burgers &&
                `(${burgers.filter((b) => b.is_available).length} disponibles)`}
            </p>
          </div>
          <Button id="menu-add-burger-button" onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva hamburguesa
          </Button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        ) : burgers && burgers.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {burgers.map((burger) => (
              <Card
                key={burger.id}
                className={cn(
                  // Sombra de hover: la hereda de Card (A1, depth="raised"
                  // por default). Antes acá se pisaba con hover:shadow-lg
                  // — la clase default de Tailwind, no registrada en el
                  // theme, invisible sobre #08090c.
                  "group overflow-hidden pt-0 bg-card",
                  !burger.is_available && "opacity-60",
                )}
              >
                {/* Image */}
                <div className="relative h-48 bg-muted">
                  {burger.image_url ? (
                    <Image
                      src={burger.image_url}
                      alt={burger.name}
                      fill
                      className="object-cover h-full"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}

                  {/* Badge overlay */}
                  <Badge
                    variant={burger.is_available ? "default" : "secondary"}
                    className="absolute right-2 top-2"
                  >
                    {burger.is_available ? "Disponible" : "No disponible"}
                  </Badge>
                </div>

                <CardContent className="p-4">
                  {/* Header */}
                  <div className="mb-3">
                    <h3 className="text-headline">{burger.name}</h3>
                    <p className="text-title3 font-bold text-primary">
                      {formatCurrency(burger.base_price)}
                    </p>
                  </div>

                  {/* Description */}
                  {burger.description && (
                    <p className="mb-3 text-subheadline text-muted-foreground line-clamp-2">
                      {burger.description}
                    </p>
                  )}

                  {/* Ingredients */}
                  {burger.ingredients.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-1">
                      {burger.ingredients.slice(0, 3).map((ing) => (
                        <Badge
                          key={ing}
                          variant="outline"
                          className="text-caption bg-card"
                        >
                          {ing}
                        </Badge>
                      ))}
                      {burger.ingredients.length > 3 && (
                        <Badge variant="outline" className="text-caption">
                          +{burger.ingredients.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 bg-card"
                      onClick={() => handleOpenEdit(burger)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleAvailability(burger)}
                      className="bg-card"
                      title={burger.is_available ? "Ocultar" : "Activar"}
                    >
                      {burger.is_available ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive bg-card"
                      onClick={() => {
                        setDeletingBurger(burger);
                        setDeleteDialogOpen(true);
                      }}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <ImageIcon className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
            <h3 className="mb-2 text-title3">No hay hamburguesas</h3>
            <p className="mb-4 text-subheadline text-muted-foreground">
              Comienza creando tu primera hamburguesa
            </p>
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Crear primera hamburguesa
            </Button>
          </div>
        )}
      </div>

      {/* CREATE / EDIT DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBurger ? "Editar hamburguesa" : "Nueva hamburguesa"}
            </DialogTitle>
            <DialogDescription>
              {editingBurger
                ? "Modifica los datos de la hamburguesa"
                : "Completa los datos para crear una nueva hamburguesa"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Image Upload */}
            <div>
              <Label>Imagen</Label>
              <div className="mt-2">
                {imagePreview ? (
                  <div className="relative">
                    <div className="relative h-48 w-full overflow-hidden rounded-lg border">
                      <Image
                        src={imagePreview}
                        alt="Preview"
                        fill
                        className="object-cover"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="mt-2"
                      onClick={handleRemoveImage}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Eliminar imagen
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center h-48 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() =>
                      document.getElementById("image-upload")?.click()
                    }
                  >
                    <div className="text-center">
                      <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-subheadline text-muted-foreground">
                        Click para subir imagen
                      </p>
                      <p className="text-caption text-muted-foreground mt-1">
                        PNG, JPG hasta 2MB
                      </p>
                    </div>
                  </div>
                )}
                <input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
                {isUploading && (
                  <div className="mt-2">
                    <Progress value={uploadProgress} />
                    <p className="text-caption text-center text-muted-foreground mt-1">
                      Subiendo... {uploadProgress}%
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Name */}
            <div>
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="BBQ Bacon"
              />
            </div>

            {/* Price */}
            <div>
              <Label htmlFor="price">Precio (ARS) *</Label>
              <Input
                id="price"
                type="number"
                value={formData.base_price}
                onChange={(e) =>
                  setFormData({ ...formData, base_price: e.target.value })
                }
                placeholder="8000"
              />
            </div>

            {/* Default Meat & Fries */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="meat">Medallones por defecto</Label>
                <Input
                  id="meat"
                  type="number"
                  min="1"
                  value={formData.default_meat_quantity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      default_meat_quantity: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="fries">Papas por defecto</Label>
                <Input
                  id="fries"
                  type="number"
                  min="0"
                  value={formData.default_fries_quantity}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      default_fries_quantity: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Deliciosa hamburguesa con..."
                rows={3}
              />
            </div>

            {/* Ingredients */}
            <div id="menu-ingredients-field">
              <Label>Ingredientes</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  list="menu-supplies-datalist"
                  value={ingredientInput}
                  onChange={(e) => setIngredientInput(e.target.value)}
                  placeholder="Agregar ingrediente"
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    (e.preventDefault(), handleAddIngredient())
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddIngredient}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {/* Native datalist, not a custom dropdown — zero new deps.
                  Suggests existing /costos supply names so an ingredient
                  typed here matches its recipe supply by construction,
                  instead of relying on the fuzzy matching in
                  buildIngredientSuggestions to guess it later. Typing
                  anything else still works: not every menu ingredient needs
                  a costed supply behind it. */}
              <datalist id="menu-supplies-datalist">
                {supplies
                  ?.filter((s) => s.is_active !== false)
                  .map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
              </datalist>
              {ingredientsList.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {ingredientsList.map((ing) => {
                    // Same normalized-name comparison buildIngredientSuggestions
                    // uses on the /costos side — a dot here just previews
                    // whether this ingredient will show up there as an
                    // exact match, no explanatory copy needed.
                    const linkedSupply = supplies?.find(
                      (s) =>
                        s.is_active !== false &&
                        normalizeIngredientName(s.name) === normalizeIngredientName(ing)
                    );
                    return (
                      <Badge
                        key={ing}
                        variant="secondary"
                        className="gap-1"
                        title={
                          linkedSupply
                            ? `Vinculado al insumo "${linkedSupply.name}"`
                            : "Sin insumo asociado en /costos"
                        }
                      >
                        {linkedSupply && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: "var(--color-chart-3)" }}
                          />
                        )}
                        {ing}
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredient(ing)}
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Available */}
            <div className="flex items-center gap-2">
              <Switch
                id="available"
                checked={formData.is_available}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_available: checked })
                }
              />
              <Label htmlFor="available">Disponible para venta</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !formData.name ||
                !formData.base_price ||
                createBurger.isPending ||
                updateBurger.isPending ||
                isUploading
              }
            >
              {isUploading
                ? "Subiendo imagen..."
                : createBurger.isPending || updateBurger.isPending
                  ? "Guardando..."
                  : editingBurger
                    ? "Guardar cambios"
                    : "Crear hamburguesa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE DIALOG */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar hamburguesa</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar "{deletingBurger?.name}"?
              <br />
              <span className="text-subheadline text-muted-foreground mt-2 block">
                Si esta hamburguesa tiene pedidos asociados, no se podrá
                eliminar. En ese caso, puedes ocultarla usando el botón de
                "Ocultar".
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
