import { MessageSquare } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ProblemReportButton() {
  const [open, setOpen] = useState(false);
  const report = api.contact.report;
  const send = useMutation({
    mutationFn: async (data: FormData) => {
      const input = report.input.safeParse({
        email: data.get("email"),
        message: data.get("message"),
        page: window.location.pathname.slice(0, 500),
      });
      if (!input.success) throw new Error(input.error.issues[0].message);

      const response = await fetch(report.path, {
        method: report.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      }).catch(() => null);
      if (response?.status !== 204) {
        throw new Error("We couldn't send your report. Please try again.");
      }
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!send.isPending) send.mutate(new FormData(event.currentTarget));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (send.isPending) return;
        if (nextOpen) send.reset();
        setOpen(nextOpen);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          aria-label="Report a problem with this website"
          className="group fixed bottom-5 right-5 z-40 h-12 w-12 justify-center overflow-hidden rounded-full border-[#D11C30] bg-[#D11C30] px-0 shadow-lg transition-[width,padding] duration-300 hover:border-[#D11C30] hover:bg-[#D11C30] hover:w-[13.75rem] hover:justify-start hover:px-5 focus-visible:border-[#D11C30] focus-visible:bg-[#D11C30] focus-visible:w-[13.75rem] focus-visible:justify-start focus-visible:px-5"
        >
          <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 group-hover:max-w-[10rem] group-hover:opacity-100 group-focus-visible:max-w-[10rem] group-focus-visible:opacity-100">
            Report a problem
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogDescription>Tell us what went wrong. We can reply to the email address you provide.</DialogDescription>
        </DialogHeader>
        {send.isSuccess ? (
          <p role="status" className="text-sm text-green-800">Thanks for letting us know. Your report was sent.</p>
        ) : (
          <form onSubmit={submit}>
            <fieldset disabled={send.isPending} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-email">Email address</Label>
                <Input id="report-email" name="email" type="email" autoComplete="email" required maxLength={254} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-message">What happened?</Label>
                <Textarea id="report-message" name="message" rows={6} required maxLength={10000} />
              </div>
              <Button type="submit">{send.isPending ? "Sending…" : "Send report"}</Button>
            </fieldset>
            {send.isError && <p role="alert" className="mt-4 text-sm text-destructive">{send.error.message}</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
