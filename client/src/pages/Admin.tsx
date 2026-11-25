import { useAdminProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Edit, Plus, Trash2, ShieldCheck, Loader2, Lock, Upload, X, ArrowUp, ChevronUp, ChevronDown, Eye, EyeOff, KeyRound, FileText } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { OrdersPanel } from "@/components/admin/OrdersPanel";
import { InboxPanel } from "@/components/admin/InboxPanel";
import { getStockLabel, getStockStatus, type Product } from "@shared/schema";

const isValidImageSrc = (val: string) =>
  val.startsWith("/images/") || val.startsWith("/uploads/") || val.startsWith("http://") || val.startsWith("https://");

const productFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().trim(),
  madeFrom: z.string(),
  measurements: z.string().trim().max(200),
  timeToMake: z.string().trim().max(100),
  priceStr: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid price (e.g. 19.99)"),
  category: z.string().min(1, "Category is required"),
  imageUrls: z.array(z.string()).min(1, "At least one image is required"),
  imageBackgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a valid colour"),
  stockMode: z.enum(["tracked", "made_to_order"]),
  stockQuantityStr: z.string().optional(),
}).superRefine((data, context) => {
  if (data.stockMode === "tracked" && !/^\d+$/.test(data.stockQuantityStr ?? "")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["stockQuantityStr"], message: "Enter a whole number of 0 or more." });
  }
});

const DEFAULT_IMAGE_BACKGROUND_COLOR = "#ffffff";

type FormValues = z.infer<typeof productFormSchema>;
type AdminNote = { id: string; text: string; kind: "note" | "todo"; completed: boolean };
const ADMIN_NOTES_STORAGE_KEY = "stitch-admin-notes";

function errorMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : "";
  const jsonStart = message.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const body = JSON.parse(message.slice(jsonStart)) as { message?: string };
      if (body.message) return body.message;
    } catch {
      // The response was not JSON.
    }
  }
  return fallback;
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const close = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
      setSaved(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (newPassword.trim() !== confirmPassword.trim()) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/admin/password", { currentPassword, newPassword });
      const body = await res.json().catch(() => null);
      if (!body || body.success !== true) {
        setError("Could not update the password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("401") && message.includes("Sign in required")) {
        window.location.assign("/admin");
        return;
      }
      setError(errorMessage(err, "Could not update the password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-xl text-muted-foreground" data-testid="button-change-password">
          <KeyRound className="mr-2 h-4 w-4" /> Password
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px] rounded-3xl border-2 border-border p-8">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Change password</DialogTitle>
          <DialogDescription>This replaces the admin password. You stay signed in.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="text-sm font-semibold mb-1 block" htmlFor="current-password">Current password</label>
            <Input id="current-password" type="password" className="rounded-xl" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" data-testid="input-current-password" />
          </div>
          <div>
            <label className="text-sm font-semibold mb-1 block" htmlFor="new-password">New password</label>
            <Input id="new-password" type="password" className="rounded-xl" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" data-testid="input-new-password" />
          </div>
          <div>
            <label className="text-sm font-semibold mb-1 block" htmlFor="confirm-password">Confirm new password</label>
            <Input id="confirm-password" type="password" className="rounded-xl" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" data-testid="input-confirm-password" />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          {saved && <p className="text-sm text-green-700">Password updated.</p>}
          <Button type="submit" className="w-full rounded-xl h-12" disabled={loading || !currentPassword || !newPassword || !confirmPassword} data-testid="button-save-password">
            {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Update password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
      onSuccess();
    } catch (err) {
      const status = err instanceof Error ? Number(err.message.split(":")[0]) : 0;
      if (status === 429) {
        setError("Too many attempts. Try again in a few minutes.");
      } else if (status >= 500) {
        setError("Sign in is unavailable. Try again shortly.");
      } else {
        setError("Incorrect password. Please try again.");
      }
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
  imageBackgroundColor,
}: {
  values: string[];
  onChange: (urls: string[]) => void;
  onUploadingChange: (uploading: boolean) => void;
  imageBackgroundColor: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [editingImage, setEditingImage] = useState<ExistingImageEdit | null>(null);
  const [editingImageSaving, setEditingImageSaving] = useState(false);
  const [editingImageError, setEditingImageError] = useState("");
  const [draggingImageIndex, setDraggingImageIndex] = useState<number | null>(null);
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
    const granted = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ contentType: file.type }),
    });
    const data = await granted.json().catch(() => ({})) as { uploadUrl?: string; url?: string; message?: string };
    if (!granted.ok || !data.uploadUrl || !data.url) {
      throw new Error(data.message || "Upload failed. Please try again.");
    }

    const uploaded = await fetch(data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!uploaded.ok) {
      throw new Error("Saving the image failed. Please try again.");
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

  const moveImage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= values.length || toIndex >= values.length) return;
    const next = [...values];
    const [movedImage] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, movedImage);
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
            <div
              key={`${url}-${i}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(i));
                setDraggingImageIndex(i);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const draggedIndex = event.dataTransfer.getData("text/plain");
                if (draggedIndex !== "") moveImage(Number(draggedIndex), i);
                setDraggingImageIndex(null);
              }}
              onDragEnd={() => setDraggingImageIndex(null)}
              className={`flex cursor-grab items-center gap-3 rounded-xl border border-border bg-muted/30 p-2 active:cursor-grabbing ${draggingImageIndex === i ? "opacity-50" : ""}`}
              title="Drag to reorder"
            >
              <button
                type="button"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                title="Move up"
                aria-label={`Move image ${i + 1} up`}
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => openExistingImage(i, url)}
                className="group relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                title="Open image preview and resize"
                aria-label={`Open image ${i + 1} preview and resize`}
              >
                <img src={url} alt="" className="h-full w-full rounded-lg object-contain" style={{ backgroundColor: imageBackgroundColor }} />
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
                  <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-lg p-3" style={{ backgroundColor: imageBackgroundColor }}>
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
                    <div className="mt-2 flex min-h-[280px] items-center justify-center overflow-hidden rounded-xl p-4" style={{ backgroundColor: imageBackgroundColor }}>
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
  const { data: products, isLoading } = useAdminProducts();
  const sortedProducts = [...(products ?? [])].sort((a, b) =>
    a.name.trim().localeCompare(b.name.trim(), undefined, { sensitivity: "base", numeric: true })
  );
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imagesUploading, setImagesUploading] = useState(false);
  const [productSaveError, setProductSaveError] = useState("");
  const [tab, setTab] = useState<"inventory" | "orders" | "inbox">("inventory");
  const [notesOpen, setNotesOpen] = useState(false);
  const [showNotesHistory, setShowNotesHistory] = useState(false);
  const [notes, setNotes] = useState<AdminNote[]>([]);
  const orderedNotes = showNotesHistory ? notes.filter((item) => item.kind === "todo" && item.completed) : [
    ...notes.filter((item) => item.kind === "todo" && !item.completed),
    ...notes.filter((item) => item.kind === "note"),
  ];
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteKind, setNoteKind] = useState<AdminNote["kind"]>("note");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [optionDraft, setOptionDraft] = useState<{ name: string; choices: { label: string; priceStr: string }[] }[]>([]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ADMIN_NOTES_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) setNotes(parsed.filter((item): item is AdminNote =>
          item && typeof item.id === "string" && typeof item.text === "string" &&
          (item.kind === "note" || item.kind === "todo") && typeof item.completed === "boolean"
        ));
      }
    } catch {
      // Ignore malformed or unavailable browser storage and start with an empty list.
    }
    setNotesLoaded(true);
  }, []);

  useEffect(() => {
    if (!notesLoaded) return;
    try {
      window.localStorage.setItem(ADMIN_NOTES_STORAGE_KEY, JSON.stringify(notes));
    } catch {
      // Notes remain usable for this session when browser storage is unavailable.
    }
  }, [notes, notesLoaded]);

  function moveNote(id: string, direction: -1 | 1) {
    setNotes((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index === -1) return current;

      const kind = current[index].kind;
      let neighbor = index + direction;
      while (neighbor >= 0 && neighbor < current.length &&
        (current[neighbor].kind !== kind || current[neighbor].completed !== current[index].completed)) {
        neighbor += direction;
      }
      if (neighbor < 0 || neighbor >= current.length) return current;

      const reordered = [...current];
      [reordered[index], reordered[neighbor]] = [reordered[neighbor], reordered[index]];
      return reordered;
    });
  }

  const saveNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    if (editingNoteId) {
      setNotes((current) => current.map((item) => item.id === editingNoteId
        ? { ...item, text, kind: noteKind, completed: item.kind === noteKind ? item.completed : false }
        : item));
      setEditingNoteId(null);
    } else {
      setNotes((current) => [{
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text,
        kind: noteKind,
        completed: false,
      }, ...current]);
    }
    setNoteDraft("");
  };

  const editNote = (note: AdminNote) => {
    setEditingNoteId(note.id);
    setNoteDraft(note.text);
    setNoteKind(note.kind);
  };

  const cancelNoteEdit = () => {
    setEditingNoteId(null);
    setNoteDraft("");
    setNoteKind("note");
  };

  const addNote = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveNote();
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "", description: "", madeFrom: "", measurements: "", timeToMake: "", priceStr: "", category: "", imageUrls: [],
      imageBackgroundColor: DEFAULT_IMAGE_BACKGROUND_COLOR,
      stockMode: "tracked",
      stockQuantityStr: "0",
    },
  });

  const openNew = () => {
    setEditingId(null);
    setProductSaveError("");
    form.reset({
      name: "", description: "", madeFrom: "", measurements: "", timeToMake: "", priceStr: "", category: "", imageUrls: [],
      imageBackgroundColor: DEFAULT_IMAGE_BACKGROUND_COLOR,
      stockMode: "tracked",
      stockQuantityStr: "0",
    });
    setOptionDraft([]);
    setIsOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingId(product.id);
    setProductSaveError("");
    form.reset({
      name: product.name,
      description: product.description,
      madeFrom: product.madeFrom ?? "",
      measurements: product.measurements ?? "",
      timeToMake: product.timeToMake ?? "",
      priceStr: (product.price / 100).toFixed(2),
      category: product.category,
      imageUrls: product.imageUrls ?? [],
      imageBackgroundColor: product.imageBackgroundColor ?? DEFAULT_IMAGE_BACKGROUND_COLOR,
      stockMode: product.stockMode ?? (product.stockAvailable === "Made to order" ? "made_to_order" : "tracked"),
      stockQuantityStr: String(product.stockQuantity ?? 0),
    });
    setOptionDraft((product.options ?? []).map((option) => ({
      name: option.name,
      choices: option.choices.map((choice) => ({
        label: choice.label,
        priceStr: (choice.priceDelta / 100).toFixed(2),
      })),
    })));
    setIsOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this item?")) {
      deleteProduct.mutate(id);
    }
  };

  const onSubmit = (data: FormValues) => {
    const price = Math.round(parseFloat(data.priceStr) * 100);
    const stockQuantity = data.stockMode === "tracked" ? Number(data.stockQuantityStr) : undefined;
    const options = optionDraft
      .filter((option) => option.name.trim() && option.choices.some((choice) => choice.label.trim()))
      .map((option) => ({
        name: option.name.trim(),
        choices: option.choices.filter((choice) => choice.label.trim()).map((choice) => ({
          label: choice.label.trim(),
          priceDelta: Math.round((Number(choice.priceStr) || 0) * 100),
        })),
      }));
    const payload = {
      name: data.name,
      description: data.description,
      madeFrom: data.madeFrom,
      measurements: data.measurements,
      timeToMake: data.timeToMake,
      price,
      category: data.category,
      imageUrls: data.imageUrls,
      imageBackgroundColor: data.imageBackgroundColor,
      stockMode: data.stockMode,
      stockQuantity,
      stockAvailable: getStockStatus(data.stockMode, stockQuantity),
      shopVisible: editingId ? products?.find((product) => product.id === editingId)?.shopVisible ?? true : true,
      options,
    };
    const confirmSavedStock = (saved: Product) => {
      if (saved.stockMode !== data.stockMode || saved.stockQuantity !== stockQuantity) {
        setProductSaveError("The server did not confirm the stock quantity. Restart the app server, then save again.");
        return false;
      }
      setProductSaveError("");
      return true;
    };

    if (editingId) {
      updateProduct.mutate({ id: editingId, ...payload }, {
        onSuccess: (saved) => { if (confirmSavedStock(saved)) setIsOpen(false); },
        onError: (error) => setProductSaveError(error.message),
      });
    } else {
      createProduct.mutate(payload, {
        onSuccess: (saved) => { if (confirmSavedStock(saved)) setIsOpen(false); },
        onError: (error) => setProductSaveError(error.message),
      });
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
            <p className="text-sm text-muted-foreground">{tab === "orders" ? "Review requests and reply by email" : tab === "inbox" ? "Shop email for info@ and audrey@" : "Manage your magical inventory"}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <ChangePassword />
          <Button variant="outline" size="sm" className="rounded-xl text-muted-foreground" onClick={() => setNotesOpen(true)}>
            <FileText className="mr-2 h-4 w-4" /> Notes
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl text-muted-foreground"
            onClick={() => {
              void apiRequest("POST", "/api/admin/logout").finally(() => {
                window.location.assign("/admin");
              });
            }}
          >
            Sign Out
          </Button>
          {tab === "inventory" && (
          <Dialog open={isOpen} onOpenChange={(open) => {
            if (!imagesUploading) setIsOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="rounded-xl bg-slate-900">
                <Plus className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[min(92vw,64rem)] max-w-none rounded-3xl border-2 border-border p-5 sm:p-8 max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">
                  {editingId ? "Edit Item" : "Create New Item"}
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!isPending && !imagesUploading) void form.handleSubmit(onSubmit)(event);
                  }}
                  onKeyDown={(event) => {
                    if (event.defaultPrevented || event.key !== "Enter" || event.nativeEvent.isComposing) return;
                    const field = event.target;
                    if (field instanceof HTMLInputElement && field.form === event.currentTarget && event.shiftKey) {
                      event.preventDefault();
                    }
                    if (!(field instanceof HTMLTextAreaElement) || field.form !== event.currentTarget || event.shiftKey) return;
                    event.preventDefault();
                    if (!event.repeat && !isPending && !imagesUploading) event.currentTarget.requestSubmit();
                  }}
                  className="space-y-4 mt-4"
                >
                  {productSaveError && <p role="alert" className="rounded-xl border border-[#D11C30]/25 bg-[#D11C30]/10 p-3 text-sm text-[#D11C30]">{productSaveError}</p>}
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Product Name</FormLabel><FormControl><Input className="rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="category" render={({ field }) => (
                    <FormItem><FormLabel>Category</FormLabel><FormControl><Input className="rounded-xl" placeholder="e.g. Animals, Bags..." {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="space-y-3 rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Options</p>
                      <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => setOptionDraft((current) => [...current, { name: "", choices: [{ label: "", priceStr: "0.00" }] }])}>
                        Add option
                      </Button>
                    </div>
                    {optionDraft.map((option, optionIndex) => (
                      <div key={optionIndex} className="space-y-2">
                        <Input className="rounded-xl" placeholder="Option name, e.g. Colour" value={option.name} onChange={(event) => setOptionDraft((current) => current.map((entry, index) => index === optionIndex ? { ...entry, name: event.target.value } : entry))} />
                        {option.choices.map((choice, choiceIndex) => (
                          <div key={choiceIndex} className="flex gap-2">
                            <Input className="rounded-xl" placeholder="Choice" value={choice.label} onChange={(event) => setOptionDraft((current) => current.map((entry, index) => index === optionIndex ? { ...entry, choices: entry.choices.map((item, itemIndex) => itemIndex === choiceIndex ? { ...item, label: event.target.value } : item) } : entry))} />
                            <Input className="rounded-xl w-28" placeholder="Extra $" value={choice.priceStr} onChange={(event) => setOptionDraft((current) => current.map((entry, index) => index === optionIndex ? { ...entry, choices: entry.choices.map((item, itemIndex) => itemIndex === choiceIndex ? { ...item, priceStr: event.target.value } : item) } : entry))} />
                          </div>
                        ))}
                        <Button type="button" size="sm" variant="ghost" onClick={() => setOptionDraft((current) => current.map((entry, index) => index === optionIndex ? { ...entry, choices: [...entry.choices, { label: "", priceStr: "0.00" }] } : entry))}>
                          Add choice
                        </Button>
                      </div>
                    ))}
                  </div>
                  <FormField control={form.control} name="priceStr" render={({ field }) => (
                    <FormItem><FormLabel>Price ($)</FormLabel><FormControl><Input className="rounded-xl" placeholder="19.99" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="imageBackgroundColor" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Image background colour</FormLabel>
                      <div className="flex items-center gap-3">
                        <FormControl><Input type="color" aria-label="Choose image background colour" className="h-11 w-16 cursor-pointer rounded-xl p-1" {...field} /></FormControl>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="h-7 w-7 rounded-md border border-border" style={{ backgroundColor: field.value }} />
                          <span className="font-mono uppercase">{field.value}</span>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => field.onChange(DEFAULT_IMAGE_BACKGROUND_COLOR)}>Reset</Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Shows behind transparent areas of the product images.</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="imageUrls" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Images</FormLabel>
                      <p className="text-xs text-muted-foreground -mt-1">The first image is shown as the main photo. Drag images or use the arrow to reorder.</p>
                      <FormControl>
                        <MultiImageUploader
                          values={field.value}
                          onChange={field.onChange}
                          onUploadingChange={setImagesUploading}
                          imageBackgroundColor={form.watch("imageBackgroundColor")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Description (optional)</FormLabel><FormControl><Textarea className="rounded-xl resize-y" rows={4} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="madeFrom" render={({ field }) => (
                    <FormItem><FormLabel>Made from</FormLabel><FormControl><Textarea className="rounded-xl resize-y" rows={3} placeholder="Materials used to make this item" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="measurements" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Measurements</FormLabel>
                      <FormControl>
                        <Textarea className="min-h-9 resize-y rounded-xl" rows={1} placeholder="e.g. 12 × 8 cm" maxLength={200} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="timeToMake" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time to make</FormLabel>
                      <FormControl>
                        <Input className="rounded-xl" placeholder="e.g. 1–2 weeks" maxLength={100} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="stockMode" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stock type</FormLabel>
                      <FormControl>
                        <select
                          ref={field.ref}
                          name={field.name}
                          value={field.value}
                          onBlur={field.onBlur}
                          onChange={(event) => field.onChange(event.target.value)}
                          className="flex h-10 w-full max-w-xs rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          aria-label="Stock type"
                        >
                          <option value="tracked">Track stock quantity</option>
                          <option value="made_to_order">Made to order</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {form.watch("stockMode") === "tracked" && (
                    <FormField control={form.control} name="stockQuantityStr" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity in stock</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className="w-full max-w-xs rounded-xl"
                              placeholder="0"
                              {...field}
                              value={field.value ?? ""}
                              onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ""))}
                              aria-label="Quantity in stock"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-11 w-11 shrink-0 rounded-xl"
                              aria-label="Increase stock quantity by one"
                              onClick={() => field.onChange(String((Number(field.value) || 0) + 1))}
                            >
                              <ChevronUp className="h-5 w-5" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-11 w-11 shrink-0 rounded-xl"
                              aria-label="Decrease stock quantity by one"
                              onClick={() => field.onChange(String(Math.max(0, (Number(field.value) || 0) - 1)))}
                            >
                              <ChevronDown className="h-5 w-5" />
                            </Button>
                          </div>
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Products with 3 or fewer remaining will show as low stock.</p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}
                  <Button type="submit" className="w-full rounded-xl mt-6 h-12" disabled={isPending || imagesUploading}>
                    {isPending ? <Loader2 className="animate-spin h-5 w-5" /> : "Save"}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <Dialog open={notesOpen} onOpenChange={(open) => {
        setNotesOpen(open);
        if (!open) setShowNotesHistory(false);
      }}>
        <DialogContent className="w-[min(92vw,40rem)] max-w-none rounded-3xl border-2 border-border p-5 sm:p-8 max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <DialogTitle className="font-display text-2xl">{showNotesHistory ? "To-do history" : "Notes & To-do"}</DialogTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNotesHistory(!showNotesHistory)}>
                {showNotesHistory ? "Back to list" : "History"}
              </Button>
            </div>
            <DialogDescription>
              {showNotesHistory ? "Uncheck a to-do to return it to the active list." : "Keep notes and tasks for your shop. They are saved in this browser."}
            </DialogDescription>
          </DialogHeader>
          {!showNotesHistory && <form onSubmit={addNote} className="space-y-3">
            <Textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder={noteKind === "todo" ? "Write a task…" : "Write a note…"}
              rows={3}
              className="rounded-xl resize-y focus-visible:border-[#2D9950] focus-visible:ring-[#2D9950]"
              aria-label={noteKind === "todo" ? "To-do text" : "Note text"}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  saveNote();
                }
              }}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={noteKind}
                onChange={(event) => setNoteKind(event.target.value as AdminNote["kind"])}
                className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm"
                aria-label="Entry type"
              >
                <option value="note">Note</option>
                <option value="todo">To-do</option>
              </select>
              <div className="flex gap-2">
                {editingNoteId && <Button type="button" variant="outline" className="rounded-xl" onClick={cancelNoteEdit}>Cancel</Button>}
                <Button type="submit" className="rounded-xl border-[#2D9950] bg-[#2D9950] text-white hover:border-[#2D9950] hover:bg-[#2D9950]" disabled={!noteDraft.trim()}>{editingNoteId ? "Save changes" : "Add"}</Button>
              </div>
            </div>
          </form>}
          <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
            {orderedNotes.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {showNotesHistory ? "Completed to-dos will appear here." : "Your notes and to-do items will appear here."}
              </p>
            ) : orderedNotes.map((note, index) => (
              <div key={note.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                {note.kind === "todo" ? (
                  <input
                    type="checkbox"
                    checked={note.completed}
                    onChange={() => setNotes((current) => current.map((item) => item.id === note.id ? { ...item, completed: !item.completed } : item))}
                    className="mt-1 h-4 w-4 accent-green-700"
                    aria-label={`Mark to-do ${note.completed ? "incomplete" : "complete"}`}
                  />
                ) : <FileText className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{note.kind === "todo" ? "To-do" : "Note"}</p>
                  <p className={`whitespace-pre-wrap break-words text-sm ${note.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{note.text}</p>
                </div>
                {!showNotesHistory && <div className="grid shrink-0 grid-cols-2 gap-1 sm:grid-cols-4">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveNote(note.id, -1)} disabled={orderedNotes[index - 1]?.kind !== note.kind} aria-label={`Move ${note.kind === "todo" ? "to-do" : "note"} up`}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveNote(note.id, 1)} disabled={orderedNotes[index + 1]?.kind !== note.kind} aria-label={`Move ${note.kind === "todo" ? "to-do" : "note"} down`}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => editNote(note)} aria-label={`Edit ${note.kind === "todo" ? "to-do" : "note"}`}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                    setNotes((current) => current.filter((item) => item.id !== note.id));
                    if (editingNoteId === note.id) cancelNoteEdit();
                  }} aria-label={`Delete ${note.kind === "todo" ? "to-do" : "note"}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex gap-2 mb-6">
        <Button type="button" variant={tab === "inventory" ? "default" : "outline"} className={`rounded-xl ${tab === "inventory" ? "border-[#2D9950] bg-[#2D9950] text-white hover:border-[#2D9950] hover:bg-[#2D9950]" : ""}`} onClick={() => setTab("inventory")}>Inventory</Button>
        <Button type="button" variant={tab === "orders" ? "default" : "outline"} className={`rounded-xl ${tab === "orders" ? "border-[#2D9950] bg-[#2D9950] text-white hover:border-[#2D9950] hover:bg-[#2D9950]" : ""}`} onClick={() => setTab("orders")}>Orders</Button>
        <Button type="button" variant={tab === "inbox" ? "default" : "outline"} className={`rounded-xl ${tab === "inbox" ? "border-[#2D9950] bg-[#2D9950] text-white hover:border-[#2D9950] hover:bg-[#2D9950]" : ""}`} onClick={() => setTab("inbox")}>Inbox</Button>
      </div>

      {tab === "orders" ? <OrdersPanel /> : tab === "inbox" ? <InboxPanel /> : (
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
                  <th className="p-4 font-bold">Stock</th>
                  <th className="p-4 font-bold">Images</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product) => (
                  <tr key={product.id} className="border-b border-border/50 hover:bg-muted/20" data-testid={`row-product-${product.id}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        {product.imageUrls?.[0] ? (
                          <img src={product.imageUrls[0]} alt="" className="w-12 h-12 rounded-lg object-contain flex-shrink-0" style={{ backgroundColor: product.imageBackgroundColor ?? DEFAULT_IMAGE_BACKGROUND_COLOR }} />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted flex-shrink-0" />
                        )}
                        <div>
                          <span className="font-semibold">{product.name}</span>
                          {product.shopVisible === false && (
                            <span className="mt-1 block text-xs font-medium text-muted-foreground">Hidden from shop</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline [box-decoration-break:clone] [-webkit-box-decoration-break:clone] px-3 py-1 rounded-full text-xs font-bold ${
                          product.category.toLowerCase() === "christmas decorations"
                            ? "border border-green-200 bg-green-100 text-green-700"
                            : product.category.toLowerCase() === "accessories"
                              ? "border border-purple-200 bg-purple-100 text-purple-700"
                            : "bg-muted"
                        }`}
                      >
                        {product.category}
                      </span>
                    </td>
                    <td className="p-4 font-bold">${(product.price / 100).toFixed(2)}</td>
                    <td className="p-4 text-sm text-black">{getStockLabel(product, { showInStockQuantity: true })}</td>
                    <td className="p-4">
                      <div className="flex gap-1">
                        {product.imageUrls?.slice(0, 3).map((url, i) => (
                          <img key={i} src={url} alt="" className="w-8 h-8 rounded object-contain" style={{ backgroundColor: product.imageBackgroundColor ?? DEFAULT_IMAGE_BACKGROUND_COLOR }} />
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => updateProduct.mutate({ id: product.id, shopVisible: product.shopVisible === false })}
                        disabled={updateProduct.isPending}
                        aria-label={`${product.shopVisible === false ? "Show" : "Hide"} ${product.name} ${product.shopVisible === false ? "in" : "from"} shop`}
                        title={product.shopVisible === false ? "Show in shop" : "Hide from shop"}
                      >
                        {product.shopVisible === false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
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
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Inventory is empty. Start adding products!</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export default function Admin() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest("GET", "/api/admin/session")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!cancelled) setAuthenticated(body?.success === true);
      })
      .catch(() => {
        if (!cancelled) setAuthenticated(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  return <AdminPortal />;
}
