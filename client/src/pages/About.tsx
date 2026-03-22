export default function About() {
  return (
    <div className="min-h-screen py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-[3rem] p-8 sm:p-16 shadow-xl border-2 border-border overflow-hidden relative">

          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3"></div>

          <h1 className="font-display text-5xl font-bold mb-8 rainbow-text relative z-10 text-center">Our Story</h1>

          <div className="prose prose-lg mx-auto text-muted-foreground relative z-10">

            <p className="lead text-xl font-medium text-foreground mb-6">
              At STITCH, I have lovingly used my skills to craft these creations.
            </p>

            <p className="mb-6">
              My products are all handmade, with love and care put into every stitch. By making them this way, every item is made with character and a complete one-of-a-kind creation. From the very beginning, STITCH has been about having fun making quality products for your family to enjoy using.
            </p>

            <p className="mb-6">
              Children will love these handmade items as their toy is uniquely theirs, that they will have an individual connection with.
            </p>

            <div className="my-10 p-8 bg-muted/30 rounded-3xl border border-muted text-center">
              <p className="text-xl font-semibold text-foreground m-0">
                It's not just about selling toys and decorations. STITCH is about inspiring children and adults alike, to stay connected with their creative spirit.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
