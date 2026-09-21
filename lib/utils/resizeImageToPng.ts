// Convierte cualquier imagen (JPG, foto de celular, lo que sea) a un PNG de
// tamaño acotado ANTES de subirla — corre en el navegador, con <canvas>. Es
// requisito duro, no cosmético: el print service (jebbs-print-service, otro
// repo) solo acepta PNG para el logo del ticket y no redimensiona nada él
// mismo (ver node_modules/node-thermal-printer/lib/core.js en ese repo). Si
// esto no resuelve ya achicado y en PNG, cualquier foto de varios MB llega
// tal cual al ticket térmico.
//
// maxWidth = 480 por defecto: cómodo para el ancho del ticket térmico (42
// caracteres, ~576px típico de papel de 80mm) y de sobra para 36-40px en el
// sidebar/login.
export async function resizeImageToPng(file: File, maxWidth = 480): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo convertir la imagen"))),
      "image/png",
    );
  });
}
