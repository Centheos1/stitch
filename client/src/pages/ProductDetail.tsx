import { useRoute } from "wouter";
import { useProduct } from "@/hooks/use-products";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { useState, useRef, useCallback, useEffect } from "react";
import { Minus, Plus, ShoppingCart, Heart, ArrowLeft, ZoomIn, ZoomOut, X } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: product, isLoading, error } = useProduct(id);
  const addItem = useCart((state) => state.addItem);
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const openLightbox = () => {
    setLightboxOpen(true);
    setZoom(1); zoomRef.current = 1;
    setPan({ x: 0, y: 0 }); panRef.current = { x: 0, y: 0 };
  };
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  // Native wheel listener so we can call preventDefault() (passive:false)
  useEffect(() => {
    if (!lightboxOpen) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const next = Math.min(5, Math.max(1, zoomRef.current - e.deltaY * 0.003));
      zoomRef.current = next;
      if (next <= 1) { panRef.current = { x: 0, y: 0 }; setPan({ x: 0, y: 0 }); }
      setZoom(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [lightboxOpen]);

  // Keyboard close
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeLightbox(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, closeLightbox]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomRef.current <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    const next = { x: panRef.current.x + dx, y: panRef.current.y + dy };
    panRef.current = next;
    setPan({ ...next });
  };

  const handleMouseUp = () => setIsDragging(false);

  const stepZoom = useCallback((delta: number) => {
    const next = Math.min(5, Math.max(1, zoomRef.current + delta));
    zoomRef.current = next;
    if (next <= 1) { panRef.current = { x: 0, y: 0 }; setPan({ x: 0, y: 0 }); }
    setZoom(next);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen pt-20 px-4 max-w-7xl mx-auto flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-primary border-r-4 border-r-transparent"></div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <h1 className="font-display text-4xl font-bold mb-4 text-destructive">Oops!</h1>
        <p className="text-xl text-muted-foreground mb-8">We couldn't find that special item.</p>
        <Link href="/shop">
          <Button size="lg" className="rounded-2xl h-14 px-8">Back to Shop</Button>
        </Link>
      </div>
    );
  }

  const handleAddToCart = () => {
    addItem(product, quantity);
    toast({
      title: "Added to cart! 🛍️",
      description: `${quantity}x ${product.name} added.`,
      className: "bg-white border-2 border-primary/20 rounded-2xl shadow-xl",
    });
  };

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        
        <Link href="/shop" className="inline-flex items-center text-muted-foreground hover:text-primary font-semibold mb-8 transition-colors">
          <ArrowLeft className="mr-2 h-5 w-5" /> Back to Shop
        </Link>

        <div className="bg-white rounded-[3rem] p-6 lg:p-12 shadow-sm border border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            
            {/* Image — click to open lightbox */}
            <div
              className="relative aspect-square rounded-[2rem] overflow-hidden bg-muted/30 p-4 border-2 border-dashed border-border/50 cursor-zoom-in group"
              onClick={openLightbox}
              data-testid="product-image-zoom-trigger"
            >
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-full h-full object-cover rounded-[1.5rem] shadow-md transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute bottom-6 right-6 bg-white/80 backdrop-blur-sm rounded-xl p-2 shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                <ZoomIn className="h-5 w-5 text-foreground" />
              </div>
            </div>

            {/* Details */}
            <div className="flex flex-col justify-center">
              <div className="mb-2">
                <span className="inline-block px-4 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {product.category}
                </span>
              </div>
              
              <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
                {product.name}
              </h1>
              
              <div className="font-display text-4xl font-bold text-secondary mb-6">
                ${(product.price / 100).toFixed(2)}
              </div>
              
              <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
                {product.description}
              </p>

              <div className="bg-background rounded-3xl p-6 border border-border/50 mb-10">
                <div className="flex items-center gap-4 mb-6">
                  <div className="font-bold text-foreground">Quantity:</div>
                  <div className="flex items-center bg-white rounded-xl border border-border overflow-hidden shadow-sm">
                    <button 
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="px-4 py-3 hover:bg-muted text-foreground transition-colors"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="w-12 text-center font-bold text-lg">{quantity}</div>
                    <button 
                      onClick={() => setQuantity(quantity + 1)}
                      className="px-4 py-3 hover:bg-muted text-foreground transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button 
                    onClick={handleAddToCart}
                    size="lg" 
                    className="flex-1 rounded-2xl h-16 text-lg font-bold shadow-lg shadow-primary/25 hover:-translate-y-1 transition-all"
                  >
                    <ShoppingCart className="mr-2 h-5 w-5" /> Add to Cart
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-16 w-16 rounded-2xl border-2 border-border text-muted-foreground hover:text-red-500 hover:border-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Heart className="h-6 w-6" />
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground flex flex-col gap-2">
                <p>✨ Handcrafted with love and care</p>
                <p>📦 Ships securely packaged</p>
                <p>💖 Supports independent creators</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={closeLightbox}
          data-testid="lightbox-overlay"
        >
          {/* Controls */}
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            <button
              className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors"
              onClick={(e) => { e.stopPropagation(); stepZoom(0.5); }}
              data-testid="lightbox-zoom-in"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <button
              className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors"
              onClick={(e) => { e.stopPropagation(); stepZoom(-0.5); }}
              data-testid="lightbox-zoom-out"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <button
              className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors"
              onClick={closeLightbox}
              data-testid="lightbox-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Zoom level indicator */}
          {zoom > 1 && (
            <div className="absolute top-4 left-4 bg-white/20 text-white text-sm rounded-full px-3 py-1 select-none">
              {Math.round(zoom * 100)}%
            </div>
          )}

          {/* Zoom hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm select-none whitespace-nowrap">
            Scroll to zoom &nbsp;·&nbsp; Drag to pan &nbsp;·&nbsp; Press Esc to close
          </div>

          {/* Image container */}
          <div
            ref={containerRef}
            className="overflow-hidden w-[90vw] h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in" }}
          >
            <img
              src={product.imageUrl}
              alt={product.name}
              draggable={false}
              className="select-none"
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                objectFit: "contain",
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transition: isDragging ? "none" : "transform 0.15s ease",
              }}
              data-testid="lightbox-image"
            />
          </div>
        </div>
      )}
    </div>
  );
}
