import { useRoute } from "wouter";
import { useProduct } from "@/hooks/use-products";
import { useCart } from "@/hooks/use-cart";
import { Button } from "@/components/ui/button";
import { useState, useRef, useCallback, useEffect } from "react";
import { Minus, Plus, ShoppingCart, Heart, ArrowLeft, ZoomIn, ZoomOut, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;

  const { data: product, isLoading, error } = useProduct(id);
  const addItem = useCart((state) => state.addItem);
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const stateRef = useRef({ zoom: 1, pan: { x: 0, y: 0 }, dragging: false, lastX: 0, lastY: 0 });

  const images = product?.imageUrls ?? [];
  const currentImage = images[selectedIndex] ?? images[0] ?? "";

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(5, Math.max(1, next));
    stateRef.current.zoom = clamped;
    if (clamped <= 1) { stateRef.current.pan = { x: 0, y: 0 }; setPan({ x: 0, y: 0 }); }
    setZoom(clamped);
  }, []);

  const openLightbox = (index?: number) => {
    if (index !== undefined) setSelectedIndex(index);
    stateRef.current = { zoom: 1, pan: { x: 0, y: 0 }, dragging: false, lastX: 0, lastY: 0 };
    setZoom(1); setPan({ x: 0, y: 0 }); setIsDragging(false);
    setLightboxOpen(true);
  };
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const stepZoom = useCallback((delta: number) => {
    applyZoom(stateRef.current.zoom + delta);
  }, [applyZoom]);

  const prevImage = () => setSelectedIndex((i) => (i - 1 + images.length) % images.length);
  const nextImage = () => setSelectedIndex((i) => (i + 1) % images.length);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyZoom(stateRef.current.zoom - e.deltaY * 0.003);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (stateRef.current.zoom <= 1) return;
      stateRef.current.dragging = true;
      stateRef.current.lastX = e.clientX;
      stateRef.current.lastY = e.clientY;
      setIsDragging(true);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!stateRef.current.dragging) return;
      const dx = e.clientX - stateRef.current.lastX;
      const dy = e.clientY - stateRef.current.lastY;
      stateRef.current.lastX = e.clientX;
      stateRef.current.lastY = e.clientY;
      stateRef.current.pan.x += dx;
      stateRef.current.pan.y += dy;
      setPan({ ...stateRef.current.pan });
    };
    const onMouseUp = () => { stateRef.current.dragging = false; setIsDragging(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft" && images.length > 1) { setSelectedIndex((i) => (i - 1 + images.length) % images.length); applyZoom(1); }
      if (e.key === "ArrowRight" && images.length > 1) { setSelectedIndex((i) => (i + 1) % images.length); applyZoom(1); }
    };
    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKey);
    };
  }, [lightboxOpen, applyZoom, closeLightbox, images.length]);

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

            {/* Image gallery */}
            <div className="space-y-3">
              {/* Main image */}
              <div
                className="relative h-[55vh] max-h-[520px] w-full rounded-[2rem] overflow-hidden bg-muted/30 p-4 border-2 border-dashed border-border/50 cursor-zoom-in group"
                style={{ height: "min(55svh, 520px)" }}
                onClick={() => openLightbox(selectedIndex)}
                data-testid="product-image-zoom-trigger"
              >
                {currentImage ? (
                  <img
                    src={currentImage}
                    alt={product.name}
                    className="w-full h-full object-contain rounded-[1.5rem] shadow-md"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">No image</div>
                )}
                <div className="absolute bottom-6 right-6 bg-white/80 backdrop-blur-sm rounded-xl p-2 shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn className="h-5 w-5 text-foreground" />
                </div>
                {images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); prevImage(); }}
                      className="absolute left-6 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); nextImage(); }}
                      className="absolute right-14 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedIndex(i)}
                      className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                        i === selectedIndex ? "border-primary shadow-md scale-105" : "border-transparent hover:border-border"
                      }`}
                      data-testid={`thumbnail-${i}`}
                    >
                      <img src={url} alt={`${product.name} view ${i + 1}`} className="w-full h-full object-contain bg-white" />
                    </button>
                  ))}
                </div>
              )}
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
            <button className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors" onClick={(e) => { e.stopPropagation(); stepZoom(0.5); }} data-testid="lightbox-zoom-in"><ZoomIn className="h-5 w-5" /></button>
            <button className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors" onClick={(e) => { e.stopPropagation(); stepZoom(-0.5); }} data-testid="lightbox-zoom-out"><ZoomOut className="h-5 w-5" /></button>
            <button className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors" onClick={closeLightbox} data-testid="lightbox-close"><X className="h-5 w-5" /></button>
          </div>

          {zoom > 1 && (
            <div className="absolute top-4 left-4 bg-white/20 text-white text-sm rounded-full px-3 py-1 select-none">
              {Math.round(zoom * 100)}%
            </div>
          )}

          {/* Prev/Next in lightbox */}
          {images.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 z-10"
                onClick={(e) => { e.stopPropagation(); setSelectedIndex((i) => (i - 1 + images.length) % images.length); applyZoom(1); }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                className="absolute right-20 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 z-10"
                onClick={(e) => { e.stopPropagation(); setSelectedIndex((i) => (i + 1) % images.length); applyZoom(1); }}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm select-none whitespace-nowrap">
            {images.length > 1 && <span>{selectedIndex + 1} / {images.length} &nbsp;·&nbsp; </span>}
            Scroll to zoom &nbsp;·&nbsp; Drag to pan &nbsp;·&nbsp; Esc to close
          </div>

          {/* Thumbnail strip in lightbox */}
          {images.length > 1 && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-2">
              {images.map((url, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setSelectedIndex(i); applyZoom(1); }}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${i === selectedIndex ? "border-white scale-110" : "border-white/30 opacity-60 hover:opacity-100"}`}
                >
                  <img src={url} alt="" className="w-full h-full object-contain bg-white" />
                </button>
              ))}
            </div>
          )}

          {/* Image container */}
          <div
            className="overflow-hidden w-[90vw] h-[80vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in" }}
          >
            <img
              src={currentImage}
              alt={product.name}
              draggable={false}
              className="select-none"
              style={{
                maxWidth: "90vw",
                maxHeight: "80vh",
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
