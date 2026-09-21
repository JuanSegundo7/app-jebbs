"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// `bucket`/`pathPrefix` default to the burger-images upload's original
// values so the only existing consumer (app/(dashboard)/menu/page.tsx,
// which calls useImageUpload() with no arguments) keeps working unchanged.
// A future work unit calls useImageUpload("branding", "logo/") for the
// brand logo upload, reusing this same uploadImage/deleteImage logic
// instead of duplicating it.
export function useImageUpload(
  bucket: string = "burger-images",
  pathPrefix: string = "burgers/",
) {
  const supabase = createClient();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadImage = async (file: File): Promise<string> => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Generar nombre único para el archivo
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${pathPrefix}${fileName}`;

      // Upload a Supabase Storage
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) throw error;

      // Obtener URL pública
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(filePath);

      setUploadProgress(100);
      return publicUrl;
    } catch (error) {
      console.error("Error uploading image:", error);
      throw error;
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const deleteImage = async (imageUrl: string): Promise<void> => {
    try {
      // Extraer el path del URL
      const urlParts = imageUrl.split(`${bucket}/`);
      if (urlParts.length < 2) return;

      const filePath = urlParts[1];

      const { error } = await supabase.storage.from(bucket).remove([filePath]);

      if (error) throw error;
    } catch (error) {
      console.error("Error deleting image:", error);
      // No throw - si falla el delete de imagen, no es crítico
    }
  };

  return {
    uploadImage,
    deleteImage,
    isUploading,
    uploadProgress,
  };
}
