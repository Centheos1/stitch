import { StockLabel } from "@/components/StockLabel";
import { useRoute } from "wouter";
import { useProduct } from "@/hooks/use-products";
import { remainingStock, unitPrice, useCart } from "@/hooks/use-cart";
import { type SelectedOption } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState, useRef, useCallback, useEffect } from "react";
import { Minus, Plus, ShoppingCart, ArrowLeft, ZoomIn, ZoomOut, X, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const id = params?.id ?? "";

  const { data: product, isLoading, error } = useProduct(id);
  const addItem = useCart((state) => state.addItem);
  const cartItems = useCart((state) => state.items);
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const stateRef = useRef({ zoom: 1, pan: { x: 0, y: 0 }, dragging: false, lastX: 0, lastY: 0 });
  const lightboxContainerRef = useRef<HTMLDivElement>(null);
  const lightboxImageRef = useRef<HTMLImageElement>(null);

  const images = product?.imageUrls ?? [];
  const currentImage = images[selectedIndex] ?? images[0] ?? "";
  const chosen: SelectedOption[] = (product?.options ?? []).map((option) => ({
    name: option.name,
    choice: selectedOptions[option.name] || option.choices[0]?.label || "",
  }));
  const price = product ? unitPrice(product, chosen) : 0;

  const clampPan = useCallback((nextPan: { x: number; y: number }, currentZoom: number) => {
    const container = lightboxContainerRef.current;
    const image = lightboxImageRef.current;
    if (currentZoom <= 1 || !container || !image) return { x: 0, y: 0 };

    const maxX = Math.max(0, (image.offsetWidth * currentZoom - container.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * currentZoom - container.clientHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
      y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
    };
  }, []);

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(5, Math.max(1, next));
    stateRef.current.zoom = clamped;
    const nextPan = clampPan(stateRef.current.pan, clamped);
    stateRef.current.pan = nextPan;
    setPan(nextPan);
    setZoom(clamped);
  }, [clampPan]);

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
      const currentZoom = stateRef.current.zoom;
      if (currentZoom <= 1 || e.ctrlKey) {
        applyZoom(currentZoom - e.deltaY * 0.003);
        return;
      }

      const nextPan = clampPan({
        x: stateRef.current.pan.x - e.deltaX,
        y: stateRef.current.pan.y - e.deltaY,
      }, currentZoom);
      stateRef.current.pan = nextPan;
      setPan(nextPan);
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
      const nextPan = clampPan({
        x: stateRef.current.pan.x + dx,
        y: stateRef.current.pan.y + dy,
      }, stateRef.current.zoom);
      stateRef.current.pan = nextPan;
      setPan(nextPan);
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
  }, [lightboxOpen, applyZoom, clampPan, closeLightbox, images.length]);

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
        <Button asChild size="lg" className="rounded-2xl h-14 px-8">
          <Link href="/shop">Back to Shop</Link>
        </Button>
        <Link href="/" className="mt-4 text-sm font-semibold text-primary hover:underline">
          Return Home
        </Link>
      </div>
    );
  }

  const available = remainingStock(cartItems, product);
  const selectedQuantity = Math.min(quantity, Math.max(1, available));

  const handleAddToCart = () => {
    if (!product) return;
    addItem(product, selectedQuantity, chosen);
    setQuantity(1);
  };

  return (
    <div className="min-h-screen py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        <Link href="/shop" className="inline-flex items-center text-muted-foreground hover:text-green-800 font-semibold mb-8 transition-colors">
          <ArrowLeft className="mr-2 h-5 w-5" /> Back to Shop
        </Link>

        <div className="bg-white rounded-[3rem] p-6 lg:p-12 shadow-sm border border-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">

            {/* Image gallery */}
            <div className="space-y-3">
              {/* Main image */}
              <div
                className="relative flex h-[55vh] max-h-[520px] w-full items-center justify-center rounded-[2rem] overflow-hidden p-4 border-2 border-border/50 cursor-zoom-in group"
                style={{ height: "min(55svh, 520px)", backgroundColor: product.imageBackgroundColor ?? "#ffffff" }}
                onClick={() => openLightbox(selectedIndex)}
                data-testid="product-image-zoom-trigger"
              >
                {currentImage ? (
                  <img
                    src={currentImage}
                    alt={product.name}
                    className="max-h-full max-w-full rounded-[1.5rem]"
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
                      className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border transition-all ${
                        i === selectedIndex ? "border-black shadow-sm scale-105" : "border-transparent hover:border-border"
                      }`}
                      data-testid={`thumbnail-${i}`}
                    >
                      <img src={url} alt={`${product.name} view ${i + 1}`} className="w-full h-full object-contain" style={{ backgroundColor: product.imageBackgroundColor ?? "#ffffff" }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex flex-col justify-center">
              <h1 className="font-display text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
                {product.name}
              </h1>

              <div className="font-display text-4xl font-bold text-black mb-6">
                ${(price / 100).toFixed(2)}
              </div>

              {product.description && (
                <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                  {product.description}
                </p>
              )}
              {(product.madeFrom?.trim() || product.measurements || product.timeToMake) && (
                <Collapsible key={product.id} className="mb-6 border-t border-border pt-6">
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant="outline" className="group rounded-xl">
                      Product information
                      <ChevronDown aria-hidden="true" className="group-data-[state=open]:rotate-180" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4 leading-relaxed text-muted-foreground">
                    {product.madeFrom?.trim() && (
                      <p className="whitespace-pre-line">
                        <span className="font-semibold text-foreground">Made from: </span>{product.madeFrom}
                      </p>
                    )}
                    {product.measurements && (
                      <p className="whitespace-pre-line">
                        <span className="font-semibold text-foreground">Approximate measurements: </span>{product.measurements}
                      </p>
                    )}
                    {product.timeToMake && (
                      <p><span className="font-semibold text-foreground">Time to make: </span>{product.timeToMake}</p>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="mx-auto mb-10 w-full rounded-3xl border border-border/50 bg-background p-6 sm:w-[calc(100%_-_1in)]">
                {(product.options ?? []).map((option) => (
                  <div key={option.name} className="mb-6">
                    <div className="font-bold text-foreground mb-2">{option.name}</div>
                    <div className="flex flex-wrap gap-2">
                      {option.choices.map((choice) => {
                        const active = (selectedOptions[option.name] || option.choices[0]?.label) === choice.label;
                        return (
                          <button
                            key={choice.label}
                            type="button"
                            onClick={() => setSelectedOptions((current) => ({ ...current, [option.name]: choice.label }))}
                            className={`rounded-xl border px-4 py-2 text-sm font-semibold ${active ? "border-slate-900 bg-slate-900 text-white" : "border-border bg-white"}`}
                          >
                            {choice.label}
                            {choice.priceDelta > 0 ? ` +$${(choice.priceDelta / 100).toFixed(2)}` : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-4 mb-6">
                  <div className="font-bold text-foreground">Quantity:</div>
                  <div className="flex items-center bg-white rounded-xl border border-border overflow-hidden shadow-sm">
                    <button
                      disabled={available === 0}
                      onClick={() => setQuantity(Math.max(1, selectedQuantity - 1))}
                      className="px-4 py-3 hover:bg-muted text-foreground transition-colors"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <div className="w-12 text-center font-bold text-lg">{selectedQuantity}</div>
                    <button
                      disabled={selectedQuantity >= available}
                      onClick={() => setQuantity(selectedQuantity + 1)}
                      className="px-4 py-3 hover:bg-muted text-foreground transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleAddToCart}
                  size="lg"
                  disabled={available === 0}
                  className="w-full rounded-2xl h-16 border-[#2D9950] bg-[#2D9950] text-lg font-bold text-white shadow-lg shadow-[#2D9950]/25 hover:-translate-y-1 focus-visible:ring-[#2D9950] transition-all"
                >
                  <ShoppingCart className="mr-2 h-5 w-5" /> Add to Cart
                </Button>
              </div>

              <p className="mb-4 text-sm font-semibold">
                <StockLabel product={product} />
              </p>

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
          <div className="absolute top-4 right-4 z-20 flex gap-2">
            <button className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors" onClick={(e) => { e.stopPropagation(); stepZoom(0.5); }} data-testid="lightbox-zoom-in"><ZoomIn className="h-5 w-5" /></button>
            <button className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors" onClick={(e) => { e.stopPropagation(); stepZoom(-0.5); }} data-testid="lightbox-zoom-out"><ZoomOut className="h-5 w-5" /></button>
            <button className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors" onClick={closeLightbox} data-testid="lightbox-close"><X className="h-5 w-5" /></button>
          </div>

          {zoom > 1 && (
            <div className="absolute top-4 left-4 z-20 rounded-full bg-white/20 px-3 py-1 text-sm text-white select-none">
              {Math.round(zoom * 100)}%
            </div>
          )}

          {/* Prev/Next in lightbox */}
          {images.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white hover:bg-white/30"
                onClick={(e) => { e.stopPropagation(); setSelectedIndex((i) => (i - 1 + images.length) % images.length); applyZoom(1); }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                className="absolute right-20 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white hover:bg-white/30"
                onClick={(e) => { e.stopPropagation(); setSelectedIndex((i) => (i + 1) % images.length); applyZoom(1); }}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap text-sm text-white/80 select-none">
            {images.length > 1 && <span>{selectedIndex + 1} / {images.length} &nbsp;·&nbsp; </span>}
            {zoom > 1
              ? "Scroll or drag to pan · Use +/− to zoom"
              : "Scroll to zoom in · Drag to pan when zoomed"}
            &nbsp;·&nbsp; Esc to close
          </div>

          {/* Thumbnail strip in lightbox */}
          {images.length > 1 && (
            <div className="absolute bottom-12 left-1/2 z-20 flex max-w-[90vw] -translate-x-1/2 gap-2 overflow-x-auto rounded-xl bg-black/50 p-2 backdrop-blur-sm">
              {images.map((url, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); setSelectedIndex(i); applyZoom(1); }}
                  className={`h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border transition-all ${i === selectedIndex ? "border-black scale-110" : "border-white/30 opacity-60 hover:opacity-100"}`}
                >
                  <img src={url} alt="" className="w-full h-full object-contain" style={{ backgroundColor: product.imageBackgroundColor ?? "#ffffff" }} />
                </button>
              ))}
            </div>
          )}

          {/* Image container */}
          <div
            ref={lightboxContainerRef}
            className={`absolute left-[5vw] right-[5vw] top-16 ${images.length > 1 ? "bottom-28" : "bottom-12"} z-0 flex items-center justify-center overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in" }}
          >
            <img
              ref={lightboxImageRef}
              src={currentImage}
              alt={product.name}
              draggable={false}
              className="select-none rounded-[1.5rem]"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
                backgroundColor: product.imageBackgroundColor ?? "#ffffff",
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
