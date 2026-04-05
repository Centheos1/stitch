import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Edit, Plus, Trash2, ShieldCheck, Loader2, Lock, Upload, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { ProductInput, Product } from "@shared/routes";

const productFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  priceStr: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid price (e.g. 19.99)"),
  category: z.string().min(1, "Category is required"),
  imageUrl: z.string().url("Must be a valid image URL"),
});

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

function ImageUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      onChange(data.url);
    } catch {
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className="relative border-2 border-dashed border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-colors text-center"
        onClick={() => fileRef.current?.click()}
        data-testid="upload-image-area"
      >
        {value ? (
          <div className="relative inline-block">
            <img src={value} alt="Preview" className="h-32 w-auto mx-auto rounded-lg object-cover" />
            <button
              type="button"
              className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="py-4">
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Click to upload an image</p>
                <p className="text-xs text-muted-foreground/60 mt-1">JPG, PNG, GIF up to 10MB</p>
              </>
            )}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      <Input
        className="rounded-xl text-xs"
        placeholder="Or paste an image URL…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
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

  const form = useForm<z.infer<typeof productFormSchema>>({
    resolver: zodResolver(productFormSchema),
    defaultValues: { name: "", description: "", priceStr: "", category: "", imageUrl: "" },
  });

  const openNew = () => {
    setEditingId(null);
    form.reset({ name: "", description: "", priceStr: "", category: "", imageUrl: "https://images.unsplash.com/photo-1605335198426-8097b6fa2e75?w=500&q=80" });
    setIsOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingId(product.id);
    form.reset({
      name: product.name,
      description: product.description,
      priceStr: (product.price / 100).toFixed(2),
      category: product.category,
      imageUrl: product.imageUrl,
    });
    setIsOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this cute item?")) {
      deleteProduct.mutate(id);
    }
  };

  const onSubmit = (data: z.infer<typeof productFormSchema>) => {
    const price = Math.round(parseFloat(data.priceStr) * 100);
    const payload: ProductInput = {
      name: data.name,
      description: data.description,
      price,
      category: data.category,
      imageUrl: data.imageUrl,
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
            <DialogContent className="sm:max-w-[500px] rounded-3xl border-2 border-border p-8">
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
                  <FormField control={form.control} name="imageUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product Image</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value} onChange={field.onChange} />
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
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products?.map((product) => (
                  <tr key={product.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="p-4">
                      <div className="flex items-center gap-4">
                        <img src={product.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                        <span className="font-semibold">{product.name}</span>
                      </div>
                    </td>
                    <td className="p-4"><span className="px-3 py-1 bg-muted rounded-full text-xs font-bold">{product.category}</span></td>
                    <td className="p-4 font-bold">${(product.price / 100).toFixed(2)}</td>
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
                  <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Inventory is empty. Start adding products!</td></tr>
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
