import { useState, useRef, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAI } from "@/lib/ai-context";
import {
  Brain, TrendingUp, Package, Megaphone, Send, Trash2,
  AlertTriangle, Sparkles, RotateCcw, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useCreateOpenaiConversation, useDeleteOpenaiConversation, useSendOpenaiMessage, getOpenaiConversation } from "@workspace/api-client-react";

type Mode = "budget" | "stock" | "marketing";
type Message = { role: "user" | "assistant"; content: string };

interface Conversation {
  id: number;
  mode: string;
  title: string;
}

const MODES: { key: Mode; label: string; icon: React.ComponentType<{ className?: string }>; color: string; description: string; prompts: string[] }[] = [
  {
    key: "budget",
    label: "Budget & Profit Forecast",
    icon: TrendingUp,
    color: "text-emerald-600",
    description: "Financial forecasting, profit predictions, and budgeting advice based on your sales history.",
    prompts: [
      "Based on my sales data, predict my revenue for next month",
      "What are my biggest opportunities to improve profit margin?",
      "Estimate my annual revenue if current trends continue",
      "What budget should I allocate for restocking next quarter?",
    ],
  },
  {
    key: "stock",
    label: "Stock Order Recommendations",
    icon: Package,
    color: "text-blue-600",
    description: "Smart reorder suggestions based on low-stock levels, sales velocity, and lead times.",
    prompts: [
      "Which products should I reorder urgently this week?",
      "What quantities should I order for my low-stock items?",
      "Help me draft a purchase order for my top-selling products",
      "Which products have the worst stock health right now?",
    ],
  },
  {
    key: "marketing",
    label: "Marketing Ideas",
    icon: Megaphone,
    color: "text-purple-600",
    description: "Localised promotional angles, social media copy, and campaign ideas for Australian retail.",
    prompts: [
      "Give me 5 Instagram post ideas for this week",
      "Write a promotional SMS campaign for a weekend sale",
      "Suggest a loyalty promotion to bring back inactive customers",
      "Create some Google Business post ideas for local SEO",
    ],
  },
];

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-semibold mt-3 mb-1">{line.slice(4)}</h3>;
        if (line.startsWith("## "))  return <h2 key={i} className="text-sm font-bold mt-3 mb-1">{line.slice(3)}</h2>;
        if (line.startsWith("# "))   return <h2 key={i} className="text-base font-bold mt-3 mb-1">{line.slice(2)}</h2>;
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return <li key={i} className="ml-4 list-disc text-sm">{line.slice(2)}</li>;
        }
        if (/^\d+\.\s/.test(line)) {
          return <li key={i} className="ml-4 list-decimal text-sm">{line.replace(/^\d+\.\s/, "")}</li>;
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return <p key={i} className="font-semibold text-sm">{line.slice(2, -2)}</p>;
        }
        if (line === "") return <div key={i} className="h-2" />;
        return <p key={i} className="text-sm leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

export default function ManagementAIPage() {
  const { aiEnabled, isLoading: aiLoading, setAiEnabled } = useAI();
  const [activeMode, setActiveMode] = useState<Mode>("budget");
  const [conversations, setConversations] = useState<Record<Mode, Conversation | null>>({
    budget: null, stock: null, marketing: null,
  });
  const [messages, setMessages] = useState<Record<Mode, Message[]>>({
    budget: [], stock: [], marketing: [],
  });
  const [input, setInput] = useState("");
  const [isLoadingConv, setIsLoadingConv] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendMsgMutation = useSendOpenaiMessage();

  const currentMessages = messages[activeMode];
  const currentConversation = conversations[activeMode];
  const modeInfo = MODES.find(m => m.key === activeMode)!;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentMessages, sendMsgMutation.isPending]);

  const createConvMutation = useCreateOpenaiConversation();
  const deleteConvMutation = useDeleteOpenaiConversation();

  const loadOrCreateConversation = useCallback(async (mode: Mode) => {
    if (conversations[mode]) return conversations[mode];
    setIsLoadingConv(true);
    try {
      const conv = await createConvMutation.mutateAsync({ data: { mode } }) as Conversation;
      const detail = await getOpenaiConversation(conv.id) as { messages: Message[] };
      setConversations(prev => ({ ...prev, [mode]: conv }));
      setMessages(prev => ({ ...prev, [mode]: detail.messages ?? [] }));
      return conv;
    } catch {
      toast.error("Failed to load conversation");
      return null;
    } finally {
      setIsLoadingConv(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  useEffect(() => {
    if (aiEnabled) {
      loadOrCreateConversation(activeMode);
    }
  }, [activeMode, aiEnabled]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || sendMsgMutation.isPending) return;
    const conv = await loadOrCreateConversation(activeMode);
    if (!conv) return;

    const trimmed = content.trim();
    setMessages(prev => ({ ...prev, [activeMode]: [...prev[activeMode], { role: "user" as const, content: trimmed }] }));
    setInput("");

    try {
      const response = await sendMsgMutation.mutateAsync({ id: conv.id, data: { content: trimmed } }) as { role: string; content: string };
      setMessages(prev => ({ ...prev, [activeMode]: [...prev[activeMode], { role: "assistant" as const, content: response?.content ?? "" }] }));
    } catch {
      toast.error("Failed to get AI response");
      setMessages(prev => {
        const msgs = [...prev[activeMode]];
        msgs.pop();
        return { ...prev, [activeMode]: msgs };
      });
    }
  };

  const clearConversation = async () => {
    const conv = conversations[activeMode];
    if (!conv) return;
    try {
      await deleteConvMutation.mutateAsync({ id: conv.id });
      setConversations(prev => ({ ...prev, [activeMode]: null }));
      setMessages(prev => ({ ...prev, [activeMode]: [] }));
      await loadOrCreateConversation(activeMode);
      toast.success("Conversation cleared");
    } catch {
      toast.error("Failed to clear conversation");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const toggleAI = async (enabled: boolean) => {
    await setAiEnabled(enabled);
    toast.success(enabled ? "AI Features enabled" : "AI Features disabled — all AI functionality is now off");
  };

  return (
    <AppLayout>
      <div className="flex flex-col h-full w-full min-h-0">

        {/* ── Kill-switch banner ────────────────────────────────────────── */}
        <div className={cn(
          "border-b px-6 py-4 transition-colors",
          aiEnabled ? "bg-background" : "bg-destructive/5 border-destructive/30",
        )}>
          <div className="flex items-center justify-between gap-4 max-w-none">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                aiEnabled ? "bg-primary/10" : "bg-destructive/10",
              )}>
                {aiEnabled
                  ? <Brain className="h-5 w-5 text-primary" />
                  : <AlertTriangle className="h-5 w-5 text-destructive" />
                }
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Enable AI Features Application-Wide</span>
                  <Badge variant={aiEnabled ? "default" : "destructive"} className="text-[10px] h-4">
                    {aiEnabled ? "ACTIVE" : "DISABLED"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {aiEnabled
                    ? "AI features are active. All data sent to the AI is anonymised and aggregated."
                    : "AI features are completely off. No data is transmitted to any AI service and all AI prompts are hidden."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Label htmlFor="ai-master-toggle" className="text-sm font-medium sr-only">
                Master AI Toggle
              </Label>
              <Switch
                id="ai-master-toggle"
                checked={aiEnabled}
                onCheckedChange={toggleAI}
                disabled={aiLoading}
                className="data-[state=checked]:bg-primary"
              />
            </div>
          </div>
        </div>

        {/* ── Disabled state ────────────────────────────────────────────── */}
        {!aiEnabled && (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center max-w-md">
              <div className="mx-auto mb-4 p-4 bg-muted rounded-full w-fit">
                <Brain className="h-10 w-10 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">AI Features Disabled</h2>
              <p className="text-muted-foreground text-sm mb-6">
                Toggle the master switch above to re-enable the AI assistant. When disabled, no data is sent to any external AI service.
              </p>
              <Button onClick={() => toggleAI(true)} variant="outline">
                <Sparkles className="h-4 w-4 mr-2" />
                Enable AI Features
              </Button>
            </div>
          </div>
        )}

        {/* ── Main AI interface ─────────────────────────────────────────── */}
        {aiEnabled && (
          <div className="flex flex-1 min-h-0">

            {/* ── Mode sidebar ───────────────────────────────────────────── */}
            <div className="w-72 shrink-0 border-r flex flex-col">
              <div className="p-4 border-b">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Modes
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose an analytics mode
                </p>
              </div>
              <div className="p-3 flex-1 space-y-1.5">
                {MODES.map(mode => {
                  const Icon = mode.icon;
                  const isActive = activeMode === mode.key;
                  const msgCount = messages[mode.key].length;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => setActiveMode(mode.key)}
                      className={cn(
                        "w-full text-left rounded-lg p-3 transition-all border",
                        isActive
                          ? "bg-primary/5 border-primary/30 shadow-sm"
                          : "border-transparent hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", isActive ? mode.color : "text-muted-foreground")} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-medium leading-tight">{mode.label}</span>
                            {isActive && <ChevronRight className="h-3 w-3 text-primary shrink-0" />}
                          </div>
                          {msgCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {Math.floor(msgCount / 2)} exchange{msgCount > 2 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="p-3 border-t">
                <div className="rounded-md bg-muted/50 p-3">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Data sent to the AI is aggregated and anonymised. No individual customer PII is included.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Chat area ─────────────────────────────────────────────── */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0">

              {/* Mode header */}
              <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/20 shrink-0">
                <div className="flex items-center gap-2.5">
                  <modeInfo.icon className={cn("h-4 w-4", modeInfo.color)} />
                  <div>
                    <h3 className="font-semibold text-sm">{modeInfo.label}</h3>
                    <p className="text-xs text-muted-foreground">{modeInfo.description}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearConversation}
                  className="text-muted-foreground hover:text-destructive h-7 px-2 gap-1.5"
                  disabled={currentMessages.length === 0}
                >
                  <RotateCcw className="h-3 w-3" />
                  <span className="text-xs">Clear</span>
                </Button>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
                {isLoadingConv && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <span className="text-sm">Loading conversation…</span>
                  </div>
                )}

                {/* Empty state with quick prompts */}
                {!isLoadingConv && currentMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-6">
                    <div className="text-center">
                      <div className="mx-auto mb-3 p-3 bg-primary/5 rounded-full w-fit">
                        <modeInfo.icon className={cn("h-8 w-8", modeInfo.color)} />
                      </div>
                      <h3 className="font-semibold text-base mb-1">{modeInfo.label}</h3>
                      <p className="text-sm text-muted-foreground max-w-sm">{modeInfo.description}</p>
                    </div>
                    <div className="w-full max-w-lg space-y-2">
                      <p className="text-xs font-medium text-muted-foreground text-center uppercase tracking-wide mb-3">
                        Suggested prompts
                      </p>
                      {modeInfo.prompts.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(prompt)}
                          className="w-full text-left text-sm px-4 py-2.5 rounded-lg border border-dashed hover:border-primary/50 hover:bg-primary/5 transition-colors flex items-center gap-2 group"
                        >
                          <Send className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message list */}
                {currentMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      msg.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Brain className="h-3.5 w-3.5 text-primary" />
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[78%] rounded-xl px-4 py-3",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground text-sm"
                        : "bg-muted/60 border",
                    )}>
                      {msg.role === "user"
                        ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        : msg.content
                          ? <MarkdownText text={msg.content} />
                          : (
                            <div className="flex items-center gap-1.5 py-1">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
                              <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:150ms]" />
                              <div className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce [animation-delay:300ms]" />
                            </div>
                          )
                      }
                    </div>
                    {msg.role === "user" && (
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-bold">You</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Separator />

              {/* Input area */}
              <div className="px-5 py-4 shrink-0 bg-background">
                {currentMessages.length > 0 && !sendMsgMutation.isPending && (
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {modeInfo.prompts.slice(0, 2).map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(prompt)}
                        className="text-[11px] px-2.5 py-1 rounded-full border bg-muted/50 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {prompt.length > 45 ? prompt.slice(0, 45) + "…" : prompt}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <Textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Ask anything about ${modeInfo.label.toLowerCase()}… (Enter to send, Shift+Enter for new line)`}
                    rows={2}
                    disabled={sendMsgMutation.isPending}
                    className="resize-none flex-1 text-sm min-h-[60px] max-h-[140px]"
                  />
                  <Button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || sendMsgMutation.isPending}
                    size="icon"
                    className="h-[60px] w-10 shrink-0"
                  >
                    {sendMsgMutation.isPending
                      ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                      : <Send className="h-4 w-4" />
                    }
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  AI can make mistakes. Always verify important financial decisions with a qualified professional.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
