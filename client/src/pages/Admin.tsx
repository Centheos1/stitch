import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Edit, Plus, Trash2, ShieldCheck, Loader2, Lock, Upload, X, GripVertical } from "lucide-react";
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

function MultiImageUploader({ values, onChange }: { values: string[]; onChange: (urls: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append("image", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    return data.url ?? null;
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = await Promise.all(files.map(uploadFile));
      onChange([...values, ...urls.filter(Boolean) as string[]]);
    } catch {
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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
              <img src={url} alt="" className="h-14 w-14 object-cover rounded-lg flex-shrink-0" />
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

      {/* Upload button */}
      <div
        className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => fileRef.current?.click()}
        data-testid="upload-image-area"
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        ) : (
          <>
            <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
            <p className="text-sm text-muted-foreground">Click to upload images</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Select multiple files at once — JPG, PNG, GIF up to 10MB each</p>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      </div>

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
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
                        <MultiImageUploader values={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Description</FormLabel><FormControl><Input className="rounded-xl" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <Button type="submit" className="w-full rounded-xl mt-6 h-12" disabled={isPending}>
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
                          <img src={product.imageUrls[0]} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
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
                          <img key={i} src={url} alt="" className="w-8 h-8 rounded object-cover" />
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
