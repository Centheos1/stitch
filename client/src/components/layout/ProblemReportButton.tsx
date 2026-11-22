import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProblemReportButton() {
  const email = "hello@stitchhandmade.com";
  const subject = encodeURIComponent("Website problem report");
  const body = encodeURIComponent(`Page: ${window.location.href}\n\nProblem:\n`);

  return (
    <Button
      asChild
      className="group fixed bottom-5 right-5 z-40 h-12 w-12 justify-center overflow-hidden rounded-full px-0 shadow-lg transition-[width,padding] duration-300 hover:w-[13.75rem] hover:justify-start hover:px-5 focus-visible:w-[13.75rem] focus-visible:justify-start focus-visible:px-5"
    >
      <a href={`mailto:${email}?subject=${subject}&body=${body}`} aria-label="Report a problem with this website">
        <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 group-hover:max-w-[10rem] group-hover:opacity-100 group-focus-visible:max-w-[10rem] group-focus-visible:opacity-100">
          Report a problem
        </span>
      </a>
    </Button>
  );
}
