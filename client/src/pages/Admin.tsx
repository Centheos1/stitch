import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/use-products";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Edit, Plus, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import type { ProductInput, Product } from "@shared/routes";

// Extend base schema for form to handle price parsing correctly
const productFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(1, "Description is required"),
  priceStr: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a valid price (e.g. 19.99)"),
  category: z.string().min(1, "Category is required"),
  imageUrl: z.string().url("Must be a valid image URL"),
});

export default function Admin() {
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
    // Convert price string (dollars) to integer (cents)
    const price = Math.round(parseFloat(data.priceStr) * 100);
    
    const payload: ProductInput = {
      name: data.name,
      description: data.description,
      price,
      category: data.category,
      imageUrl: data.imageUrl,
    };

    if (editingId) {
      updateProduct.mutate({ id: editingId, ...payload }, {
        onSuccess: () => setIsOpen(false)
      });
    } else {
      createProduct.mutate(payload, {
        onSuccess: () => setIsOpen(false)
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
            <p className="text-sm text-muted-foreground">Manage your magical inventory</p>
          </div>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="rounded-xl bg-slate-900 hover:bg-slate-800">
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
                  <FormItem><FormLabel>Product Name</FormLabel><FormControl><Input className="rounded-xl" {...field} /></FormControl><FormMessage/></FormItem>
                )}/>
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem><FormLabel>Category</FormLabel><FormControl><Input className="rounded-xl" placeholder="e.g. Animals, Bags..." {...field} /></FormControl><FormMessage/></FormItem>
                )}/>
                <FormField control={form.control} name="priceStr" render={({ field }) => (
                  <FormItem><FormLabel>Price ($)</FormLabel><FormControl><Input className="rounded-xl" placeholder="19.99" {...field} /></FormControl><FormMessage/></FormItem>
                )}/>
                <FormField control={form.control} name="imageUrl" render={({ field }) => (
                  <FormItem><FormLabel>Image URL (Unsplash recommended)</FormLabel><FormControl><Input className="rounded-xl" {...field} /></FormControl><FormMessage/></FormItem>
                )}/>
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel>Description</FormLabel><FormControl><Input className="rounded-xl" {...field} /></FormControl><FormMessage/></FormItem>
                )}/>
                
                <Button type="submit" className="w-full rounded-xl mt-6 h-12" disabled={isPending}>
                  {isPending ? <Loader2 className="animate-spin h-5 w-5" /> : "Save Magic"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
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
                      <Button variant="ghost" size="icon" onClick={() => openEdit(product)} className="hover:text-blue-600">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)} className="hover:text-red-600" disabled={deleteProduct.isPending}>
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
