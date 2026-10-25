import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Edit, Plus, Trash2, ShieldCheck, Loader2, Lock, Upload, X, GripVertical, Eye } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Product } from "@shared/schema";

const isValidImageSrc = (val: string) =>
  val.startsWith("/uploads/") || val.startsWith("http://") || val.startsWith("https://");

const productFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  priceStr: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid price (e.g. 19.99)"),
  category: z.string().min(1, "Category is required"),
  imageUrls: z.array(z.string()).min(1, "At least one image is required"),
});

type FormValues = z.infer<typeof productFormSchema>;

const SESSION_KEY = "stitch_admin_auth";

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiRequest("POST", "/api/admin/login", { password });
      sessionStorage.setItem(SESSION_KEY, "true");
      onSuccess();
    } catch {
      setError("Incorrect password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl border-2 border-border p-10">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-4">
            <Lock className="h-8 w-8" />
          </div>
          <h1 className="font-display text-2xl font-bold">Admin Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your password to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-semibold mb-1 block">Password</label>
            <Input
              type="password"
              className="rounded-xl"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-admin-password"
              autoFocus
            />
            {error && <p className="text-destructive text-sm mt-2">{error}</p>}
          </div>
          <Button
            type="submit"
            className="w-full rounded-xl h-12"
            disabled={loading || !password}
            data-testid="button-admin-login"
          >
            {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}

interface PendingImage {
  file: File;
  previewUrl: string;
  width: number | null;
  height: number | null;
  targetWidth: number | null;
  targetHeight: number | null;
  preserveAspectRatio: boolean;
}

interface ExistingImageEdit {
  index: number;
  url: string;
  width: number | null;
  height: number | null;
  targetWidth: number | null;
  targetHeight: number | null;
  preserveAspectRatio: boolean;
}

const MAX_IMAGE_DIMENSION = 4096;
const DEFAULT_IMAGE_DIMENSION = 1600;
const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;

function getResizedDimensions(width: number, height: number, maxDimension: number) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function getSafeDimension(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(MAX_IMAGE_DIMENSION, Math.round(parsed)))
    : null;
}

async function resizeImageFile(file: File, targetWidth: number, targetHeight: number): Promise<File> {
  // Keep animated GIFs intact rather than flattening them to a single frame.
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width === targetWidth && bitmap.height === targetHeight) return file;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not resize this image.");

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const outputType = ["image/jpeg", "image/png", "image/webp"].includes(file.type)
      ? file.type
      : "image/png";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("Your browser could not resize this image.")),
        outputType,
        outputType === "image/jpeg" ? 0.9 : undefined
      );
    });

    const extension = outputType === "image/jpeg" ? ".jpg" : outputType === "image/webp" ? ".webp" : ".png";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}${extension}`, { type: outputType, lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

function isAnimatedGifUrl(url: string) {
  return /\.gif(?:$|[?#])/i.test(url);
}

async function fileFromImageUrl(url: string): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load this image for resizing.");

  const blob = await response.blob();
  const filename = decodeURIComponent(new URL(url, window.location.href).pathname.split("/").pop() || "image");
  const extension = filename.split(".").pop()?.toLowerCase();
  const fallbackType = extension === "jpg" || extension === "jpeg"
    ? "image/jpeg"
    : extension === "webp"
      ? "image/webp"
      : extension === "gif"
        ? "image/gif"
        : "image/png";
  const type = blob.type.startsWith("image/") ? blob.type : fallbackType;
  if (!type.startsWith("image/")) throw new Error("This URL is not an image.");
  return new File([blob], filename, { type });
}

function MultiImageUploader({
  values,
  onChange,
  onUploadingChange,
}: {
  values: string[];
  onChange: (urls: string[]) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [editingImage, setEditingImage] = useState<ExistingImageEdit | null>(null);
  const [editingImageSaving, setEditingImageSaving] = useState(false);
  const [editingImageError, setEditingImageError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingImagesRef = useRef<PendingImage[]>([]);

  const syncPendingImages = (next: PendingImage[]) => {
    pendingImagesRef.current = next;
    setPendingImages(next);
  };

  const updatePendingDimension = (
    previewUrl: string,
    field: "targetWidth" | "targetHeight",
    value: string
  ) => {
    const requested = getSafeDimension(value);
    const next = pendingImagesRef.current.map((image) => {
      if (image.previewUrl !== previewUrl) return image;

      const updated = { ...image, [field]: requested };
      if (image.preserveAspectRatio && requested !== null && image.width && image.height) {
        const width = field === "targetWidth"
          ? requested
          : Math.round(requested * image.width / image.height);
        const height = field === "targetHeight"
          ? requested
          : Math.round(requested * image.height / image.width);
        const fitted = getResizedDimensions(width, height, MAX_IMAGE_DIMENSION);
        updated.targetWidth = fitted.width;
        updated.targetHeight = fitted.height;
      }
      return updated;
    });
    syncPendingImages(next);
  };

  const updateAspectRatio = (previewUrl: string, preserveAspectRatio: boolean) => {
    const next = pendingImagesRef.current.map((image) => {
      if (image.previewUrl !== previewUrl) return image;

      const updated = { ...image, preserveAspectRatio };
      if (preserveAspectRatio && image.width && image.height) {
        const width = image.targetWidth ?? image.width;
        const height = Math.round(width * image.height / image.width);
        const fitted = getResizedDimensions(width, height, MAX_IMAGE_DIMENSION);
        updated.targetWidth = fitted.width;
        updated.targetHeight = fitted.height;
      }
      return updated;
    });
    syncPendingImages(next);
  };

  useEffect(() => () => {
    pendingImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({})) as { url?: string; message?: string };
    if (!res.ok || !data.url) {
      throw new Error(data.message || "Upload failed. Please try again.");
    }
    return data.url;
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const validImages = files.filter((file) => file.type.startsWith("image/") && file.size <= MAX_IMAGE_FILE_SIZE);
    const skippedCount = files.length - validImages.length;
    setUploadError(skippedCount ? "Some files were skipped. Choose image files that are 10MB or smaller." : "");

    const addedImages = validImages.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      width: null,
      height: null,
      targetWidth: null,
      targetHeight: null,
      preserveAspectRatio: true,
    }));
    syncPendingImages([...pendingImagesRef.current, ...addedImages]);

    addedImages.forEach((pendingImage) => {
      const preview = new Image();
      preview.onload = () => {
        setPendingImages((current) => {
          const next = current.map((image) => {
            if (image.previewUrl !== pendingImage.previewUrl) return image;
            const target = image.file.type === "image/gif"
              ? { width: preview.naturalWidth, height: preview.naturalHeight }
              : getResizedDimensions(preview.naturalWidth, preview.naturalHeight, DEFAULT_IMAGE_DIMENSION);
            return {
              ...image,
              width: preview.naturalWidth,
              height: preview.naturalHeight,
              targetWidth: target.width,
              targetHeight: target.height,
            };
          });
          pendingImagesRef.current = next;
          return next;
        });
      };
      preview.src = pendingImage.previewUrl;
    });

    if (fileRef.current) fileRef.current.value = "";
  };

  const removePendingImage = (previewUrl: string) => {
    URL.revokeObjectURL(previewUrl);
    syncPendingImages(pendingImagesRef.current.filter((image) => image.previewUrl !== previewUrl));
  };

  const uploadPendingImages = async () => {
    if (!pendingImages.length || uploading) return;
    setUploading(true);
    onUploadingChange(true);
    setUploadError("");

    const uploadedUrls: string[] = [];
    const uploadedPreviewUrls = new Set<string>();
    let failureMessage = "";

    try {
      for (const image of pendingImages) {
        try {
          if (!image.targetWidth || !image.targetHeight) {
            throw new Error("Enter valid width and height values before uploading.");
          }
          const resizedFile = await resizeImageFile(image.file, image.targetWidth, image.targetHeight);
          uploadedUrls.push(await uploadFile(resizedFile));
          uploadedPreviewUrls.add(image.previewUrl);
        } catch (error) {
          failureMessage = `${image.file.name}: ${error instanceof Error ? error.message : "Upload failed."}`;
          break;
        }
      }

      if (uploadedUrls.length) onChange([...values, ...uploadedUrls]);
      const remainingImages = pendingImagesRef.current.filter((image) => !uploadedPreviewUrls.has(image.previewUrl));
      pendingImagesRef.current
        .filter((image) => uploadedPreviewUrls.has(image.previewUrl))
        .forEach((image) => URL.revokeObjectURL(image.previewUrl));
      syncPendingImages(remainingImages);
      if (failureMessage) {
        setUploadError(`${failureMessage} Successfully uploaded images have been added; you can retry the remaining files.`);
      }
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  };

  const addUrl = () => {
    const trimmed = urlInput.trim();
    if (!trimmed || !isValidImageSrc(trimmed)) return;
    onChange([...values, trimmed]);
    setUrlInput("");
  };

  const remove = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const next = [...values];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };

  const openExistingImage = (index: number, url: string) => {
    setEditingImageError("");
    setEditingImage({
      index,
      url,
      width: null,
      height: null,
      targetWidth: null,
      targetHeight: null,
      preserveAspectRatio: true,
    });
  };

  const updateExistingDimension = (
    field: "targetWidth" | "targetHeight",
    value: string
  ) => {
    const requested = getSafeDimension(value);
    setEditingImage((image) => {
      if (!image) return image;
      const updated = { ...image, [field]: requested };
      if (image.preserveAspectRatio && requested !== null && image.width && image.height) {
        const width = field === "targetWidth"
          ? requested
          : Math.round(requested * image.width / image.height);
        const height = field === "targetHeight"
          ? requested
          : Math.round(requested * image.height / image.width);
        const fitted = getResizedDimensions(width, height, MAX_IMAGE_DIMENSION);
        updated.targetWidth = fitted.width;
        updated.targetHeight = fitted.height;
      }
      return updated;
    });
  };

  const updateExistingAspectRatio = (preserveAspectRatio: boolean) => {
    setEditingImage((image) => {
      if (!image) return image;
      const updated = { ...image, preserveAspectRatio };
      if (preserveAspectRatio && image.width && image.height) {
        const width = image.targetWidth ?? image.width;
        const height = Math.round(width * image.height / image.width);
        const fitted = getResizedDimensions(width, height, MAX_IMAGE_DIMENSION);
        updated.targetWidth = fitted.width;
        updated.targetHeight = fitted.height;
      }
      return updated;
    });
  };

  const saveExistingImageResize = async () => {
    if (
      !editingImage?.targetWidth ||
      !editingImage.targetHeight ||
      !editingImage.width ||
      !editingImage.height ||
      isAnimatedGifUrl(editingImage.url) ||
      editingImageSaving
    ) return;

    setEditingImageSaving(true);
    onUploadingChange(true);
    setEditingImageError("");
    try {
      const originalFile = await fileFromImageUrl(editingImage.url);
      const resizedFile = await resizeImageFile(originalFile, editingImage.targetWidth, editingImage.targetHeight);
      const resizedUrl = await uploadFile(resizedFile);
      const nextValues = [...values];
      nextValues[editingImage.index] = resizedUrl;
      onChange(nextValues);
      setEditingImage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not resize this image.";
      setEditingImageError(
        message === "Failed to fetch"
          ? "This image host doesn't allow editing here. Try uploading the image file directly."
          : message
      );
    } finally {
      setEditingImageSaving(false);
      onUploadingChange(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Existing images */}
      {values.length > 0 && (
        <div className="space-y-2">
          {values.map((url, i) => (
            <div key={i} className="flex items-center gap-3 bg-muted/30 rounded-xl p-2 border border-border">
              <button type="button" onClick={() => moveUp(i)} className="text-muted-foreground hover:text-foreground" title="Move up">
                <GripVertical className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => openExistingImage(i, url)}
                className="group relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title="Open image preview and resize"
                aria-label={`Open image ${i + 1} preview and resize`}
              >
                <img src={url} alt="" className="h-full w-full rounded-lg object-contain bg-white" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Eye className="h-5 w-5" />
                </span>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground truncate">{url}</p>
                {i === 0 && <span className="text-xs font-bold text-primary">Primary image</span>}
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-destructive flex-shrink-0"
                data-testid={`remove-image-${i}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingImages.length > 0 && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Preview and resize</p>
              <p className="text-xs text-muted-foreground">Set exact dimensions for each image, up to {MAX_IMAGE_DIMENSION}px per side.</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 rounded-lg text-muted-foreground"
              disabled={uploading}
              onClick={() => {
                pendingImagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
                syncPendingImages([]);
              }}
            >
              Clear all
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {pendingImages.map((image) => {
              const targetWidth = image.targetWidth;
              const targetHeight = image.targetHeight;
              const previewScale = targetWidth && targetHeight
                ? Math.min(280 / targetWidth, 220 / targetHeight)
                : 1;
              return (
                <div key={image.previewUrl} className="min-w-0 rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-lg bg-white/70 p-3">
                    {image.width && image.height && targetWidth && targetHeight ? (
                      <img
                        src={image.previewUrl}
                        alt={`Resized preview of ${image.file.name}`}
                        className="rounded object-fill"
                        style={{
                          width: `${Math.round(targetWidth * previewScale)}px`,
                          height: `${Math.round(targetHeight * previewScale)}px`,
                        }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">Reading image dimensions…</p>
                    )}
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" title={image.file.name}>{image.file.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {image.width && image.height && targetWidth && targetHeight
                          ? `Original ${image.width} × ${image.height}px · Preview ${targetWidth} × ${targetHeight}px`
                          : "Reading image dimensions…"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingImage(image.previewUrl)}
                      className="flex-shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                      aria-label={`Remove ${image.file.name}`}
                      disabled={uploading}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs font-semibold">
                      Width (px)
                      <Input
                        type="number"
                        min={1}
                        max={MAX_IMAGE_DIMENSION}
                        step={1}
                        value={targetWidth ?? ""}
                        onChange={(e) => updatePendingDimension(image.previewUrl, "targetWidth", e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                        className="h-9 rounded-lg text-sm"
                        disabled={uploading || image.file.type === "image/gif" || !image.width}
                      />
                    </label>
                    <label className="space-y-1 text-xs font-semibold">
                      Height (px)
                      <Input
                        type="number"
                        min={1}
                        max={MAX_IMAGE_DIMENSION}
                        step={1}
                        value={targetHeight ?? ""}
                        onChange={(e) => updatePendingDimension(image.previewUrl, "targetHeight", e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                        className="h-9 rounded-lg text-sm"
                        disabled={uploading || image.file.type === "image/gif" || !image.height}
                      />
                    </label>
                  </div>
                  <label className={`mt-3 flex items-center gap-2 text-xs ${image.file.type === "image/gif" ? "text-muted-foreground" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      checked={image.preserveAspectRatio}
                      onChange={(e) => updateAspectRatio(image.previewUrl, e.target.checked)}
                      disabled={uploading || image.file.type === "image/gif"}
                      className="h-4 w-4 accent-primary"
                    />
                    Keep proportions
                  </label>
                  {image.file.type === "image/gif" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Animated GIFs are uploaded unchanged to preserve animation.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            className="w-full rounded-xl"
            onClick={uploadPendingImages}
            disabled={uploading || pendingImages.length === 0 || pendingImages.some((image) => !image.targetWidth || !image.targetHeight)}
          >
            {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resizing and uploading…</> : `Upload ${pendingImages.length} image${pendingImages.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      )}

      {uploadError && <p role="alert" className="text-sm text-destructive">{uploadError}</p>}

      {/* Select files, preview, resize, then upload */}
      <button
        type="button"
        className="w-full rounded-xl border-2 border-dashed border-border p-4 text-center transition-colors hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => fileRef.current?.click()}
        data-testid="upload-image-area"
        disabled={uploading}
      >
        <Upload className="mx-auto mb-1 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Click to select images</p>
        <p className="mt-0.5 text-xs text-muted-foreground/60">Preview and resize before uploading — JPG, PNG, GIF up to 10MB each</p>
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

      {/* URL input */}
      <div className="flex gap-2">
        <Input
          className="rounded-xl text-xs flex-1"
          placeholder="Or paste an image URL and click Add"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl(); } }}
        />
        <Button type="button" variant="outline" size="sm" className="rounded-xl flex-shrink-0" onClick={addUrl}>
          Add
        </Button>
      </div>

      <Dialog
        open={Boolean(editingImage)}
        onOpenChange={(open) => {
          if (!open && !editingImageSaving) {
            setEditingImage(null);
            setEditingImageError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[680px] rounded-3xl border-2 border-border p-6 max-h-[90vh] overflow-y-auto">
          {editingImage && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl">Preview and edit image</DialogTitle>
                <DialogDescription>
                  Change the output dimensions below. The resized image replaces this one in the product form.
                </DialogDescription>
              </DialogHeader>

              {(() => {
                const isGif = isAnimatedGifUrl(editingImage.url);
                const targetWidth = editingImage.targetWidth;
                const targetHeight = editingImage.targetHeight;
                const previewScale = targetWidth && targetHeight
                  ? Math.min(560 / targetWidth, 350 / targetHeight)
                  : null;
                const hasChangedSize = Boolean(
                  editingImage.width &&
                  editingImage.height &&
                  targetWidth &&
                  targetHeight &&
                  (editingImage.width !== targetWidth || editingImage.height !== targetHeight)
                );

                return (
                  <>
                    <div className="mt-2 flex min-h-[280px] items-center justify-center overflow-hidden rounded-xl bg-muted/30 p-4">
                      <img
                        src={editingImage.url}
                        alt="Image preview"
                        onLoad={(event) => {
                          const width = event.currentTarget.naturalWidth;
                          const height = event.currentTarget.naturalHeight;
                          setEditingImage((current) => {
                            if (!current || current.url !== editingImage.url || (current.width && current.height)) return current;
                            const target = isGif
                              ? { width, height }
                              : getResizedDimensions(width, height, DEFAULT_IMAGE_DIMENSION);
                            return {
                              ...current,
                              width,
                              height,
                              targetWidth: target.width,
                              targetHeight: target.height,
                            };
                          });
                        }}
                        onError={() => setEditingImageError("Could not preview this image.")}
                        className={previewScale ? "rounded object-fill" : "max-h-[350px] max-w-full rounded object-contain"}
                        style={previewScale && targetWidth && targetHeight
                          ? {
                              width: `${Math.round(targetWidth * previewScale)}px`,
                              height: `${Math.round(targetHeight * previewScale)}px`,
                            }
                          : undefined}
                      />
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {editingImage.width && editingImage.height && targetWidth && targetHeight
                        ? `Original ${editingImage.width} × ${editingImage.height}px · Preview ${targetWidth} × ${targetHeight}px`
                        : "Loading image dimensions…"}
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1 text-sm font-semibold">
                        Width (px)
                        <Input
                          type="number"
                          min={1}
                          max={MAX_IMAGE_DIMENSION}
                          step={1}
                          value={targetWidth ?? ""}
                          onChange={(event) => updateExistingDimension("targetWidth", event.target.value)}
                          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                          className="rounded-lg"
                          disabled={editingImageSaving || isGif || !editingImage.width}
                        />
                      </label>
                      <label className="space-y-1 text-sm font-semibold">
                        Height (px)
                        <Input
                          type="number"
                          min={1}
                          max={MAX_IMAGE_DIMENSION}
                          step={1}
                          value={targetHeight ?? ""}
                          onChange={(event) => updateExistingDimension("targetHeight", event.target.value)}
                          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                          className="rounded-lg"
                          disabled={editingImageSaving || isGif || !editingImage.height}
                        />
                      </label>
                    </div>

                    <label className={`flex items-center gap-2 text-sm ${isGif ? "text-muted-foreground" : "cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        checked={editingImage.preserveAspectRatio}
                        onChange={(event) => updateExistingAspectRatio(event.target.checked)}
                        disabled={editingImageSaving || isGif}
                        className="h-4 w-4 accent-primary"
                      />
                      Keep proportions
                    </label>
                    {isGif && (
                      <p className="text-xs text-muted-foreground">
                        Animated GIFs are preview-only here so their animation stays intact.
                      </p>
                    )}
                    {editingImageError && <p role="alert" className="text-sm text-destructive">{editingImageError}</p>}

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => setEditingImage(null)}
                        disabled={editingImageSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="rounded-xl"
                        onClick={saveExistingImageResize}
                        disabled={editingImageSaving || !hasChangedSize || isGif}
                      >
                        {editingImageSaving
                          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resizing…</>
                          : "Resize and replace"}
                      </Button>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdminPortal() {
  const { data: products, isLoading } = useProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [imagesUploading, setImagesUploading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: { name: "", description: "", priceStr: "", category: "", imageUrls: [] },
  });

  const openNew = () => {
    setEditingId(null);
    form.reset({ name: "", description: "", priceStr: "", category: "", imageUrls: [] });
    setIsOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingId(product.id);
    form.reset({
      name: product.name,
      description: product.description,
      priceStr: (product.price / 100).toFixed(2),
      category: product.category,
      imageUrls: product.imageUrls ?? [],
    });
    setIsOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this item?")) {
      deleteProduct.mutate(id);
    }
  };

  const onSubmit = (data: FormValues) => {
    const price = Math.round(parseFloat(data.priceStr) * 100);
    const payload = {
      name: data.name,
      description: data.description,
      price,
      category: data.category,
      imageUrls: data.imageUrls,
    };

    if (editingId) {
      updateProduct.mutate({ id: editingId, ...payload }, { onSuccess: () => setIsOpen(false) });
    } else {
      createProduct.mutate(payload, { onSuccess: () => setIsOpen(false) });
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12 min-h-screen">
      <div className="flex items-center justify-between mb-10 bg-white p-6 rounded-3xl border border-border shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">Admin Portal</h1>
            <p className="text-sm text-muted-foreground">Manage your magical inventory</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-muted-foreground"
            onClick={() => { sessionStorage.removeItem(SESSION_KEY); window.location.reload(); }}
          >
            Sign Out
          </Button>
          <Dialog open={isOpen} onOpenChange={(open) => {
            if (!imagesUploading) setIsOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="rounded-xl bg-slate-900">
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] rounded-3xl border-2 border-border p-8 max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">
                  {editingId ? "Edit Item" : "Create New Item"}
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Product Name</FormLabel><FormControl><Input className="rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel>Category</FormLabel><FormControl><Input className="rounded-xl" placeholder="e.g. Animals, Bags..." {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="priceStr" render={({ field }) => (
                    <FormItem><FormLabel>Price ($)</FormLabel><FormControl><Input className="rounded-xl" placeholder="19.99" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="imageUrls" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Images</FormLabel>
                      <p className="text-xs text-muted-foreground -mt-1">The first image is shown as the main photo. Use the handle icon to reorder.</p>
                      <FormControl>
                        <MultiImageUploader
                          values={field.value}
                          onChange={field.onChange}
                          onUploadingChange={setImagesUploading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Description</FormLabel><FormControl><Input className="rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Button type="submit" className="w-full rounded-xl mt-6 h-12" disabled={isPending || imagesUploading}>
                    {isPending ? <Loader2 className="animate-spin h-5 w-5" /> : "Save"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-muted-foreground animate-pulse">Loading inventory...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-muted/50 border-b border-border font-display">
                <tr>
                  <th className="p-4 font-bold">Item</th>
                  <th className="p-4 font-bold">Category</th>
                  <th className="p-4 font-bold">Price</th>
                  <th className="p-4 font-bold">Images</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products?.map((product) => (
                  <tr key={product.id} className="border-b border-border/50 hover:bg-muted/20" data-testid={`row-product-${product.id}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        {product.imageUrls?.[0] ? (
                          <img src={product.imageUrls[0]} alt="" className="w-12 h-12 rounded-lg object-contain bg-white flex-shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0" />
                        )}
                        <span className="font-semibold">{product.name}</span>
                      </div>
                    </td>
                    <td className="p-4"><span className="px-3 py-1 bg-muted rounded-full text-xs font-bold">{product.category}</span></td>
                    <td className="p-4 font-bold">${(product.price / 100).toFixed(2)}</td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        {product.imageUrls?.slice(0, 3).map((url, i) => (
                          <img key={i} src={url} alt="" className="w-8 h-8 rounded object-contain bg-white" />
                        ))}
                        {(product.imageUrls?.length ?? 0) > 3 && (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                            +{product.imageUrls.length - 3}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(product)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)} disabled={deleteProduct.isPending}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {products?.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Inventory is empty. Start adding products!</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const [authenticated, setAuthenticated] = useState(
    sessionStorage.getItem(SESSION_KEY) === "true"
  );

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  return <AdminPortal />;
}
