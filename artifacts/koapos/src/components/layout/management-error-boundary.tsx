import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ManagementErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      "[ManagementErrorBoundary] Render exception:",
      error.message,
      info.componentStack,
    );
  }

  handleClearAndReload = () => {
    try { localStorage.clear(); } catch { /* noop */ }
    try { sessionStorage.clear(); } catch { /* noop */ }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-start justify-center p-6 md:p-12">
          <div className="w-full max-w-2xl mt-16 rounded-xl border border-destructive/40 bg-destructive/5 p-6 space-y-4 shadow-sm">

            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-destructive/10 shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-destructive">
                  Management Workspace Render Exception
                </h2>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  This management page encountered an unhandled render error.
                  No data has been modified. Navigate to another page or use
                  the button below to recover.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-muted/60 border px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Error Detail
              </p>
              <p className="font-mono text-xs text-foreground/80 break-all leading-relaxed">
                {this.state.error.message || String(this.state.error)}
              </p>
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button
                size="sm"
                variant="destructive"
                onClick={this.handleClearAndReload}
                className="gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Clear Cache &amp; Reload
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => this.setState({ error: null })}
              >
                Try Again
              </Button>
            </div>

          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
